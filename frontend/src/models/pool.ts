import { action, computed, makeObservable, observable, observableRef, reaction, runInAction, type IComputedValue } from 'mobx';

/**
 * The open workspace's data, held once, as Linear's object pool (#488): every
 * team, member, ad account, rule… is one record per id, shared by every list
 * that shows it, and a list is the ids it holds. A page reads the pool first,
 * so a page already visited draws its data in its first frame; the server is
 * asked again behind it only once that data is older than its query allows,
 * and that answer replaces records in place without blanking the page.
 *
 * Records are replaced, never edited: a change makes a new object for that id,
 * and every list holding it gets a new array. The React Compiler memoizes by
 * identity, so a record mutated in place would leave a compiled component
 * showing the old value even though MobX re-rendered it.
 *
 * A list the sync engine holds (#507) is read from its models instead: no
 * request at all, and every delta it applies redraws the lists it touches.
 * The lists read from the server are kept in IndexedDB between visits (#496,
 * `snapshot` and `hydrate`): after a reload they are drawn at once, as stale,
 * and read again behind the page.
 *
 * A write is drawn before the server has it (#508): the transaction queue lays
 * its changes over what is held (`setOverlay`), and every list and record read
 * shows them, whatever answer or delta lands underneath, until the server has
 * it or says no.
 */

/** How long a query's answer counts as current; older ones are read again after the page is drawn. */
export const STALE_AFTER_MS = 30_000;

export type RecordType =
  | 'team'
  | 'member'
  | 'adAccount'
  | 'connection'
  | 'preset'
  | 'ruleLabel'
  | 'inboxEvent'
  | 'teamDocument'
  | 'favorite'
  /** One ad account's campaigns, ad sets and ads for one period: `<act_…>:<period>`. */
  | 'accountHierarchy';

/** A list of records of one type: what a page asks the pool for. */
export interface ListQuery<T> {
  kind: 'list';
  key: string;
  type: RecordType;
  load: () => Promise<T[]>;
  id: (record: T) => string | number;
  /** Defaults to STALE_AFTER_MS; 0 reads again behind every visit. */
  staleAfter?: number;
  /**
   * The list as the sync engine's models give it (#507), read instead of the
   * server; undefined when they don't hold it, and then the server is asked.
   */
  local?: () => T[] | undefined;
}

/** One answer kept whole (counts, a page of results): replaced only when it changes. */
export interface ValueQuery<T> {
  kind: 'value';
  key: string;
  load: () => Promise<T>;
  staleAfter?: number;
}

export type Query<T> = ListQuery<T> | ValueQuery<T>;

/** What a query gives: a list query its records, a value query its answer. */
export type QueryData<Q> = Q extends ListQuery<infer T> ? T[] : Q extends ValueQuery<infer T> ? T : never;

/** What a page reads: the data as held, and whether the first read is still on its way. */
export interface QueryResult<T> {
  /** Undefined until the first answer; afterwards always the last good one. */
  data: T | undefined;
  /** Why the first read failed; a failed read behind held data keeps the data and says nothing. */
  error: string;
  loading: boolean;
}

const IDLE: QueryResult<never> = { data: undefined, error: '', loading: true };

/**
 * A change a write shows before the server has it (#508), in the pages' own
 * shapes: some fields of a record, a new record in a list, a record gone.
 */
export type PoolChange =
  | { kind: 'update'; type: RecordType; id: string; data: Record<string, unknown> }
  | { kind: 'insert'; type: RecordType; id: string; record: Record<string, unknown>; list: string; first?: boolean }
  | { kind: 'delete'; type: RecordType; id: string };

/** The pending changes, indexed for reading. */
interface Overlay {
  /** Fields laid over a record, by record key, in the order they were made. */
  patches: Map<string, Record<string, unknown>[]>;
  /** Records the server hasn't made yet, by record key. */
  inserted: Map<string, unknown>;
  /** Records taken out of every list. */
  hidden: Set<string>;
  /** Ids put in a list, by its key. */
  added: Map<string, { id: string; first: boolean }[]>;
}

