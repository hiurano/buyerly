import { reaction, runInAction } from 'mobx';
import { ApiError, send } from '@/lib/api';
import { toast } from '@/ui/toast';
import { localDatabase } from './localDatabase';
import { pool, type PoolChange } from './pool';
import { makeStore, useStore } from './store';
import { sync } from './sync';

/**
 * Writes as transactions, as Linear's (#508). A change is laid over the pool
 * at once, so the screen shows it in the same frame, and queued; the queue
 * sends what is waiting in order, several at once as one GraphQL document
 * (#509), and tries again while the network is down. The server's answer
 * either confirms a transaction or refuses it: a refused one is taken off the
 * pool again and the reason shown in a toast.
 *
 * A confirmed transaction stays laid over the pool until the sync engine holds
 * the sync id its write reached (`lastSyncId`): the server's own delta for it
 * then lands underneath, and nothing flickers back in between or is applied
 * twice. Without a sync engine it is written into the pool and dropped.
 *
 * Everything not yet confirmed is kept in the local database (#496): after a
 * reload it is drawn again and sent.
 */

export interface TransactionInput {
  /** What failed, as the toast's title: "Couldn't rename the team". */
  label: string;
  /** One mutation with one root field, as `graphql` takes it. */
  mutation: string;
  variables?: Record<string, unknown>;
  /** How the pool shows the write until the server has it. */
  changes?: PoolChange[];
  /**
   * A create: the payload field holding the record the server made. It
   * replaces the stand-in the first insert change drew, under its real id.
   */
  created?: string;
  /** The caller says why it failed (undo does); no toast of the queue's own. */
  quiet?: boolean;
}

type State = 'queued' | 'sending' | 'confirmed';

interface Transaction extends TransactionInput {
  id: string;
  state: State;
  /** The sync id holding the write once the server confirmed it. */
  lastSyncId: number;
  attempts: number;
}

/** A transaction as the local database keeps it. */
type StoredTransaction = Omit<Transaction, 'state'> & { state: 'queued' | 'confirmed' };

/** What the server answered for one transaction: its root field's payload. */
type Answer = Record<string, unknown> & { success?: boolean; lastSyncId?: number };

/** Sent at once at most, the server's alias limit (api/client_api/__init__.py); the rest go in the next document. */
const MAX_BATCH = 10;
/** Waits before sending again after the network failed: doubling from the first, never longer than the last. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** A server error (5xx) is tried this many times, then the transaction is refused. */
const SERVER_ATTEMPTS = 5;

const STORE_KEY = 'transactions';

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.');

/** The network, a timeout or a server that is down: worth sending again. */
const retryable = (error: unknown, attempts: number) => !(error instanceof ApiError)
  || error.status === 0 || error.status === 408 || error.status === 429
  || (error.status >= 500 && attempts < SERVER_ATTEMPTS);

type GraphQLError = { message?: string; path?: (string | number)[]; extensions?: { statusCode?: number; userPresentableMessage?: string } };

const refusal = (error: GraphQLError) => new ApiError(
  error.extensions?.statusCode ?? 500,
  error.extensions?.userPresentableMessage || error.message || 'Something went wrong',
);

/**
 * Several transactions as one document: each mutation's root field under an
 * alias of its own (`t0: teamUpdate(…)`), its variables renamed to match.
 */
