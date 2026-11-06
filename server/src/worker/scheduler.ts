import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { DataSource } from 'typeorm';
import { withJobLock, type JobId } from './jobs.ts';

// BullMQ in place of APScheduler (decision 54). Each owned job gets a queue
// of its own, a job scheduler with the Python worker's interval, and a
// worker with concurrency 1. The scheduler keeps at most one next run
// waiting and a run that overruns its interval delays the next instead of
// overlapping it, as APScheduler's max_instances=1 + coalesce did. Several
// worker processes never run one job at once either: each run holds the
// job's advisory lock, which the Python worker takes too (jobs.ts).

export const QUEUE_PREFIX = 'buyerly';
// Last run of every job, for health checks: HSET <key> <job> <json>.
export const RUNS_KEY = `${QUEUE_PREFIX}:worker-ts:runs`;

export interface JobDefinition {
  // The Python worker's interval for it (services/worker.py).
  everyMs: number;
  run: () => Promise<void>;
}

export interface RunRecord {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  // "ok", "error" or "skipped" (another worker held the lock).
  outcome: 'ok' | 'error' | 'skipped';
  error?: string;
}

export const queueName = (job: JobId): string => `job-${job}`;

// BullMQ's connection: a client of our own, since in an ES module BullMQ
// cannot load ioredis from connection options. Workers block on Redis, so
// they must not give up on a command while it reconnects; BullMQ duplicates
// it for each worker's blocking connection.
export function redisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export interface Scheduler {
  close(): Promise<void>;
}

export interface SchedulerOptions {
  redisUrl: string;
  dataSource: DataSource;
  log: FastifyBaseLogger;
  owned: ReadonlyMap<JobId, JobDefinition>;
  // Jobs this worker knows but does not own: their schedules are removed, so
  // a job taken off TS_WORKER_JOBS stops here after the restart.
  notOwned: readonly JobId[];
  recordRun: (job: JobId, record: RunRecord) => Promise<void>;
  // Redis key prefix; tests use one of their own.
  prefix?: string;
}

export async function startScheduler(options: SchedulerOptions): Promise<Scheduler> {
  const { redisUrl, dataSource, log, owned, notOwned, recordRun } = options;
  const connection = redisConnection(redisUrl);
  const prefix = options.prefix ?? QUEUE_PREFIX;
  const queues: Queue[] = [];
  const workers: Worker[] = [];

  for (const job of notOwned) {
    const queue = new Queue(queueName(job), { connection, prefix });
    await queue.removeJobScheduler(job);
    await queue.close();
  }

  for (const [job, definition] of owned) {
    const queue = new Queue(queueName(job), { connection, prefix });
    queues.push(queue);
    await queue.upsertJobScheduler(
      job,
      { every: definition.everyMs },
      { name: job, opts: { removeOnComplete: 50, removeOnFail: 200 } },
    );
    const worker = new Worker(
      queueName(job),
      async () => {
        const started = new Date();
        let outcome: RunRecord['outcome'] = 'ok';
        let error: string | undefined;
        try {
          const ran = await withJobLock(dataSource, job, definition.run);
          if (!ran) {
            outcome = 'skipped';
            log.info({ job }, 'Skipping job: another worker is running it');
          }
        } catch (failure) {
          outcome = 'error';
          error = failure instanceof Error ? failure.message : String(failure);
          log.error({ job, err: failure }, 'Job failed');
        }
        const finished = new Date();
        const record: RunRecord = {
          started_at: started.toISOString(),
          finished_at: finished.toISOString(),
          duration_ms: finished.getTime() - started.getTime(),
          outcome,
          ...(error === undefined ? {} : { error }),
        };
        await recordRun(job, record).catch((failure: unknown) => log.warn({ job, err: failure }, 'Could not record the run'));
        // A failed run is logged and recorded; the next tick tries again, as
        // APScheduler did, so BullMQ itself never retries it.
      },
      { connection, prefix, concurrency: 1 },
    );
    worker.on('error', (failure) => log.error({ job, err: failure }, 'Job worker error'));
    workers.push(worker);
    log.info({ job, everyMs: definition.everyMs }, 'Job scheduled');
  }

  return {
    // Waits for running jobs to finish, then lets go of Redis.
    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(queues.map((queue) => queue.close()));
      await connection.quit();
    },
  };
}