const NO_OVERLAY: Overlay = { patches: new Map(), inserted: new Map(), hidden: new Set(), added: new Map() };

/** Same list and same records, so a query's result stays the same object. */
const sameResult = (left: QueryResult<unknown>, right: QueryResult<unknown>) => {
  if (left.loading !== right.loading || left.error !== right.error) return false;
  if (left.data === right.data) return true;
  if (!Array.isArray(left.data) || !Array.isArray(right.data) || left.data.length !== right.data.length) return false;
  return left.data.every((item, index) => item === (right.data as unknown[])[index]);
};

class Entry {
  ids: string[] | null = null;
  value: unknown = undefined;
  held = false;
  error = '';
  fetchedAt = 0;
  promise: Promise<void> | null = null;
  /** The newest request's number: only its answer is taken. */
  request = 0;
  /** Computed once and kept, so an unchanged query hands out the same object. */
  readonly result: IComputedValue<QueryResult<unknown>>;

  constructor(pool: BuyerlyPool, readonly key: string, readonly type: RecordType | null) {
    makeObservable(this, {
      ids: observableRef,
      value: observableRef,
      held: observable,
      error: observable,
    });
    this.result = computed(() => {
      if (!this.held) return { data: undefined, error: this.error, loading: !this.error };
      const data = type === null
        ? this.value
        : pool.listIds(key, this.ids ?? []).map((id) => pool.record(type, id)).filter((record) => record !== undefined);
      return { data, error: '', loading: false };
    }, { keepAlive: true, equals: sameResult });
  }
}

const same = (left: unknown, right: unknown) => left === right || JSON.stringify(left) === JSON.stringify(right);

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.');

/** After the page that asked has been painted: a read behind held data never delays its first frame. */
export function afterPaint(run: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(run, 0));
  else setTimeout(run, 0);
}

/** A query's answer as kept between visits (#496). */
export interface StoredEntry {
  key: string;
  type: RecordType | null;
  ids: string[] | null;
  value: unknown;
}

/** The pool's server-read lists as kept between visits: their entries and the records they show. */
export interface PoolSnapshot {
  entries: StoredEntry[];
  records: [string, unknown][];
}

/** What the sync engine (#507) tells the pool about itself. */
export interface PoolSync {
  /** Settles once the workspace's bootstrap is in, or failed; null when none is on its way. */
  booting: Promise<void> | null;
  /** Its socket is open and caught up: a write's change will come over it, no read needed. */
  live: boolean;
}

export class BuyerlyPool {
  /** The workspace this pool holds ("<user>:<workspace id>"); null when none is open. */
  scope: string | null = null;
  readonly sync: PoolSync = { booting: null, live: false };
  /** Called after an answer or a write changes what the pool holds; the local database keeps it (#496). */
  onChange: (() => void) | null = null;
  private generation = 0;
  private readonly records = observable.map<string, unknown>({}, { deep: false });
  private readonly entries = observable.map<string, Entry>({}, { deep: false });
  /** The lists read from the sync engine's models, read again after every change it applies. */
  private readonly synced = new Map<string, ListQuery<unknown>>();
  /** The transaction queue's pending changes (#508). */
  private overlay: Overlay = NO_OVERLAY;
  /** A record with fields laid over it, kept while neither changes: the same object for the same view. */
  private readonly merged = new Map<string, { base: unknown; patches: Record<string, unknown>[]; value: unknown }>();

  constructor() {
    makeObservable<BuyerlyPool, 'overlay'>(this, {
      scope: observable,
      overlay: observableRef,
      setOverlay: action,
      place: action,
      reset: action,
      upsert: action,
      patch: action,
      remove: action,
      append: action,
      updateEach: action,
      setValue: action,
      invalidate: action,
      syncChanged: action,
      hydrate: action,
    });
  }

  /**
   * Empties the pool for another workspace, another account or none: nothing
   * of the previous one is ever drawn again, and its late answers are dropped.
   */
  reset(scope: string | null) {
    if (scope === this.scope) return;
    this.scope = scope;
    this.generation += 1;
    this.records.clear();
    this.entries.clear();
    this.synced.clear();
    this.overlay = NO_OVERLAY;
    this.merged.clear();
  }

