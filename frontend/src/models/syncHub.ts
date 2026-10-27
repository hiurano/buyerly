import {
  applyChanges, databaseName, openScope, readAll, replaceModels, writeValue,
  type StoredChange, type StoredSync,
} from './localDatabase';
import {
  SYNC_CHANNEL, wipes,
  type HubMessage, type HubRequest, type HubResponse, type SharedTransaction, type SyncAction,
  type SyncRow, type SyncStatus, type TabMessage, type WipeMessage,
} from './syncProtocol';

/**
 * The sync connection of one workspace for all its open tabs, as Linear's
 * SharedWorker (#498): one socket, one stream of changes, one writer of the
 * local database. Each tab joins it and is sent every model held, then each
 * batch of changes applied; a change pushed by the server shows in every tab
 * at once. The tabs' writes (#508) are sent through it too, and each tab is
 * shown the others' until the sync engine holds them.
 *
 * It runs in a SharedWorker (syncWorker.ts) where the browser has one, else in
 * the tab itself (syncTransport.ts), so it knows nothing of the page: no pool,
 * no cookies, no window. What it needs of the tab comes with `join`.
 *
 * The connection is as it was in the tab (#507): the models are read once
 * with /api/sync/bootstrap, then kept current by /api/sync/ws from the last
 * sync id held; a dropped socket opens again from it and the server sends what
 * was missed first. With the models kept in IndexedDB (#496) a start reads
 * them there, with no bootstrap.
 */

interface Bootstrap {
  last_sync_id: number;
  sync_groups: string[];
  models: Record<string, SyncRow[]>;
}

type SocketMessage =
  | { type: 'delta'; actions: SyncAction[]; last_sync_id: number }
  | { type: 'caught_up'; last_sync_id: number }
  | { type: 'sync_groups'; sync_groups: string[]; added: string[]; removed: string[] }
  | { type: 'ping' }
  | { type: 'pong' };

/** A tab joined: how the hub talks to it. */
export interface HubPeer {
  post(message: HubMessage): void;
}

// Close codes of /api/sync/ws (api/sync_stream.py).
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_NOT_FOUND = 4404;
const CLOSE_BOOTSTRAP = 4410;

/** Waits before opening again: doubling from the first, never longer than the last. */
const RETRY_MS = [500, 1_000, 2_000, 5_000, 10_000, 30_000];
/** A tab silent this long is gone (it closed without saying so). Hidden tabs' timers run once a minute. */
export const PEER_TIMEOUT_MS = 5 * 60_000;
/**
 * Writes the last visit left unsent are handed to a tab at once, drawn in the
 * first frame after a reload; but when a tab joins again after the worker
 * restarted, this long after the hub started: the other tabs that held them
 * join again first and keep their own, so none is sent twice.
 */
export const ADOPT_DELAY_MS = 3_000;

const TRANSACTIONS_KEY = 'transactions';

export interface HubEnvironment {
  /** The page's origin, for the socket's address. */
  origin: string;
  fetch: typeof fetch;
  WebSocket: typeof WebSocket | undefined;
  /** Opens the scope's database; null without IndexedDB. */
  openDatabase: (scope: string) => Promise<IDBDatabase | null>;
  now: () => number;
}

export const browserEnvironment = (): HubEnvironment => ({
  origin: globalThis.location?.origin ?? '',
  fetch: (...args) => globalThis.fetch(...args),
  WebSocket: typeof WebSocket === 'undefined' ? undefined : WebSocket,
  openDatabase: (scope) => (typeof indexedDB === 'undefined' || indexedDB === null
    ? Promise.resolve(null)
    : openScope(databaseName(scope)).catch(() => null)),
  now: () => Date.now(),
});

export class SyncHub {
  readonly scope: string;
  #slug = '';
  #account: number | null = null;
  #headers: Record<string, string> = {};
  readonly #env: HubEnvironment;

  #models: Map<string, Map<number, SyncRow>> | null = null;
  #lastSyncId = 0;
  #syncGroups: string[] = [];
  #status: SyncStatus;
  #live = false;
  #booting: boolean;

