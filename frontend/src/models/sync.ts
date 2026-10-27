import { requestAccount } from '@/lib/accounts';
import { runInAction } from 'mobx';
import { localDatabase, type LocalData } from './localDatabase';
import { pool, type PoolSnapshot } from './pool';
import { makeStore, useStore } from './store';
import type { HubMessage, HubRequest, HubResponse, SharedTransaction, SyncAction, SyncRow, SyncStatus } from './syncProtocol';
import { HubLink, tabId } from './syncTransport';

export type { SyncAction, SyncRow, SyncStatus } from './syncProtocol';

/**
 * The client of the sync engine, as Linear's (#507): the workspace's synced
 * models are read once with /api/sync/bootstrap, then kept current by the
 * changes /api/sync/ws pushes after the last sync id held.
 *
 * The connection itself is the workspace's sync hub (#498, syncHub.ts), which
 * every open tab of the workspace shares through a SharedWorker: one socket,
 * one stream of changes and one writer of the local database (#496) for all of
 * them. This tab joins it, is sent every model held and then each batch of
 * changes applied, and keeps its own copy for the pages to read at once.
 * Without SharedWorker the hub runs in the tab, as the connection did before.
 *
 * Rows are held as the server sends them, one map per model. The pages'
 * lists are derived from them (syncedLists.ts) into the pool, which is told
 * after every change applied; the pool redraws only what changed.
 *
 * The tab's writes (#508) are sent through the hub too, and the other tabs'
 * are drawn here until the sync engine holds them (transactions.ts).
 */

export class SyncClient {
  status: SyncStatus = 'off';
  /** The newest change held. */
  lastSyncId = 0;

  #scope: string | null = null;
  #slug = '';
  #models = new Map<string, Map<number, SyncRow>>();
  #userId: number | null = null;
  #link: HubLink | null = null;
  /** The hub's messages wait until the local database's values are in the pool. */
  #ready = false;
  #waiting: HubMessage[] = [];
  #settle: (() => void) | null = null;
  /** This tab's writes, as the hub keeps them; sent again when it joins again. */
  #pending: SharedTransaction[] = [];
  #requestId = 0;
  readonly #requests = new Map<number, { resolve: (response: HubResponse) => void }>();
  readonly #listeners: ((actions: SyncAction[]) => void)[] = [];
  #peers: (transactions: SharedTransaction[]) => void = () => {};
  #adopt: (transactions: SharedTransaction[]) => void = () => {};