  /** A record as the pages show it: as held, with the writes still pending on it. */
  record<T>(type: RecordType, id: string | number): T | undefined {
    const key = `${type}:${id}`;
    const { patches, inserted, hidden } = this.overlay;
    if (hidden.has(key)) return undefined;
    const base = this.records.get(key) ?? inserted.get(key);
    const laid = patches.get(key);
    if (!laid || base === undefined) return base as T | undefined;
    const kept = this.merged.get(key);
    if (kept && kept.base === base && kept.patches === laid) return kept.value as T;
    const value = Object.assign({}, base, ...laid);
    this.merged.set(key, { base, patches: laid, value });
    return value as T;
  }

  /** A list's ids with the records pending writes put in it. */
  listIds(key: string, ids: string[]): string[] {
    const added = this.overlay.added.get(key);
    if (!added) return ids;
    const first = added.filter((item) => item.first && !ids.includes(item.id)).map((item) => item.id).reverse();
    const last = added.filter((item) => !item.first && !ids.includes(item.id)).map((item) => item.id);
    return [...first, ...ids, ...last];
  }

  /** Lays the transaction queue's pending changes over what is held, in order; replaces the last ones. */
  setOverlay(changes: PoolChange[]) {
    const overlay: Overlay = { patches: new Map(), inserted: new Map(), hidden: new Set(), added: new Map() };
    for (const change of changes) {
      const key = `${change.type}:${change.id}`;
      if (change.kind === 'update') {
        overlay.patches.set(key, [...(overlay.patches.get(key) ?? []), change.data]);
      } else if (change.kind === 'insert') {
        overlay.inserted.set(key, change.record);
        overlay.hidden.delete(key);
        const added = overlay.added.get(change.list) ?? [];
        overlay.added.set(change.list, [...added.filter((item) => item.id !== change.id), { id: change.id, first: Boolean(change.first) }]);
      } else {
        overlay.hidden.add(key);
      }
    }
    // An unchanged record's patches stay the same array, so it stays the same object.
    for (const [key, patches] of overlay.patches) {
      const held = this.overlay.patches.get(key);
      if (held && same(held, patches)) overlay.patches.set(key, held);
    }
    this.overlay = overlay;
    for (const key of this.merged.keys()) if (!overlay.patches.has(key)) this.merged.delete(key);
  }

  /** A query's current result; the same object until something in it changes. */
  result<T>(key: string): QueryResult<T> {
    return (this.entries.get(key)?.result.get() ?? IDLE) as QueryResult<T>;
  }

  /** Whether a query has an answer at all, however old. */
  has(key: string): boolean {
    return Boolean(this.entries.get(key)?.held);
  }

  /** Calls back whenever a query's result changes, also when the pool is emptied; for useSyncExternalStore. */
  subscribe(key: string, onChange: () => void): () => void {
    return reaction(() => this.result(key), onChange);
  }

  /**
   * Makes sure a query's data is coming: read now when nothing is held, again
   * after the next paint when what is held is stale, not at all when it is current.
   */
  ensure<T>(query: Query<T>): void {
    if (this.waitForSync(query, () => this.ensure(query)) || this.fromSync(query)) return;
    const entry = this.entry(query);
    if (entry.promise) return;
    if (!entry.held) {
      void this.fetch(query);
      return;
    }
    if (Date.now() - entry.fetchedAt < (query.staleAfter ?? STALE_AFTER_MS)) return;
    const generation = this.generation;
    afterPaint(() => {
      if (generation === this.generation && !entry.promise) void this.fetch(query);
    });
  }