export function batchDocument(batch: Pick<TransactionInput, 'mutation' | 'variables'>[]): { query: string; variables: Record<string, unknown> } {
  if (batch.length === 1) return { query: batch[0].mutation, variables: batch[0].variables ?? {} };
  const definitions: string[] = [];
  const fields: string[] = [];
  const variables: Record<string, unknown> = {};
  batch.forEach((transaction, index) => {
    const alias = `t${index}`;
    const match = /^\s*mutation\b\s*\w*\s*(?:\(([^)]*)\))?\s*\{([\s\S]*)\}\s*$/.exec(transaction.mutation);
    if (!match) throw new Error(`Not a mutation: ${transaction.mutation}`);
    const rename = (text: string) => text.replace(/\$(\w+)/g, (_, name: string) => `$${alias}_${name}`);
    if (match[1]) definitions.push(rename(match[1]));
    fields.push(`${alias}: ${rename(match[2].trim())}`);
    for (const [name, value] of Object.entries(transaction.variables ?? {})) variables[`${alias}_${name}`] = value;
  });
  const head = definitions.length > 0 ? `(${definitions.join(', ')})` : '';
  return { query: `mutation Transactions${head} { ${fields.join(' ')} }`, variables };
}

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter += 1).toString(36)}`;

export class TransactionQueue {
  /** Written but not yet held by the sync engine: what the pool shows over its records. */
  pending: Transaction[] = [];
  /** The last send failed on the network and waits to try again. */
  offline = false;

  #inFlight = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #scheduled = false;
  #attempt = 0;
  /** Bumped when the workspace changes: an answer for the one left is dropped. */
  #generation = 0;
  readonly #waiting = new Map<string, { resolve: (answer: Answer) => void; reject: (error: unknown) => void }>();

  constructor() {
    makeStore(this);
  }

  /** The number of writes the server has not confirmed yet. */
  get unsent(): number {
    return this.pending.filter((transaction) => transaction.state !== 'confirmed').length;
  }

  /**
   * Shows a write at once and queues it. Settles with the mutation's payload
   * once the server confirmed it, or rejects with why it refused (the change
   * is undone by then).
   */
  commit<T extends Answer = Answer>(input: TransactionInput): Promise<T> {
    const transaction: Transaction = { ...input, id: nextId(), state: 'queued', lastSyncId: 0, attempts: 0 };
    const answer = new Promise<T>((resolve, reject) => {
      this.#waiting.set(transaction.id, { resolve: resolve as (answer: Answer) => void, reject });
    });
    this.#set([...this.pending, transaction]);
    this.#save();
    this.#schedule();
    return answer;
  }

  /** Drops the workspace left: its writes wait in its own local database for its next visit. */
  reset() {
    this.#generation += 1;
    this.#inFlight = false;
    this.#scheduled = false;
    this.#attempt = 0;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#waiting.clear();
    this.pending = [];
    this.offline = false;
  }

  /** Takes back what the local database kept for this workspace, draws it and sends what is unsent. */
  hydrate(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) return;
    const held = new Set(this.pending.map((transaction) => transaction.id));
    const kept = (value as StoredTransaction[])
      .filter((transaction) => typeof transaction?.mutation === 'string' && !held.has(transaction.id))
      .map((transaction): Transaction => ({ ...transaction, attempts: 0 }));
    this.#set([...kept, ...this.pending]);
    this.reconcile();
    this.#schedule();
  }

  /** Drops the confirmed transactions the sync engine now holds: their delta is underneath. */
  reconcile() {
    const tracking = sync.status !== 'off';
    const held = sync.lastSyncId;
    const rest = this.pending.filter((transaction) => (
      transaction.state !== 'confirmed' || (tracking && transaction.lastSyncId > held)
    ));
    if (rest.length === this.pending.length) return;
    this.#set(rest);
    this.#save();
  }

  /** Sends now what is waiting, as when the network came back. */
  flush() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    void this.#send();
  }

  #set(pending: Transaction[]) {
    runInAction(() => {
      this.pending = pending;
      pool.setOverlay(pending.flatMap((transaction) => transaction.changes ?? []));
    });
  }

  #save() {
    const stored: StoredTransaction[] = this.pending.map(({ state, ...transaction }) => ({
      ...transaction,
      state: state === 'confirmed' ? 'confirmed' : 'queued',
    }));
    localDatabase.save(STORE_KEY, stored);
  }

  /** Sends once the code making changes is done: changes made together go in one document. */
  #schedule() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    const generation = this.#generation;
    queueMicrotask(() => {
      if (generation !== this.#generation) return;
      this.#scheduled = false;
      void this.#send();
    });
  }

  async #send() {
    if (this.#inFlight || this.#timer || pool.scope === null) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.#setOffline(true);
      return;
    }
    const batch = this.pending.filter((transaction) => transaction.state === 'queued').slice(0, MAX_BATCH);
    if (batch.length === 0) return;
    const generation = this.#generation;
    this.#inFlight = true;
    this.#mark(batch, 'sending');
    let payload: { data?: Record<string, Answer | null> | null; errors?: GraphQLError[] };
    try {
      const { query, variables } = batchDocument(batch);
      payload = await send('/api/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#inFlight = false;
      for (const transaction of batch) transaction.attempts += 1;
      if (batch.every((transaction) => retryable(error, transaction.attempts))) {
        this.#mark(batch, 'queued');
        this.#setOffline(!(error instanceof ApiError));
        this.#later();
        return;
      }
      for (const transaction of batch) this.#refuse(transaction, error);
      this.#save();
      void this.#send();
      return;
    }
    if (generation !== this.#generation) return;
    this.#inFlight = false;
    this.#attempt = 0;
    this.#setOffline(false);
    const errors = payload.errors ?? [];
    const data = payload.data ?? {};
    let confirmed = false;
    batch.forEach((transaction, index) => {
      const field = batch.length === 1 ? Object.keys(data)[0] : `t${index}`;
      // One document for one transaction: any error is its own.
      const error = batch.length === 1 ? errors[0] : errors.find((item) => item.path?.[0] === field);
      const answer = field ? data[field] : null;
      if (error || !answer) {
        this.#refuse(transaction, error ? refusal(error) : new ApiError(500, 'Something went wrong'));
      } else {
        this.#confirm(transaction, answer);
        confirmed = true;
      }
    });
    // Whatever a write changed, the pool reads again behind the next page that shows it (#488).
    if (confirmed) pool.invalidate('');
    this.reconcile();
    this.#save();
    void this.#send();
  }

  #mark(batch: Transaction[], state: State) {
    const ids = new Set(batch.map((transaction) => transaction.id));
    const pending = this.pending.map((transaction) => (ids.has(transaction.id) ? { ...transaction, state } : transaction));
    runInAction(() => { this.pending = pending; });
    batch.splice(0, batch.length, ...pending.filter((transaction) => ids.has(transaction.id)));
  }

  #setOffline(offline: boolean) {
    if (this.offline !== offline) runInAction(() => { this.offline = offline; });
  }

  #later() {
    const wait = RETRY_MS[Math.min(this.#attempt, RETRY_MS.length - 1)];
    this.#attempt += 1;
    const generation = this.#generation;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (generation === this.#generation) void this.#send();
    }, wait);
  }

  /** The server has it: written into the pool underneath, laid over it until its delta arrives. */
  #confirm(transaction: Transaction, answer: Answer) {
    let changes = transaction.changes ?? [];
    const made = transaction.created ? answer[transaction.created] as Record<string, unknown> | undefined : undefined;
    const stand = changes.findIndex((change) => change.kind === 'insert');
    if (made && made.id !== undefined && stand >= 0) {
      const insert = changes[stand] as Extract<PoolChange, { kind: 'insert' }>;
      changes = changes.map((change, index) => (index === stand ? { ...insert, id: String(made.id), record: made } : change));
    }
    for (const change of changes) {
      if (change.kind === 'update') pool.patch(change.type, change.id, change.data);
      else if (change.kind === 'insert') pool.place(change.list, change.type, change.id, change.record, change.first);
      else pool.remove(change.type, change.id);
    }
    const confirmed: Transaction = {
      ...transaction,
      changes,
      state: 'confirmed',
      lastSyncId: typeof answer.lastSyncId === 'number' ? answer.lastSyncId : 0,
    };
    this.#set(this.pending.map((item) => (item.id === transaction.id ? confirmed : item)));
    this.#waiting.get(transaction.id)?.resolve(answer);
    this.#waiting.delete(transaction.id);
  }

  /** The server said no: the change comes off the pool, and the member is told why. */
  #refuse(transaction: Transaction, error: unknown) {
    this.#set(this.pending.filter((item) => item.id !== transaction.id));
    const waiter = this.#waiting.get(transaction.id);
    this.#waiting.delete(transaction.id);
    if (!transaction.quiet) toast.error(transaction.label, reason(error));
    waiter?.reject(error);
  }
}

export const transactions = new TransactionQueue();

localDatabase.keep(STORE_KEY, (value) => transactions.hydrate(value));
// Another workspace, account or none: the queue holds one workspace's writes, as the pool does.
reaction(() => pool.scope, () => transactions.reset());
// The sync engine caught up past a confirmed write: its delta is in, the overlay comes off.
reaction(() => [sync.lastSyncId, sync.status] as const, () => transactions.reconcile());
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => transactions.flush());
}

/** Writes made here that the server hasn't confirmed yet, for the app's offline state. */
export const useUnsentWrites = (): number => useStore(transactions, (store) => store.unsent);
