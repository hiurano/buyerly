import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import type { Config } from '../config.ts';
import { databaseOver, type Database } from '../database.ts';
import { compactSyncLog } from '../sync/compaction.ts';
import { SHARED_JOBS, parseJobList, type JobId } from './jobs.ts';
import { RUNS_KEY, redisConnection, startScheduler, type JobDefinition, type RunRecord, type Scheduler } from './scheduler.ts';

// The TypeScript worker (#611 stage 4): Compose service `worker-ts`, from the
// same image as the server (`node server/dist/worker/main.js`). It runs the
// background jobs listed in TS_WORKER_JOBS and answers one health route on
// WORKER_PORT, which Compose's healthcheck and the post-deploy smoke read.

export const WORKER_HEALTH_PATH = '/health/worker-ts';
export const DEFAULT_WORKER_PORT = 8091;

export interface WorkerContext {
  config: Config;
  db: Database;
  log: FastifyInstance['log'];
}

// Every job this worker can run, with the Python worker's interval. A job
// listed in TS_WORKER_JOBS that is not here yet stops the start, so a deploy
// that names it fails and rolls back instead of leaving it run by no one.
export function jobDefinitions(context: WorkerContext): Partial<Record<JobId, JobDefinition>> {
  return {
    // The sync log keeps SYNC_LOG_RETENTION_DAYS; a client further behind bootstraps again.
    sync_log_compaction: {
      everyMs: 24 * 60 * 60 * 1000,
      run: async () => {
        const dropped = await context.db.transaction((tx) => compactSyncLog(tx));
        if (dropped) context.log.info({ dropped }, 'Compacted the sync log');
      },
    },
  };
}

export interface WorkerHealth {
  status: 'ok' | 'not_ready';
  version: string;
  jobs: Partial<Record<JobId, RunRecord | null>>;
}

export interface BuiltWorker {
  app: FastifyInstance;
  owned: JobId[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function buildWorker(config: Config, dataSource: DataSource): BuiltWorker {
  const app = Fastify({ logger: { level: config.logLevel } });
  const db = databaseOver(dataSource);
  const context: WorkerContext = { config, db, log: app.log };

  const { jobs, unknown } = parseJobList(config.tsWorkerJobs);
  if (unknown.length) throw new Error(`TS_WORKER_JOBS names unknown jobs: ${unknown.join(', ')}`);
  const definitions = jobDefinitions(context);
  const missing = [...jobs].filter((job) => !definitions[job]);
  if (missing.length) throw new Error(`TS_WORKER_JOBS names jobs this worker cannot run yet: ${missing.join(', ')}`);
  if (!config.redisUrl) throw new Error('REDIS_URL is not set');

  const owned = new Map<JobId, JobDefinition>([...jobs].map((job) => [job, definitions[job] as JobDefinition]));
  const notOwned = (Object.keys(SHARED_JOBS) as JobId[]).filter((job) => !jobs.has(job) && definitions[job]);
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  redis.on('error', (error) => app.log.warn({ err: error }, 'Redis connection error'));
  let scheduler: Scheduler | null = null;

  app.get(WORKER_HEALTH_PATH, { logLevel: 'warn' }, async (request, reply): Promise<WorkerHealth> => {
    const runs: Partial<Record<JobId, RunRecord | null>> = {};
    let healthy = scheduler !== null;
    try {
      const stored = await redis.hgetall(RUNS_KEY);
      for (const job of owned.keys()) runs[job] = stored[job] ? (JSON.parse(stored[job]) as RunRecord) : null;
      await db.ping();
    } catch (error) {
      request.log.error({ err: error }, 'Worker health check failed');
      healthy = false;
    }
    if (!healthy) reply.code(503);
    return { status: healthy ? 'ok' : 'not_ready', version: config.version, jobs: runs };
  });

  return {
    app,
    owned: [...owned.keys()],
    async start() {
      await redis.connect();
      scheduler = await startScheduler({
        connection: redisConnection(config.redisUrl),
        dataSource,
        log: app.log,
        owned,
        notOwned,
        recordRun: async (job, record) => {
          await redis.hset(RUNS_KEY, job, JSON.stringify(record));
        },
      });
    },
    // Compose stops the container with SIGTERM: running jobs finish first.
    async stop() {
      const running = scheduler;
      scheduler = null;
      await running?.close();
      await app.close();
      redis.disconnect();
      await db.close();
    },
  };
}