  #db: Promise<IDBDatabase | null> = Promise.resolve(null);
  #socket: WebSocket | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #attempt = 0;
  /** Bumped by every bootstrap and stop: an answer or socket of an earlier one is dropped. */
  #generation = 0;
  #started = false;
  #stopped = false;

  readonly #peers = new Map<string, { peer: HubPeer; seen: number; pending: SharedTransaction[] }>();
  /** Unsent writes no open tab holds: of a tab that closed, or of the last visit. */
  #orphans: SharedTransaction[] = [];
  #adoptAfter = 0;
  #adoptTimer: ReturnType<typeof setTimeout> | null = null;
  /** Called when the last tab left or the hub stopped: the host lets it go. */
  onEmpty: () => void = () => {};

  constructor(scope: string, env: HubEnvironment) {
    this.scope = scope;
    this.#env = env;
    // Without a socket there are no models to wait for: the pages read the server.
    this.#status = env.WebSocket ? 'connecting' : 'off';
    this.#booting = Boolean(env.WebSocket);
  }

  get peerCount(): number {
    return this.#peers.size;
  }

  receive(peer: HubPeer, message: TabMessage) {
    if (this.#stopped) return;
    if (message.type === 'join') {
      this.#join(peer, message);
      return;
    }
    const held = this.#peers.get(message.tab);
    if (!held) {
      // Dropped as gone (a hidden tab whose timers slept): it joins again and is sent everything.
      if (message.type !== 'leave') peer.post({ type: 'unknown' });
      if (message.type === 'request') peer.post({ type: 'response', id: message.id, response: { error: 'The sync hub restarted.' } });
      return;
    }
    held.seen = this.#env.now();
    if (message.type === 'ping') peer.post({ type: 'pong' });
    else if (message.type === 'leave') this.#leave(message.tab);
    else if (message.type === 'pending') {
      held.pending = message.transactions;
      this.#transactionsChanged();
    } else if (message.type === 'request') {
      void this.#request(message.request).then((response) => peer.post({ type: 'response', id: message.id, response }));
    }
  }

  /** Drops the tabs not heard from for a while; the host calls it now and then. */
  sweep() {
    const now = this.#env.now();
    for (const [tab, { seen }] of [...this.#peers]) if (now - seen > PEER_TIMEOUT_MS) this.#leave(tab);
  }

  /** Signed out: the connection closes and nothing more is written; the tabs read the server and leave. */
  wipe(message: WipeMessage) {
    if (!wipes(message, this.scope)) return;
    this.#stop();
    this.#status = 'off';
    this.#live = false;
    this.#booting = false;
    this.#broadcastStatus();
    this.#peers.clear();
    this.onEmpty();
  }

  #join(peer: HubPeer, message: Extract<TabMessage, { type: 'join' }>) {
    this.#slug = message.slug;
    this.#account = message.account;
    this.#headers = message.headers;
    this.#peers.set(message.tab, { peer, seen: this.#env.now(), pending: message.pending });
    // A tab that held a write the hub kept as unsent (a restarted worker) sends it itself.
    const own = new Set(message.pending.map((transaction) => transaction.id));
    this.#orphans = this.#orphans.filter((transaction) => !own.has(transaction.id));
    if (this.#models) peer.post(this.#holdMessage());
    peer.post(this.#statusMessage());
    if (!this.#started) this.#start(message.rejoin);
    this.#adopt();
    this.#transactionsChanged();
  }

  #leave(tab: string) {
    const held = this.#peers.get(tab);
    if (!held) return;
    this.#peers.delete(tab);
    // Its unsent writes go to another tab, or wait in the local database for the next visit.
    this.#orphans.push(...held.pending.filter((transaction) => transaction.state === 'queued'));
    if (this.#peers.size === 0) {
      void this.#writeTransactions();
      this.#stop();
      this.onEmpty();
      return;
    }
    this.#adopt();
    this.#transactionsChanged();
  }

  /** Hands the orphaned writes to a tab, which sends them. */
  #adopt() {
    if (this.#orphans.length === 0 || this.#peers.size === 0) return;
    const wait = this.#adoptAfter - this.#env.now();
    if (wait > 0) {
      if (this.#adoptTimer === null) {
        this.#adoptTimer = setTimeout(() => {
          this.#adoptTimer = null;
          if (!this.#stopped) {
            this.#adopt();
            this.#transactionsChanged();
          }
        }, wait);
      }
      return;
    }
    const [first] = this.#peers.values();
    first.peer.post({ type: 'adopt', transactions: this.#orphans });
    // Until it announces them as its own, they stay kept as orphans' are.
    first.pending = [...first.pending, ...this.#orphans];
    this.#orphans = [];
  }

  /** Every tab is shown the others' writes, and all of them are kept for the next visit. */
  #transactionsChanged() {
    for (const [tab, { peer }] of this.#peers) {
      const others = [...this.#peers].filter(([other]) => other !== tab).flatMap(([, held]) => held.pending);
      peer.post({ type: 'peers', transactions: others });
    }
    void this.#writeTransactions();
  }

  async #writeTransactions() {
    const all = [...this.#orphans, ...[...this.#peers.values()].flatMap((held) => held.pending)];
    // Written after the last tab left too: the hub closes its database once this is in.
    const db = await this.#db;
    if (db) await writeValue(db, TRANSACTIONS_KEY, all);
  }

  async #request(request: HubRequest): Promise<HubResponse> {
    try {
      const response = await this.#env.fetch(request.path, {
        method: request.method,
        headers: new Headers(request.headers),
        body: request.body,
        credentials: 'include',
      });
      const body: unknown = await response.json().catch(() => ({}));
      return { status: response.status, body };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  // The connection.

  #start(rejoin: boolean) {
    this.#started = true;
    this.#adoptAfter = rejoin ? this.#env.now() + ADOPT_DELAY_MS : 0;
    this.#db = this.#env.openDatabase(this.scope);
    const { WebSocket } = this.#env;
    void this.#db.then(async (db) => {
      const local = db ? await readAll(db).catch(() => null) : null;
      if (this.#stopped) return;
      const kept = local?.values.get(TRANSACTIONS_KEY);
      if (Array.isArray(kept)) {
        const held = new Set([...this.#peers.values()].flatMap((peer) => peer.pending.map((transaction) => transaction.id)));
        this.#orphans.push(...(kept as SharedTransaction[]).filter((transaction) => (
          transaction?.state === 'queued' && !held.has(transaction.id)
        )));
        this.#adopt();
      }
      if (!WebSocket) return;
      if (local?.sync && local.models.size > 0) {
        this.#hold(local.models, local.sync.lastSyncId, local.sync.syncGroups);
        this.#setStatus(this.#status, { booting: false });
        this.#connect();
        return;
      }
      void this.#bootstrap();
    });
  }

  #stop() {
    this.#stopped = true;
    this.#generation += 1;
    if (this.#retry) clearTimeout(this.#retry);
    if (this.#adoptTimer) clearTimeout(this.#adoptTimer);
    this.#retry = null;
    this.#adoptTimer = null;
    const socket = this.#socket;
    this.#socket = null;
    if (socket) socket.close(1000);
    void this.#db.then((db) => db?.close());
  }

  #current(generation: number) {
    return generation === this.#generation && !this.#stopped;
  }

  async #bootstrap() {
    const generation = this.#generation;
    this.#setStatus(this.#status === 'offline' ? 'offline' : 'connecting', { booting: true, live: false });
    const answer = await this.#request({ path: '/api/sync/bootstrap', method: 'GET', headers: this.#headers });
    if (!this.#current(generation)) return;
    const data = 'status' in answer && answer.status < 400 ? answer.body as Bootstrap : null;
    if (data?.models) {
      this.#take(data);
      // The pages waiting for it read the models now.
      this.#setStatus(this.#status, { booting: false });
      this.#connect();
      return;
    }
    // A server without the sync engine, or a member it can't serve: the pages read the server as before.
    const status = 'status' in answer ? answer.status : 0;
    if (data || status === 401 || status === 403 || status === 404) {
      this.#setStatus('off', { booting: false });
      return;
    }
    this.#setStatus('offline', { booting: false });
    this.#later(() => void this.#bootstrap());
  }

  #take(bootstrap: Bootstrap) {
    const models = new Map<string, Map<number, SyncRow>>();
    for (const [model, rows] of Object.entries(bootstrap.models)) {
      models.set(model, new Map(rows.map((row) => [row.id, row])));
    }
    this.#hold(models, bootstrap.last_sync_id, bootstrap.sync_groups);
    void this.#db.then((db) => (db && !this.#stopped ? replaceModels(db, models, this.#stored()) : undefined));
  }

