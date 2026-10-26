import { apiRequest, ApiError } from '@/lib/api';
import { requestAccount } from '@/lib/accounts';
import { runInAction } from 'mobx';
import { localDatabase, type LocalData, type StoredChange } from './localDatabase';
import { pool, type PoolSnapshot } from './pool';
import { makeStore, useStore } from './store';

/**
 * The client of the sync engine, as Linear's (#507): the workspace's synced
 * models are read once with /api/sync/bootstrap, then kept current by the
 * changes /api/sync/ws pushes after the last sync id held. A dropped socket
 * opens again from that id and the server sends what was missed first
 * (catch-up), so nothing is read twice and nothing is lost.
 *
 * Rows are held as the server sends them, one map per model. The pages'
 * lists are derived from them (syncedLists.ts) into the pool, which is told
 * after every change applied; the pool redraws only what changed.
 *
 * The rows and the sync id are kept in IndexedDB between visits (#496): a
 * reload opens on them with no bootstrap, and the socket asks only for what
 * changed since. #498 shares one socket between tabs, #508 sends writes as
 * transactions.
 */

/** A row of a synced model, as bootstrap and the change log give it. */
export type SyncRow = Record<string, unknown> & { id: number };

/** One change from the log, as /api/sync/ws and /api/sync/delta send it. */
export interface SyncAction {
  sync_id: number;
  model: string;
  model_id: string;
  action: 'insert' | 'update' | 'archive' | 'delete';
  data: Record<string, unknown> | null;
}

interface Bootstrap {
  last_sync_id: number;
  sync_groups: string[];
  models: Record<string, SyncRow[]>;
}

type SyncMessage =
  | { type: 'delta'; actions: SyncAction[]; last_sync_id: number }
  | { type: 'caught_up'; last_sync_id: number }
  | { type: 'sync_groups'; sync_groups: string[]; added: string[]; removed: string[] }
  | { type: 'ping' }
  | { type: 'pong' };

/**
 * What the app shows of it, as Linear's: `connecting` until the socket is
 * open and caught up, `synced` while changes come as they happen, `offline`
 * while it waits to open again. `off` with no workspace open, or when the
 * server has no sync engine for it.
 */
export type SyncStatus = 'off' | 'connecting' | 'synced' | 'offline';

// Close codes of /api/sync/ws (api/sync_stream.py).
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_NOT_FOUND = 4404;
const CLOSE_BOOTSTRAP = 4410;

/** Waits before opening again: doubling from the first, never longer than the last. */
const RETRY_MS = [500, 1_000, 2_000, 5_000, 10_000, 30_000];

export class SyncClient {
  status: SyncStatus = 'off';
  /** The newest change held; the socket opens again from it. */
  lastSyncId = 0;

  #scope: string | null = null;
  #slug = '';
  #models = new Map<string, Map<number, SyncRow>>();
  #userId: number | null = null;
  #syncGroups: string[] = [];
  #socket: WebSocket | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #attempt = 0;
  /** Bumped by every open and stop: an answer or socket of an earlier one is dropped. */
  #generation = 0;
  readonly #listeners: ((actions: SyncAction[]) => void)[] = [];

  constructor() {
    makeStore(this);
  }