  /**
   * Reads a query now; everyone asking while it is on its way shares the one
   * request. `afterWrite` sends a request of its own even then, since the
   * one on its way may have left before the write; the newest answer wins.
   */
  fetch<T>(query: Query<T>, { afterWrite = false }: { afterWrite?: boolean } = {}): Promise<void> {
    const booting = this.waitForSync(query, () => this.fetch(query, { afterWrite }));
    if (booting) return booting;
    // After a write the change comes over the socket; with the socket down the server is asked.
    if ((!afterWrite || this.sync.live) && this.fromSync(query)) return Promise.resolve();
    const entry = this.entry(query);
    if (entry.promise && !afterWrite) return entry.promise;
    const generation = this.generation;
    const request = ++entry.request;
    const current = () => generation === this.generation && request === entry.request;
    const promise = query.load().then(
      (data) => {
        if (!current()) return;
        runInAction(() => {
          if (query.kind === 'list') {
            const list = data as T[];
            for (const record of list) this.upsert(query.type, record, query.id(record));
            const ids = list.map((record) => String(query.id(record)));
            if (!entry.ids || !same(entry.ids, ids)) entry.ids = ids;
          } else if (!same(entry.value, data)) {
            entry.value = data;
          }
          entry.fetchedAt = Date.now();
          entry.held = true;
          entry.error = '';
        });
        this.onChange?.();
      },
      (error: unknown) => {
        if (!current()) return;
        runInAction(() => { entry.error = errorText(error); });
      },
    ).then(() => {
      if (entry.promise === promise) entry.promise = null;
    });
    entry.promise = promise;
    return promise;
  }

  /** The held answer, or a read for it when there is none or it is stale; for code outside React. */
  async read<Q extends Query<any>>(query: Q): Promise<QueryData<Q>> {
    if (query.kind === 'list' && query.local && this.sync.booting) await this.sync.booting;
    const entry = this.entry(query);
    // A list held from the sync engine's models is current by definition.
    if (!this.fromSync(query) && (!entry.held || Date.now() - entry.fetchedAt >= (query.staleAfter ?? STALE_AFTER_MS))) {
      await this.fetch(query);
    }
    const { data, error } = this.result<QueryData<Q>>(query.key);
    if (data === undefined) throw new Error(error || 'Something went wrong. Please try again.');
    return data;
  }

  /** Puts a record in the pool, or replaces the one held for its id when it differs. */
  upsert<T>(type: RecordType, record: T, id: string | number) {
    const key = `${type}:${id}`;
    if (same(this.records.get(key), record)) return;
    this.records.set(key, record);
    this.onChange?.();
  }

  /** Changes some fields of a held record: a new object, so every list showing it redraws. */
  patch<T extends object>(type: RecordType, id: string | number, change: Partial<T>) {
    const current = this.records.get(`${type}:${id}`) as T | undefined;
    if (current) this.upsert(type, { ...current, ...change }, id);
  }

  /** Rewrites every held record of a type that `change` returns anew; one it returns as is stays. */
  updateEach<T>(type: RecordType, change: (record: T) => T) {
    const prefix = `${type}:`;
    for (const [key, record] of this.records) {
      if (!key.startsWith(prefix)) continue;
      const next = change(record as T);
      if (next !== record) this.records.set(key, next);
    }
    this.onChange?.();
  }

  /** Takes a record out of the pool and out of every list that held it. */
  remove(type: RecordType, id: string | number) {
    const key = String(id);
    this.records.delete(`${type}:${key}`);
    for (const entry of this.entries.values()) {
      if (entry.type === type && entry.ids?.includes(key)) entry.ids = entry.ids.filter((item) => item !== key);
    }
    this.onChange?.();
  }

  /** Adds a new record to a list query, at its end or with `first` at its start, as a create does. */
  append<T>(query: ListQuery<T>, record: T, { first = false }: { first?: boolean } = {}) {
    this.entry(query);
    this.place(query.key, query.type, String(query.id(record)), record, first);
  }

  /** Puts a record in a held list by the list's key, as `append` does; for a write the server confirmed (#508). */
  place(key: string, type: RecordType, id: string, record: unknown, first = false) {
    this.upsert(type, record, id);
    const entry = this.entries.get(key);
    if (entry?.ids && !entry.ids.includes(id)) entry.ids = first ? [id, ...entry.ids] : [...entry.ids, id];
    this.onChange?.();
  }