  /** Holds a whole set of models, from bootstrap or as the local database kept them, and sends them to every tab. */
  #hold(models: Map<string, Map<number, SyncRow>>, lastSyncId: number, syncGroups: string[]) {
    this.#models = models;
    this.#lastSyncId = lastSyncId;
    this.#syncGroups = syncGroups;
    this.#broadcast(this.#holdMessage());
  }

  #holdMessage(): HubMessage {
    const models: Record<string, SyncRow[]> = {};
    for (const [model, rows] of this.#models ?? []) models[model] = [...rows.values()];
    return { type: 'hold', models, lastSyncId: this.#lastSyncId, syncGroups: this.#syncGroups };
  }

  #stored(): StoredSync {
    return { lastSyncId: this.#lastSyncId, syncGroups: this.#syncGroups, models: [...(this.#models?.keys() ?? [])] };
  }

  /** Applies changes from the log in order, skipping any already held; the tabs are sent what was applied. */
  apply(actions: SyncAction[], lastSyncId: number) {
    const applied: SyncAction[] = [];
    const stored: StoredChange[] = [];
    const held = this.#lastSyncId;
    for (const change of actions) {
      if (change.sync_id <= this.#lastSyncId) continue;
      applied.push(change);
      const rows = this.#models?.get(change.model);
      if (rows) {
        const id = Number(change.model_id);
        if (change.action === 'delete') {
          rows.delete(id);
          stored.push({ model: change.model, id, row: null });
        } else {
          const row = { ...rows.get(id), ...change.data, id } as SyncRow;
          rows.set(id, row);
          stored.push({ model: change.model, id, row });
        }
      }
      this.#lastSyncId = change.sync_id;
    }
    this.#lastSyncId = Math.max(this.#lastSyncId, lastSyncId);
    if (this.#lastSyncId === held) return;
    // The rows and the sync id they reach are kept together: a reload catches up from exactly there.
    const sync = this.#stored();
    void this.#db.then((db) => (db && !this.#stopped ? applyChanges(db, stored, sync) : undefined));
    this.#broadcast({ type: 'delta', actions: applied, lastSyncId: this.#lastSyncId });
  }

  #connect() {
    const { WebSocket } = this.#env;
    if (!WebSocket) return;
    const generation = this.#generation;
    const params = new URLSearchParams({ since: String(this.#lastSyncId), workspace: this.#slug });
    if (this.#account !== null) params.set('account', String(this.#account));
    const origin = new URL(this.#env.origin);
    const protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${origin.host}/api/sync/ws?${params}`);
    this.#socket = socket;
    this.#setStatus(this.#attempt === 0 ? 'connecting' : 'offline');
    socket.onmessage = (event) => {
      if (this.#current(generation)) this.#receiveSocket(JSON.parse(String(event.data)) as SocketMessage);
    };
    socket.onclose = (event) => {
      if (!this.#current(generation)) return;
      this.#socket = null;
      this.#closed(event.code);
    };
  }

  #receiveSocket(message: SocketMessage) {
    if (message.type === 'delta') {
      this.apply(message.actions, message.last_sync_id);
    } else if (message.type === 'caught_up') {
      this.apply([], message.last_sync_id);
      this.#attempt = 0;
      this.#setStatus('synced', { live: true });
    } else if (message.type === 'sync_groups' && (message.added.length > 0 || message.removed.length > 0)) {
      this.#syncGroups = message.sync_groups;
      // There's no bootstrap of one group yet: the member's data is read whole again.
      this.#rebootstrap();
    }
  }

  #closed(code: number) {
    if (code === CLOSE_UNAUTHORIZED || code === CLOSE_FORBIDDEN || code === CLOSE_NOT_FOUND) {
      // Signed out or out of the workspace: the app finds out with its next request and leaves.
      this.#setStatus('off', { live: false });
      return;
    }
    if (code === CLOSE_BOOTSTRAP) {
      this.#rebootstrap();
      return;
    }
    this.#setStatus('offline', { live: false });
    this.#later(() => this.#connect());
  }

  #rebootstrap() {
    const socket = this.#socket;
    this.#generation += 1;
    this.#socket = null;
    if (socket) socket.close(1000);
    this.#setStatus('connecting', { live: false });
    void this.#bootstrap();
  }

  #later(run: () => void) {
    const generation = this.#generation;
    const wait = RETRY_MS[Math.min(this.#attempt, RETRY_MS.length - 1)];
    this.#attempt += 1;
    this.#retry = setTimeout(() => {
      this.#retry = null;
      if (this.#current(generation)) run();
    }, wait);
  }

  #setStatus(status: SyncStatus, { live = this.#live, booting = this.#booting } = {}) {
    if (status === this.#status && live === this.#live && booting === this.#booting) return;
    this.#status = status;
    this.#live = live;
    this.#booting = booting;
    this.#broadcastStatus();
  }

  #statusMessage(): HubMessage {
    return { type: 'status', status: this.#status, live: this.#live, booting: this.#booting };
  }

  #broadcastStatus() {
    this.#broadcast(this.#statusMessage());
  }

  #broadcast(message: HubMessage) {
    for (const { peer } of this.#peers.values()) peer.post(message);
  }
}

/**
 * The hubs of one place, by scope: a SharedWorker holds those of the tabs
 * that share it, a tab without one holds its own.
 */
export class SyncHost {
  readonly #hubs = new Map<string, SyncHub>();
  /** Which hub each tab is in, for its messages after `join`. */
  readonly #tabs = new Map<string, SyncHub>();
  readonly #env: HubEnvironment;

  constructor(env: HubEnvironment) {
    this.#env = env;
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(SYNC_CHANNEL);
      channel.onmessage = (event: MessageEvent<WipeMessage>) => {
        if (event.data?.type === 'wipe') this.wipe(event.data);
      };
      // Node's keeps the process alive; the node checks run a hub too.
      (channel as { unref?: () => void }).unref?.();
    }
  }

  get scopes(): string[] {
    return [...this.#hubs.keys()];
  }

  receive(peer: HubPeer, message: TabMessage) {
    if (message.type === 'join') {
      // A tab opening another workspace leaves the one it had.
      const previous = this.#tabs.get(message.tab);
      if (previous && previous.scope !== message.scope) previous.receive(peer, { type: 'leave', tab: message.tab });
      let hub = this.#hubs.get(message.scope);
      if (!hub) {
        const made = new SyncHub(message.scope, this.#env);
        made.onEmpty = () => {
          if (this.#hubs.get(made.scope) === made) this.#hubs.delete(made.scope);
          for (const [tab, held] of [...this.#tabs]) if (held === made) this.#tabs.delete(tab);
        };
        this.#hubs.set(message.scope, made);
        hub = made;
      }
      this.#tabs.set(message.tab, hub);
      hub.receive(peer, message);
      return;
    }
    const hub = this.#tabs.get(message.tab);
    if (!hub) {
      if (message.type !== 'leave') peer.post({ type: 'unknown' });
      if (message.type === 'request') peer.post({ type: 'response', id: message.id, response: { error: 'The sync hub restarted.' } });
      return;
    }
    if (message.type === 'leave') this.#tabs.delete(message.tab);
    hub.receive(peer, message);
  }

  sweep() {
    for (const hub of [...this.#hubs.values()]) hub.sweep();
  }

  wipe(message: WipeMessage) {
    for (const hub of [...this.#hubs.values()]) hub.wipe(message);
  }
}
