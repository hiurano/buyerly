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
 * #496 persists this pool in IndexedDB and #497 feeds it from the sync engine.
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

  constructor(pool: BuyerlyPool, readonly type: RecordType | null) {
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
        : (this.ids ?? []).map((id) => pool.record(type, id)).filter((record) => record !== undefined);
      return { data, error: '', loading: false };
    }, { keepAlive: true });
  }
}

const same = (left: unknown, right: unknown) => left === right || JSON.stringify(left) === JSON.stringify(right);

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.');

/** After the page that asked has been painted: a read behind held data never delays its first frame. */
export function afterPaint(run: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(run, 0));
  else setTimeout(run, 0);
}

export class BuyerlyPool {
  /** The workspace this pool holds ("<user>:<workspace id>"); null when none is open. */
  scope: string | null = null;
  private generation = 0;
  private readonly records = observable.map<string, unknown>({}, { deep: false });
  private readonly entries = observable.map<string, Entry>({}, { deep: false });

  constructor() {
    makeObservable(this, {
      scope: observable,
      reset: action,
      upsert: action,
      patch: action,
      remove: action,
      append: action,
      updateEach: action,
      setValue: action,
      invalidate: action,
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
  }

  record<T>(type: RecordType, id: string | number): T | undefined {
    return this.records.get(`${type}:${id}`) as T | undefined;
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
    const entry = this.entry(query);
    if (!entry.held || Date.now() - entry.fetchedAt >= (query.staleAfter ?? STALE_AFTER_MS)) await this.fetch(query);
    const { data, error } = this.result<QueryData<Q>>(query.key);
    if (data === undefined) throw new Error(error || 'Something went wrong. Please try again.');
    return data;
  }

  /** Puts a record in the pool, or replaces the one held for its id when it differs. */
  upsert<T>(type: RecordType, record: T, id: string | number) {
    const key = `${type}:${id}`;
    if (!same(this.records.get(key), record)) this.records.set(key, record);
  }

  /** Changes some fields of a held record: a new object, so every list showing it redraws. */
  patch<T extends object>(type: RecordType, id: string | number, change: Partial<T>) {
    const current = this.record<T>(type, id);
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
  }

  /** Takes a record out of the pool and out of every list that held it. */
  remove(type: RecordType, id: string | number) {
    const key = String(id);
    this.records.delete(`${type}:${key}`);
    for (const entry of this.entries.values()) {
      if (entry.type === type && entry.ids?.includes(key)) entry.ids = entry.ids.filter((item) => item !== key);
    }
  }

  /** Adds a new record to a list query, at its end or with `first` at its start, as a create does. */
  append<T>(query: ListQuery<T>, record: T, { first = false }: { first?: boolean } = {}) {
    const entry = this.entry(query);
    const id = String(query.id(record));
    this.upsert(query.type, record, id);
    if (entry.ids && !entry.ids.includes(id)) entry.ids = first ? [id, ...entry.ids] : [...entry.ids, id];
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
  }

  /** Marks queries whose key starts with `prefix` stale: the next visit reads them again behind what it shows. */
  invalidate(prefix: string) {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix)) entry.fetchedAt = 0;
    }
  }

  private entry(query: { key: string; kind?: Query<unknown>['kind']; type?: RecordType }): Entry {
    let entry = this.entries.get(query.key);
    if (!entry) {
      const created = new Entry(this, query.kind === 'list' && query.type ? query.type : null);
      runInAction(() => this.entries.set(query.key, created));
      entry = created;
    }
    return entry;
  }
}

export const pool = new BuyerlyPool();