  /**
   * Replaces a value's answer, as a write that returns it does; also holds a
   * page's own list (Inbox) under a key of its own, without a query to read it.
   */
  setValue<T>(query: Pick<ValueQuery<T>, 'key'>, value: T) {
    const entry = this.entry(query);
    if (!same(entry.value, value)) entry.value = value;
    if (!entry.held) {
      entry.held = true;
      entry.fetchedAt = Date.now();
    }
    this.onChange?.();
  }

  /**
   * The answers read from the server, with the records their lists show, to
   * keep between visits (#496). Lists the sync engine holds are left out: its
   * models are kept themselves.
   */
  snapshot(): PoolSnapshot {
    const entries: StoredEntry[] = [];
    const keys = new Set<string>();
    for (const [key, entry] of this.entries) {
      if (!entry.held || this.synced.has(key)) continue;
      entries.push({ key, type: entry.type, ids: entry.ids, value: entry.value });
      if (entry.type) for (const id of entry.ids ?? []) keys.add(`${entry.type}:${id}`);
    }
    const records: [string, unknown][] = [];
    for (const key of keys) {
      const record = this.records.get(key);
      if (record !== undefined) records.push([key, record]);
    }
    return { entries, records };
  }

  /**
   * Holds what a snapshot of this scope kept: a page draws it at once and,
   * since it counts as stale however recent, reads the server again behind it.
   * An answer already held is newer and stays.
   */
  hydrate(scope: string, snapshot: PoolSnapshot) {
    if (scope !== this.scope) return;
    for (const [key, record] of snapshot.records) {
      if (!this.records.has(key)) this.records.set(key, record);
    }
    for (const stored of snapshot.entries) {
      const entry = this.entry({ key: stored.key, kind: stored.type ? 'list' : 'value', type: stored.type ?? undefined });
      if (entry.held) continue;
      entry.ids = stored.ids;
      entry.value = stored.value;
      entry.fetchedAt = 0;
      entry.held = true;
    }
  }

  /** Marks queries whose key starts with `prefix` stale: the next visit reads them again behind what it shows. */
  invalidate(prefix: string) {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix)) entry.fetchedAt = 0;
    }
  }

  /**
   * The sync engine applied changes: every list read from its models is read
   * from them again, and one they no longer hold reads the server on its next visit.
   */
  syncChanged() {
    for (const [key, query] of [...this.synced]) {
      if (this.fromSync(query)) continue;
      this.synced.delete(key);
      const entry = this.entries.get(key);
      if (entry) entry.fetchedAt = 0;
    }
  }

  /** While the workspace's bootstrap is on its way, a list it will hold waits for it, as Linear opens on its models. */
  private waitForSync<T>(query: Query<T>, then: () => void | Promise<void>): Promise<void> | null {
    const { booting } = this.sync;
    if (query.kind !== 'list' || !query.local || !booting) return null;
    const generation = this.generation;
    return booting.then(() => {
      if (generation === this.generation) return then();
    });
  }

  /** Holds a list from the sync engine's models when they have it; false when the server has to be asked. */
  private fromSync<T>(query: Query<T>): boolean {
    if (query.kind !== 'list' || !query.local) return false;
    const list = query.local();
    if (!list) return false;
    const entry = this.entry(query);
    runInAction(() => {
      for (const record of list) this.upsert(query.type, record, query.id(record));
      const ids = list.map((record) => String(query.id(record)));
      if (!entry.ids || !same(entry.ids, ids)) entry.ids = ids;
      entry.fetchedAt = Date.now();
      entry.held = true;
      entry.error = '';
      // A server read still on its way is older than this.
      entry.request += 1;
    });
    this.synced.set(query.key, query as ListQuery<unknown>);
    return true;
  }

  private entry(query: { key: string; kind?: Query<unknown>['kind']; type?: RecordType }): Entry {
    let entry = this.entries.get(query.key);
    if (!entry) {
      const created = new Entry(this, query.key, query.kind === 'list' && query.type ? query.type : null);
      runInAction(() => this.entries.set(query.key, created));
      entry = created;
    }
    return entry;
  }
}

export const pool = new BuyerlyPool();