  /** Opens the workspace's models (scope as the pool's), or closes them with null. */
  open(scope: string | null, slug: string | null) {
    if (scope === this.#scope) return;
    this.#close();
    this.#scope = scope;
    this.#slug = slug ?? '';
    this.#models = new Map();
    this.#userId = null;
    this.#syncGroups = [];
    this.lastSyncId = 0;
    pool.sync.live = false;
    const local = localDatabase.open(scope);
    // Nothing kept and no socket to keep it current: the pages read the server, as before.
    if (scope === null || (typeof WebSocket === 'undefined' && !localDatabase.available)) {
      this.#setStatus('off');
      pool.sync.booting = null;
      return;
    }
    this.#setStatus(typeof WebSocket === 'undefined' ? 'off' : 'connecting');
    void this.#start(scope, local);
  }

  /** A model's rows, or undefined when bootstrap didn't give that model (no sync engine for it here). */
  rows(model: string): SyncRow[] | undefined {
    const rows = this.#models.get(model);
    return rows ? [...rows.values()] : undefined;
  }

  /** The signed-in member's user id in this workspace, from the member group bootstrap names. */
  get userId(): number | null {
    return this.#userId;
  }

  /** Calls back with every batch of changes applied, for lists the pool still reads from the server. */
  onChanges(listener: (actions: SyncAction[]) => void) {
    this.#listeners.push(listener);
  }

  /** Applies changes from the log in order, skipping any already held; then the pool reads its lists again. */
  apply(actions: SyncAction[], lastSyncId: number) {
    const applied: SyncAction[] = [];
    const stored: StoredChange[] = [];
    const held = this.lastSyncId;
    for (const change of actions) {
      if (change.sync_id <= this.lastSyncId) continue;
      applied.push(change);
      const rows = this.#models.get(change.model);
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
      this.lastSyncId = change.sync_id;
    }
    this.lastSyncId = Math.max(this.lastSyncId, lastSyncId);
    // The rows and the sync id they reach are kept together: a reload catches up from exactly there.
    if (this.lastSyncId > held) localDatabase.applyChanges(stored, { lastSyncId: this.lastSyncId, syncGroups: this.#syncGroups });
    pool.syncChanged();
    if (applied.length > 0) for (const listener of this.#listeners) listener(applied);
  }

  #close() {
    this.#generation += 1;
    if (this.#retry) clearTimeout(this.#retry);
    this.#retry = null;
    this.#attempt = 0;
    const socket = this.#socket;
    this.#socket = null;
    if (socket) socket.close(1000);
  }

  #current(generation: number) {
    return generation === this.#generation;
  }

  /**
   * Opens on what the local database kept, as Linear does: the pool holds it
   * before any page is drawn, and the socket asks only for what changed since
   * its sync id. With nothing kept the workspace is bootstrapped.
   */
  async #start(scope: string, reading: Promise<LocalData | null>) {
    const generation = this.#generation;
    let settle = () => {};
    const booting = new Promise<void>((resolve) => { settle = resolve; });
    pool.sync.booting = booting;
    const local = await reading;
    if (!this.#current(generation)) {
      settle();
      return;
    }
    if (local) {
      const snapshot = local.values.get('pool') as PoolSnapshot | undefined;
      if (snapshot) pool.hydrate(scope, snapshot);
      localDatabase.hydrate(local);
    }
    if (typeof WebSocket === 'undefined') {
      // Without a socket the models couldn't be kept current: the pages read the server.
      if (pool.sync.booting === booting) pool.sync.booting = null;
      settle();
      return;
    }
    if (local?.sync && local.models.size > 0) {
      this.#hold(local.models, local.sync.lastSyncId, local.sync.syncGroups);
      if (pool.sync.booting === booting) pool.sync.booting = null;
      settle();
      this.#connect();
      return;
    }
    // A bootstrap of its own takes over before this settles, so the pages waiting go on waiting for it.
    void this.#bootstrap();
    settle();
  }

  async #bootstrap() {
    const generation = this.#generation;
    let settle = () => {};
    const booting = new Promise<void>((resolve) => { settle = resolve; });
    pool.sync.booting = booting;
    const answer = await apiRequest<Bootstrap>('/api/sync/bootstrap').then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error }),
    );
    if (pool.sync.booting === booting) pool.sync.booting = null;
    if (!this.#current(generation)) {
      settle();
      return;
    }
    if (answer.data?.models) this.#take(answer.data);
    // The pages waiting for it read the models now, or the server when there are none.
    settle();
    if (answer.data?.models) {
      this.#connect();
      return;
    }
    // A server without the sync engine, or a member it can't serve: the pages read the server as before.
    const status = answer.error instanceof ApiError ? answer.error.status : 0;
    if (answer.data || status === 401 || status === 403 || status === 404) {
      this.#setStatus('off');
      return;
    }
    this.#setStatus('offline');
    this.#later(() => void this.#bootstrap());
  }

  #setStatus(status: SyncStatus) {
    runInAction(() => { this.status = status; });
  }

  #take(bootstrap: Bootstrap) {
    const models = new Map<string, Map<number, SyncRow>>();
    for (const [model, rows] of Object.entries(bootstrap.models)) {
      models.set(model, new Map(rows.map((row) => [row.id, row])));
    }
    this.#hold(models, bootstrap.last_sync_id, bootstrap.sync_groups);
    localDatabase.replaceModels(models, { lastSyncId: bootstrap.last_sync_id, syncGroups: bootstrap.sync_groups });
  }

  /** Holds a whole set of models, from bootstrap or as the local database kept them. */
  #hold(models: Map<string, Map<number, SyncRow>>, lastSyncId: number, syncGroups: string[]) {
    this.#models = models;
    this.#syncGroups = syncGroups;
    runInAction(() => { this.lastSyncId = lastSyncId; });
    const memberGroup = syncGroups.find((group) => group.startsWith('member:'));
    const member = memberGroup ? models.get('WorkspaceMember')?.get(Number(memberGroup.slice('member:'.length))) : undefined;
    this.#userId = member ? Number(member.user_id) : null;
    pool.syncChanged();
  }

  #connect() {
    const generation = this.#generation;
    const params = new URLSearchParams({ since: String(this.lastSyncId), workspace: this.#slug });
    const account = requestAccount();
    if (account) params.set('account', String(account.id));
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/sync/ws?${params}`);
    this.#socket = socket;
    this.#setStatus(this.#attempt === 0 ? 'connecting' : 'offline');
    socket.onmessage = (event) => {
      if (this.#current(generation)) this.#receive(JSON.parse(String(event.data)) as SyncMessage);
    };
    socket.onclose = (event) => {
      if (!this.#current(generation)) return;
      this.#socket = null;
      this.#closed(event.code);
    };
  }

  #receive(message: SyncMessage) {
    if (message.type === 'delta') {
      this.apply(message.actions, message.last_sync_id);
    } else if (message.type === 'caught_up') {
      this.apply([], message.last_sync_id);
      this.#attempt = 0;
      this.#setStatus('synced');
      pool.sync.live = true;
    } else if (message.type === 'sync_groups' && (message.added.length > 0 || message.removed.length > 0)) {
      this.#syncGroups = message.sync_groups;
      // There's no bootstrap of one group yet: the member's data is read whole again.
      this.#rebootstrap();
    }
  }

  #closed(code: number) {
    pool.sync.live = false;
    if (code === CLOSE_UNAUTHORIZED || code === CLOSE_FORBIDDEN || code === CLOSE_NOT_FOUND) {
      // Signed out or out of the workspace: the app finds out with its next request and leaves.
      this.#setStatus('off');
      return;
    }
    if (code === CLOSE_BOOTSTRAP) {
      this.#rebootstrap();
      return;
    }
    this.#setStatus('offline');
    this.#later(() => this.#connect());
  }

  #rebootstrap() {
    const socket = this.#socket;
    this.#generation += 1;
    this.#socket = null;
    if (socket) socket.close(1000);
    pool.sync.live = false;
    this.#setStatus('connecting');
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
}

export const sync = new SyncClient();

// The pool's server-read lists are kept too, a moment after they change; never into another workspace's database.
pool.onChange = () => {
  const scope = pool.scope;
  localDatabase.saveLater('pool', () => (pool.scope === scope && scope !== null ? pool.snapshot() : undefined));
};

export const useSyncStatus = (): SyncStatus => useStore(sync, (store) => store.status);
