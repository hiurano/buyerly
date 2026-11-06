import type { SyncActionMessage } from '@buyerly/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../database.ts';
import { rows } from '../database.ts';
import { NOTIFY_CHANNEL, SYNC_ACTION_COLUMNS, actionMessage, lastSyncId, type SyncActionRow } from './log.ts';

// The sync engine's live stream, as Linear's WebSocket to sync.linear.app
// (#506; api/sync_stream.py SyncHub).
//
// One hub per server process LISTENs on the change log's NOTIFY channel and,
// on each committed write, reads the new sync_actions rows in sync-id order
// and hands them to every open socket of the process. The hub also polls, so
// a lost notification or a dropped LISTEN connection only delays a change,
// never loses it.
//
// Who notifies: the deferred trigger that gives each log row its sync id
// (database/sync_log.py sync_log_assign_id) sends NOTIFY at commit, so every
// writer wakes the hub alike, the Python API and worker included, for as
// long as they write. Decision 54 adds Redis pub/sub now that the worker
// runs on this server (#611 stage 4): the TypeScript worker publishes
// on sync/bus.ts after its jobs, and this process subscribes when REDIS_URL
// is set (routes/sync-socket.ts). NOTIFY stays for the Python writers, and
// polling stays as the fallback either way.

export interface SyncTuning {
  // Rows read at once, by the hub and by a socket catching up.
  batch: number;
  // The hub reads the log this often even without a notification.
  pollMs: number;
  // A quiet socket gets a ping this often, and its web session is checked.
  heartbeatMs: number;
  // A socket this far behind is closed; the client reconnects and catches up from the database.
  maxPendingBatches: number;
  // A database that is down fails the connect instead of leaving it waiting.
  readyTimeoutMs: number;
  // Off only in tests that prove the poll alone delivers.
  listen: boolean;
}

export const DEFAULT_SYNC_TUNING: SyncTuning = {
  batch: 500,
  pollMs: 5_000,
  heartbeatMs: 25_000,
  maxPendingBatches: 1000,
  readyTimeoutMs: 10_000,
  listen: true,
};

export interface Change {
  syncId: number;
  model: string;
  groups: ReadonlySet<string>;
  data: Record<string, unknown>;
  message: SyncActionMessage;
}

function changeOf(row: SyncActionRow): Change {
  return {
    syncId: Number(row.sync_id),
    model: row.model,
    groups: new Set(row.sync_groups),
    data: row.data ?? {},
    message: actionMessage(row),
  };
}

// One socket's queue of batches from the hub. `null` once it fell too far behind.
export class Subscription {
  private readonly items: (Change[] | null)[] = [];
  private waiter: (() => void) | null = null;
  private overflowed = false;

  constructor(
    private readonly hub: SyncHub,
    private readonly maxPending: number,
  ) {}

  push(changes: Change[]): void {
    if (this.overflowed) return;
    if (this.items.length >= this.maxPending) {
      this.overflowed = true;
      this.items.push(null);
    } else {
      this.items.push(changes);
    }
    this.waiter?.();
  }

  // The next batch, or `undefined` when none came within `timeoutMs`.
  async next(timeoutMs: number): Promise<Change[] | null | undefined> {
    if (!this.items.length) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.waiter = null;
          resolve();
        }, timeoutMs);
        this.waiter = () => {
          clearTimeout(timer);
          this.waiter = null;
          resolve();
        };
      });
    }
    return this.items.length ? this.items.shift() : undefined;
  }

  // Wakes a waiting next() so its socket can see it was closed.
  interrupt(): void {
    this.waiter?.();
  }

  close(): void {
    this.hub.unsubscribe(this);
    this.interrupt();
  }
}

// This process's reader of the change log; sockets subscribe to it.
export class SyncHub {
  private readonly subscriptions = new Set<Subscription>();
  private cursor: number | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private ready: Promise<void>;
  private markReady!: () => void;
  private wake: (() => void) | null = null;
  private woken = false;

  constructor(
    private readonly db: Database,
    readonly tuning: SyncTuning,
    private readonly log: FastifyBaseLogger,
  ) {
    this.ready = new Promise((resolve) => (this.markReady = resolve));
  }

  async subscribe(): Promise<Subscription> {
    if (this.stopped) throw new Error('The sync hub is stopped');
    this.running ??= this.run();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('The sync hub is not ready')), this.tuning.readyTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const subscription = new Subscription(this, this.tuning.maxPendingBatches);
    this.subscriptions.add(subscription);
    return subscription;
  }

  unsubscribe(subscription: Subscription): void {
    this.subscriptions.delete(subscription);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.notify();
    await this.running;
    for (const subscription of this.subscriptions) subscription.interrupt();
  }

  // A committed write elsewhere: read the log now (Postgres NOTIFY, the Redis sync bus).
  notify(): void {
    this.woken = true;
    this.wake?.();
  }

  private async sleep(ms: number): Promise<void> {
    if (this.woken || this.stopped) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
    this.wake = null;
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      let unlisten: (() => Promise<void>) | null = null;
      // Set by the LISTEN connection's error callback, read by the loop.
      const connection: { lost: Error | null } = { lost: null };
      try {
        // LISTEN comes first: a write committed after the cursor is read still wakes the hub.
        if (this.tuning.listen) {
          unlisten = await this.db.listen(NOTIFY_CHANNEL, () => this.notify(), (error) => {
            connection.lost = error;
            this.notify();
          });
        }
        this.cursor ??= await this.db.transaction((tx) => lastSyncId(tx));
        this.markReady();
        while (!this.stopped && !connection.lost) {
          this.woken = false;
          await this.read();
          await this.sleep(this.tuning.pollMs);
        }
        if (connection.lost) throw connection.lost;
      } catch (error) {
        if (!this.stopped) {
          this.log.error({ err: error }, 'Sync hub lost its connection; reconnecting');
          this.woken = false;
          await this.sleep(1000);
        }
      } finally {
        await unlisten?.();
      }
    }
  }

  // Hands every row committed since the cursor to the subscribers, in sync-id
  // order. Sync ids are assigned and committed under one lock, so nothing
  // below a row already read can appear later.
  private async read(): Promise<void> {
    for (;;) {
      const cursor = this.cursor!;
      const found = await this.db.transaction((tx) =>
        rows<SyncActionRow>(tx, `SELECT ${SYNC_ACTION_COLUMNS} FROM sync_actions WHERE sync_id > $1 ORDER BY sync_id LIMIT $2`, [cursor, this.tuning.batch]),
      );
      if (!found.length) return;
      const changes = found.map(changeOf);
      this.cursor = changes[changes.length - 1].syncId;
      for (const subscription of [...this.subscriptions]) subscription.push(changes);
      if (found.length < this.tuning.batch) return;
    }
  }
}
