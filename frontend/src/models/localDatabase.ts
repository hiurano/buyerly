import type { SessionUser } from '@/lib/types';
import type { BrowserAccount } from '@/lib/accounts';

/**
 * The open workspace's data kept between visits, as Linear's local database
 * (#496): one IndexedDB database per account and workspace, holding the sync
 * engine's models with the last sync id applied, the pool's lists read from
 * the server, and a few stores' values (saved views, Inbox's Display options).
 * On start the app reads it before it draws a page, so a reload opens with
 * data in its first frame; then the socket catches up from that sync id and
 * the server's lists are read again behind the page.
 *
 * Nothing here is the truth: a schema change drops the database, signing out
 * deletes it, and without IndexedDB (a private window) everything still works
 * from memory and the server, as before.
 */

/** Bumped whenever what is stored changes shape: an older database is dropped, never read. */
export const SCHEMA_VERSION = 1;

const PREFIX = 'buyerly_';
/** Every database this browser made, by name, with the scope it holds: sign-out finds them here. */
const REGISTRY_KEY = 'buyerly-local-databases';
/** The signed-in profile last seen, so a reload draws the workspace before /api/me answers. */
const SESSION_KEY = 'buyerly-session';

const MODELS = 'models';
const VALUES = 'values';

/** A stored model row, keyed `<model>:<id>`. */
interface StoredRow {
  model: string;
  row: Record<string, unknown> & { id: number };
}

/** Where the sync engine stood when it last wrote. */
export interface StoredSync {
  lastSyncId: number;
  syncGroups: string[];
}

/** Everything read back on start. */
export interface LocalData {
  sync: StoredSync | null;
  models: Map<string, Map<number, StoredRow['row']>>;
  values: Map<string, unknown>;
}

/** A change to the stored models: a row written whole, or taken out. */
export type StoredChange = { model: string; id: number; row: StoredRow['row'] | null };

const hasIndexedDb = () => typeof indexedDB !== 'undefined' && indexedDB !== null;