  constructor() {
    makeStore(this);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      // A closing tab leaves its hub; one back from the back/forward cache joins again.
      window.addEventListener('pagehide', () => this.#link?.post({ type: 'leave', tab: tabId }));
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) this.#join();
      });
    }
  }

  /** Opens the workspace's models (scope as the pool's), or closes them with null. */
  open(scope: string | null, slug: string | null) {
    if (scope === this.#scope) return;
    this.#close();
    this.#scope = scope;
    this.#slug = slug ?? '';
    this.#models = new Map();
    this.#userId = null;
    this.lastSyncId = 0;
    pool.sync.live = false;
    const local = localDatabase.open(scope);
    if (scope === null) {
      this.#setStatus('off');
      pool.sync.booting = null;
      return;
    }
    this.#link = new HubLink(scope, (message) => this.#hear(message), () => this.#restarted());
    // Nothing kept and no socket to keep it current: the pages read the server, as before; the hub sends the writes.
    if (typeof WebSocket === 'undefined' && !localDatabase.available) {
      this.#setStatus('off');
      pool.sync.booting = null;
      this.#ready = true;
      this.#join();
      return;
    }
    this.#setStatus(typeof WebSocket === 'undefined' ? 'off' : 'connecting');
    this.#booting();
    this.#join();
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

  /**
   * Whether the connection is the SharedWorker's, shared with the workspace's
   * other tabs. A method: a store's getter is a computed value, and with
   * nothing observable to watch it would keep its first answer.
   */
  isShared(): boolean {
    return this.#link?.shared ?? false;
  }

  /** Calls back with every batch of changes applied, for lists the pool still reads from the server. */
  onChanges(listener: (actions: SyncAction[]) => void) {
    this.#listeners.push(listener);
  }

  /** Calls back with the other tabs' writes, whenever they change. */
  onPeers(listener: (transactions: SharedTransaction[]) => void) {
    this.#peers = listener;
  }

  /** Calls back with writes a closed tab (or the last visit) left unsent, for this tab to send. */
  onAdopt(listener: (transactions: SharedTransaction[]) => void) {
    this.#adopt = listener;
  }

  /** This tab's writes changed: the hub keeps them for the next visit and shows them to the other tabs. */
  announce(transactions: SharedTransaction[]) {
    this.#pending = transactions;
    this.#link?.post({ type: 'pending', tab: tabId, transactions });
  }

  /**
   * Sends a request through the hub, in the shape `fetch` answers (lib/api.ts
   * reads it); rejects as fetch does when the network or the hub failed.
   */
  request(path: string, init: RequestInit = {}): Promise<Pick<Response, 'ok' | 'status' | 'json'>> {
    const link = this.#link;
    if (!link) return fetch(path, init);
    const id = (this.#requestId += 1);
    const request: HubRequest = {
      path,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    return new Promise<HubResponse>((resolve) => {
      this.#requests.set(id, { resolve });
      link.post({ type: 'request', tab: tabId, id, request });
    }).then((response) => {
      if ('error' in response) throw new TypeError(response.error);
      return { ok: response.status < 400, status: response.status, json: async () => response.body };
    });
  }

  /** Applies changes the hub applied, in order, skipping any already held; then the pool reads its lists again. */
  apply(actions: SyncAction[], lastSyncId: number) {
    const applied: SyncAction[] = [];
    for (const change of actions) {
      if (change.sync_id <= this.lastSyncId) continue;
      applied.push(change);
      const rows = this.#models.get(change.model);
      if (rows) {
        const id = Number(change.model_id);
        if (change.action === 'delete') rows.delete(id);
        else rows.set(id, { ...rows.get(id), ...change.data, id } as SyncRow);
      }
      this.lastSyncId = change.sync_id;
    }
    this.lastSyncId = Math.max(this.lastSyncId, lastSyncId);
    pool.syncChanged();
    if (applied.length > 0) for (const listener of this.#listeners) listener(applied);
  }

  #close() {
    this.#link?.post({ type: 'leave', tab: tabId });
    this.#link?.close();
    this.#link = null;
    this.#ready = false;
    this.#waiting = [];
    this.#pending = [];
    this.#settle?.();
    this.#settle = null;
    this.#failRequests();
  }

  #join() {
    const scope = this.#scope;
    if (!this.#link || scope === null) return;
    const account = requestAccount();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.#slug) headers['X-Workspace-Slug'] = this.#slug;
    if (account) headers['X-Buyerly-Account'] = String(account.id);
    this.#link.post({
      type: 'join', tab: tabId, scope, slug: this.#slug, account: account?.id ?? null, headers, pending: this.#pending,
    });
  }

  /** The worker was gone: what was asked of it is failed (the queue sends again), and the tab joins the new one. */
  #restarted() {
    this.#failRequests();
    pool.sync.live = false;
    this.#join();
  }

  #failRequests() {
    const waiting = [...this.#requests.values()];
    this.#requests.clear();
    for (const { resolve } of waiting) resolve({ error: 'The sync hub restarted.' });
  }

  /** The pages wait for the models from now until the hub says they are held (or there are none). */
  #booting() {
    if (this.#settle) return;
    let settle = () => {};
    const booting = new Promise<void>((resolve) => { settle = resolve; });
    pool.sync.booting = booting;
    this.#settle = () => {
      if (pool.sync.booting === booting) pool.sync.booting = null;
      settle();
    };
  }

  /**
   * Draws what the local database kept before the hub's models arrive, as
   * Linear does: the pool's lists and the stores' values are there before any
   * page is drawn.
   */
  async #start(scope: string, reading: Promise<LocalData | null>) {
    const link = this.#link;
    const local = await reading;
    if (this.#link !== link) return;
    if (local) {
      const snapshot = local.values.get('pool') as PoolSnapshot | undefined;
      if (snapshot) pool.hydrate(scope, snapshot);
      localDatabase.hydrate(local);
    }
    this.#ready = true;
    for (const message of this.#waiting.splice(0)) this.#hear(message);
  }

  #hear(message: HubMessage) {
    if (!this.#ready && message.type !== 'response') {
      this.#waiting.push(message);
      return;
    }
    if (message.type === 'hold') this.#hold(message.models, message.lastSyncId, message.syncGroups);
    else if (message.type === 'delta') this.apply(message.actions, message.lastSyncId);
    else if (message.type === 'status') {
      this.#setStatus(message.status);
      pool.sync.live = message.live;
      if (message.booting) this.#booting();
      else {
        this.#settle?.();
        this.#settle = null;
      }
    } else if (message.type === 'peers') this.#peers(message.transactions);
    else if (message.type === 'adopt') this.#adopt(message.transactions);
    else if (message.type === 'response') {
      this.#requests.get(message.id)?.resolve(message.response);
      this.#requests.delete(message.id);
    } else if (message.type === 'unknown') this.#join();
  }

  #setStatus(status: SyncStatus) {
    if (this.status !== status) runInAction(() => { this.status = status; });
  }

  /** Holds a whole set of models, as the hub holds them. */
  #hold(held: Record<string, SyncRow[]>, lastSyncId: number, syncGroups: string[]) {
    const models = new Map<string, Map<number, SyncRow>>();
    for (const [model, rows] of Object.entries(held)) models.set(model, new Map(rows.map((row) => [row.id, row])));
    this.#models = models;
    runInAction(() => { this.lastSyncId = lastSyncId; });
    const memberGroup = syncGroups.find((group) => group.startsWith('member:'));
    const member = memberGroup ? models.get('WorkspaceMember')?.get(Number(memberGroup.slice('member:'.length))) : undefined;
    this.#userId = member ? Number(member.user_id) : null;
    pool.syncChanged();
  }
}

export const sync = new SyncClient();

// The pool's server-read lists are kept too, a moment after they change; never into another workspace's database.
pool.onChange = () => {
  const scope = pool.scope;
  localDatabase.saveLater('pool', () => (pool.scope === scope && scope !== null ? pool.snapshot() : undefined));
};

export const useSyncStatus = (): SyncStatus => useStore(sync, (store) => store.status);