/** The database's name: a hash of its scope, so a username isn't written in the browser's list of databases. */
export function databaseName(scope: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < scope.length; index += 1) {
    hash ^= scope.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${PREFIX}${hash.toString(16).padStart(8, '0')}`;
}

function readJson<T>(storage: () => Storage, key: string): T | null {
  try {
    const value = storage().getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function writeJson(storage: () => Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode) or full; the app reads the server instead.
  }
}

const registry = () => readJson<Record<string, string>>(() => window.localStorage, REGISTRY_KEY) ?? {};

function request<T>(run: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    run.onsuccess = () => resolve(run.result);
    run.onerror = () => reject(run.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, SCHEMA_VERSION);
    opening.onupgradeneeded = () => {
      // Another schema's data is dropped whole, never read in a shape it doesn't have.
      const db = opening.result;
      for (const store of [...db.objectStoreNames]) db.deleteObjectStore(store);
      db.createObjectStore(MODELS);
      db.createObjectStore(VALUES);
    };
    opening.onsuccess = () => {
      const db = opening.result;
      // A newer app in another tab drops this schema: let it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('The local database is open in an older tab.'));
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const deleting = indexedDB.deleteDatabase(name);
    deleting.onsuccess = () => resolve();
    deleting.onerror = () => resolve();
    // Another tab still holds it; it closes on versionchange and the delete goes through then.
    deleting.onblocked = () => resolve();
  });
}

/** Opens a scope's database; one written by a newer schema is dropped and made again. */
async function openScope(name: string): Promise<IDBDatabase> {
  const db = await openDatabase(name).catch(async (error: unknown) => {
    if (!(error instanceof DOMException) || error.name !== 'VersionError') throw error;
    await deleteDatabase(name);
    return openDatabase(name);
  });
  return db;
}

async function readAll(db: IDBDatabase): Promise<LocalData> {
  const transaction = db.transaction([MODELS, VALUES], 'readonly');
  const models = transaction.objectStore(MODELS);
  const values = transaction.objectStore(VALUES);
  const [rows, valueKeys, valueRows] = await Promise.all([
    request(models.getAll() as IDBRequest<StoredRow[]>),
    request(values.getAllKeys()),
    request(values.getAll()),
  ]);
  const data: LocalData = { sync: null, models: new Map(), values: new Map() };
  valueKeys.forEach((key, index) => data.values.set(String(key), valueRows[index]));
  data.sync = (data.values.get('sync') as StoredSync | undefined) ?? null;
  data.values.delete('sync');
  for (const { model, row } of rows) {
    let held = data.models.get(model);
    if (!held) {
      held = new Map();
      data.models.set(model, held);
    }
    held.set(row.id, row);
  }
  return data;
}

/** Waits before the pool's lists are written: a burst of answers makes one write. */
const POOL_SAVE_MS = 1_000;

export class LocalDatabase {
  #scope: string | null = null;
  #db: Promise<IDBDatabase | null> = Promise.resolve(null);
  #generation = 0;
  readonly #pending = new Map<string, () => unknown>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  readonly #keepers = new Map<string, (value: unknown) => void>();

  constructor() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      // A closing tab writes what is still waiting.
      window.addEventListener('pagehide', () => this.flush());
    }
  }

  /**
   * Opens a scope's database (null closes it) and reads back what it holds;
   * null when there is nothing, or no IndexedDB. Never rejects.
   */
  open(scope: string | null): Promise<LocalData | null> {
    if (scope === this.#scope) return this.#db.then((db) => (db ? readAll(db).catch(() => null) : null));
    this.flush();
    const previous = this.#db;
    this.#generation += 1;
    this.#scope = scope;
    void previous.then((db) => db?.close());
    if (scope === null || !hasIndexedDb()) {
      this.#db = Promise.resolve(null);
      return Promise.resolve(null);
    }
    const name = databaseName(scope);
    writeJson(() => window.localStorage, REGISTRY_KEY, { ...registry(), [name]: scope });
    const generation = this.#generation;
    this.#db = openScope(name).catch(() => null);
    return this.#db.then(async (db) => {
      if (!db || generation !== this.#generation) return null;
      const data = await readAll(db).catch(() => null);
      return data && (data.sync || data.values.size > 0) ? data : null;
    });
  }

  /** Replaces every stored model with bootstrap's, with its sync id. */
  replaceModels(models: Map<string, Map<number, StoredRow['row']>>, sync: StoredSync) {
    void this.#write([MODELS, VALUES], (transaction) => {
      const store = transaction.objectStore(MODELS);
      store.clear();
      for (const [model, rows] of models) {
        for (const row of rows.values()) store.put({ model, row } satisfies StoredRow, `${model}:${row.id}`);
      }
      transaction.objectStore(VALUES).put(sync, 'sync');
    });
  }

  /** Writes a batch of changes with the sync id it reached, in one transaction: never one without the other. */
  applyChanges(changes: StoredChange[], sync: StoredSync) {
    void this.#write([MODELS, VALUES], (transaction) => {
      const store = transaction.objectStore(MODELS);
      for (const { model, id, row } of changes) {
        if (row) store.put({ model, row } satisfies StoredRow, `${model}:${id}`);
        else store.delete(`${model}:${id}`);
      }
      transaction.objectStore(VALUES).put(sync, 'sync');
    });
  }

  /** False without IndexedDB (a private window, an old browser): everything is read from the server. */
  get available(): boolean {
    return hasIndexedDb();
  }

  /** What a store takes back on start from the value it keeps under `key`. */
  keep(key: string, hydrate: (value: unknown) => void) {
    this.#keepers.set(key, hydrate);
  }

  /** Hands every store the value it kept, as read back on start. */
  hydrate(data: LocalData) {
    for (const [key, hydrate] of this.#keepers) {
      if (data.values.has(key)) hydrate(data.values.get(key));
    }
  }

  /**
   * Keeps a value under a key; `read` is called when it is written, after a
   * short wait, so a burst of changes is written once. It returns undefined
   * when there is nothing to write any more (its workspace was left).
   */
  saveLater(key: string, read: () => unknown) {
    if (this.#scope === null) return;
    this.#pending.set(key, read);
    if (this.#timer === null) this.#timer = setTimeout(() => this.flush(), POOL_SAVE_MS);
  }

  /** Keeps a value under a key now: a choice the member made is written before a reload can lose it. */
  save(key: string, value: unknown) {
    if (this.#scope === null) return;
    this.#pending.delete(key);
    void this.#write([VALUES], (transaction) => {
      transaction.objectStore(VALUES).put(value, key);
    });
  }

  /** Writes every value still waiting. */
  flush() {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    if (this.#pending.size === 0) return;
    const values = [...this.#pending].map(([key, read]) => [key, read()] as const).filter(([, value]) => value !== undefined);
    this.#pending.clear();
    void this.#write([VALUES], (transaction) => {
      const store = transaction.objectStore(VALUES);
      for (const [key, value] of values) store.put(value, key);
    });
  }

  /** Forgets what is stored for the open scope; the next start reads the server. */
  clear() {
    this.#pending.clear();
    void this.#write([MODELS, VALUES], (transaction) => {
      transaction.objectStore(MODELS).clear();
      transaction.objectStore(VALUES).clear();
    });
  }

  async #write(stores: string[], run: (transaction: IDBTransaction) => void): Promise<void> {
    // The database open when the write was asked for: one for a workspace since left never lands in another's.
    const db = await this.#db;
    if (!db) return;
    // Written in order: IndexedDB runs transactions on the same stores one after another.
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(stores, 'readwrite');
      run(transaction);
    } catch {
      // A closed or full database: the server still has it all.
      return;
    }
    await done(transaction).catch(() => {});
  }

  /**
   * Deletes the databases of one account's scopes (`<username>:`), or with
   * null every one this browser holds, and the remembered profile with them.
   */
  async wipe(username: string | null): Promise<void> {
    const held = registry();
    const names = Object.entries(held)
      .filter(([, scope]) => username === null || scope.startsWith(`${username}:`))
      .map(([name]) => name);
    if (username === null && hasIndexedDb() && typeof indexedDB.databases === 'function') {
      const listed = await indexedDB.databases().catch(() => []);
      for (const { name } of listed) if (name?.startsWith(PREFIX) && !names.includes(name)) names.push(name);
    }
    if (this.#scope !== null && names.includes(databaseName(this.#scope))) {
      // The open one goes too: close it first, so the delete isn't blocked by this tab.
      this.#pending.clear();
      await this.open(null);
    }
    const rest = Object.fromEntries(Object.entries(held).filter(([name]) => !names.includes(name)));
    writeJson(() => window.localStorage, REGISTRY_KEY, Object.keys(rest).length > 0 ? rest : null);
    forgetSession(username);
    if (hasIndexedDb()) await Promise.all(names.map(deleteDatabase));
  }
}

export const localDatabase = new LocalDatabase();

/** The profiles last seen in this browser, by account (0 with one account and no account list). */
export interface RememberedSession {
  accounts: BrowserAccount[];
  users: Record<string, SessionUser>;
}

/** Keeps the signed-in profile and the browser's accounts for the next start. */
export function rememberSession(user: SessionUser, accounts: BrowserAccount[]) {
  const held = readJson<RememberedSession>(() => window.localStorage, SESSION_KEY);
  const users = { ...held?.users, [String(user.id ?? 0)]: user };
  writeJson(() => window.localStorage, SESSION_KEY, { accounts, users } satisfies RememberedSession);
}

/** The profiles and accounts last seen in this browser, to start with before the server answers. */
export function rememberedSession(): RememberedSession | null {
  const held = readJson<RememberedSession>(() => window.localStorage, SESSION_KEY);
  return held?.users && Array.isArray(held.accounts) ? held : null;
}

function forgetSession(username: string | null) {
  const held = readJson<RememberedSession>(() => window.localStorage, SESSION_KEY);
  if (!held || username === null) {
    writeJson(() => window.localStorage, SESSION_KEY, null);
    return;
  }
  const users = Object.fromEntries(Object.entries(held.users ?? {}).filter(([, user]) => user.username !== username));
  const accounts = (held.accounts ?? []).filter((account) => account.username !== username);
  writeJson(() => window.localStorage, SESSION_KEY, Object.keys(users).length > 0 ? { accounts, users } : null);
}
