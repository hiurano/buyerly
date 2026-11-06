import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import type { Config } from '../config.ts';
import { databaseOver, type Database } from '../database.ts';
import { resendSender, type SendEmail } from '../email/send.ts';
import { deliverInboxEmails, deliverInboxPush, deliverInboxTelegram } from '../notifications/delivery.ts';
import { telegramBot, type TelegramBot } from '../notifications/telegram.ts';
import { pushSender, vapidKey, type SendPush } from '../notifications/web-push.ts';
import { publishSyncBus } from '../sync/bus.ts';
import { compactSyncLog } from '../sync/compaction.ts';
import { SHARED_JOBS, parseJobList, withJobLock, type JobId } from './jobs.ts';
import { runDayBoundaryCycle } from './day-boundary.ts';
import { runRulesShadow } from '../rules/shadow.ts';
import { AccountSync } from './account-sync.ts';
import { RuleCycle } from './rule-cycle.ts';
import { MetaClient } from '../meta/client.ts';
import { PostgresInventoryCache } from '../meta/inventory-cache.ts';
import { CHECK_INTERVAL_MS, checkOnce } from './watchdog.ts';
import { RUNS_KEY, startScheduler, type JobDefinition, type RunRecord, type Scheduler } from './scheduler.ts';

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
  sendEmail: SendEmail;
  telegram: TelegramBot;
  // null without a VAPID key: desktop notifications are off.
  sendPush: SendPush | null;
  // The jobs TS_WORKER_JOBS gives this worker.
  owned: ReadonlySet<JobId>;
  // The worker's Redis connection (run records, the sync bus, the rules shadow run's counts).
  redis: Redis;
  // Runs a job under its advisory lock (jobs.ts withJobLock); false when held elsewhere.
  exclusive: (job: JobId, run: () => Promise<void>) => Promise<boolean>;
  metaFetch?: typeof fetch;
}

// What the jobs talk to outside the database; tests replace them.
export type WorkerServices = Pick<WorkerContext, 'sendEmail' | 'telegram' | 'sendPush'> & {
  // Requests to the Meta Graph API.
  metaFetch: typeof fetch;
};

// Every job this worker can run, with the Python worker's interval. A job
// listed in TS_WORKER_JOBS that is not here yet stops the start, so a deploy
// that names it fails and rolls back instead of leaving it run by no one.
export function jobDefinitions(context: WorkerContext): Partial<Record<JobId, JobDefinition>> {
  const { db, log, config } = context;
  // One Meta client for both halves of the monitoring cycle, so one usage
  // budget paces them, as in Python's worker.
  let metaShared: MetaClient | null = null;
  const meta = (): MetaClient =>
    (metaShared ??= new MetaClient({
      graphVersion: config.metaGraphVersion,
      baseUrl: config.metaGraphBaseUrl,
      appSecret: config.metaAppSecret,
      log,
      ...(context.metaFetch ? { fetch: context.metaFetch } : {}),
      cacheProvider: new PostgresInventoryCache(db, log),
    }));
  // One sync for the worker's life: it remembers which closed days it re-read.
  let sync: AccountSync | null = null;
  const accountSync = (): AccountSync => (sync ??= new AccountSync({ db, log, tokenEncryptionKey: config.metaTokenEncryptionKey, meta: meta() }));
  let rules: RuleCycle | null = null;
  const ruleCycle = (): RuleCycle => (rules ??= new RuleCycle({ db, log, tokenEncryptionKey: config.metaTokenEncryptionKey, meta: meta() }));
  const delivery = { db, log, webappUrl: config.webappUrl };
  const deliveries = {
    inbox_email: {
      everyMs: 60_000,
      run: async () => {
        const sent = await deliverInboxEmails({ ...delivery, sendEmail: context.sendEmail });
        if (sent) log.info({ sent }, 'Sent Inbox notification emails');
      },
    },
    // A push channel: new notifications go out within seconds, not after a pause.
    inbox_telegram: {
      everyMs: 20_000,
      run: async () => {
        if (!context.telegram.configured) return;
        const sent = await deliverInboxTelegram({ ...delivery, telegram: context.telegram });
        if (sent) log.info({ sent }, 'Sent Inbox notifications to Telegram');
      },
    },
    inbox_push: {
      everyMs: 20_000,
      run: async () => {
        if (!context.sendPush) return;
        const sent = await deliverInboxPush({ ...delivery, sendPush: context.sendPush });
        if (sent) log.info({ sent }, 'Sent Inbox notifications to desktops');
      },
    },
    // The sync log keeps SYNC_LOG_RETENTION_DAYS; a client further behind bootstraps again.
    sync_log_compaction: {
      everyMs: 24 * 60 * 60 * 1000,
      run: async () => {
        const dropped = await context.db.transaction((tx) => compactSyncLog(tx));
        if (dropped) context.log.info({ dropped }, 'Compacted the sync log');
      },
    },
  };
  return {
    ...deliveries,
    // Every minute: ACCOUNT_DAY_STARTED within five minutes of each account's local midnight.
    account_day_boundary: {
      everyMs: 60_000,
      run: async () => {
        const stats = await runDayBoundaryCycle(db, log);
        if (stats.days_notified || stats.errors.length) log.info({ ...stats, errors: stats.errors.length }, 'Account day boundary cycle');
      },
    },
    // Every minute: account details, analytics facts, the inventory cache and
    // account health (the data half of the monitoring cycle).
    account_sync: {
      everyMs: 60_000,
      run: async () => {
        const stats = await accountSync().run();
        if (stats.accounts_synced || stats.errors.length) log.info({ ...stats, errors: stats.errors.length }, 'Account sync cycle');
      },
    },
    // Every minute: due rule checks, the Meta reads they need and the writes
    // they call for (the rules half of the monitoring cycle, rule-cycle.ts).
    monitoring: {
      everyMs: 60_000,
      run: async () => {
        const stats = await ruleCycle().run();
        if (stats.accounts_checked || stats.errors.length) log.info({ ...stats, errors: stats.errors.length }, 'Rule cycle');
      },
    },
    // The rules engine's shadow run (#611 stage 4): the TypeScript engine
    // decides on what each Python monitoring cycle saw and the decisions are
    // compared. It reads files and writes Redis only; Meta and the business
    // tables are never touched.
    rules_shadow: {
      everyMs: 30_000,
      run: async () => {
        if (!config.rulesShadowDir) return;
        const stats = await runRulesShadow({ directory: config.rulesShadowDir, redis: context.redis, log });
        if (stats.captures || stats.errors) log.info({ ...stats }, 'Rules shadow run');
      },
    },
    // Every minute, as the API's loop did (services/worker_watchdog.py).
    worker_watchdog: {
      everyMs: CHECK_INTERVAL_MS,
      run: async () => {
        const result = await checkOnce(db, log);
        if (result.status !== 'critical') return;
        // Inbox deliveries still on the stalled Python worker go out from
        // here meanwhile, under their own locks; the ones this worker owns
        // run on their own schedule anyway.
        for (const job of ['inbox_email', 'inbox_telegram', 'inbox_push'] as const) {
          if (!context.owned.has(job)) await context.exclusive(job, deliveries[job].run);
        }
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

export function buildWorker(config: Config, dataSource: DataSource, services: Partial<WorkerServices> = {}): BuiltWorker {
  const app = Fastify({ logger: { level: config.logLevel } });
  const db = databaseOver(dataSource);
  const vapid = vapidKey(config.vapidPrivateKey, app.log);
  const { jobs, unknown } = parseJobList(config.tsWorkerJobs);
  // As core/worker_jobs.py: a name this release does not know is skipped, not
  // fatal. A rollback keeps the newer TS_WORKER_JOBS default, and an older
  // worker that refused to start would leave the jobs it knows run by no
  // one, since the older Python worker still skips them.
  if (unknown.length) app.log.warn(`TS_WORKER_JOBS names jobs this worker does not know: ${unknown.join(', ')}`);
  if (!config.redisUrl) throw new Error('REDIS_URL is not set');
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  redis.on('error', (error) => app.log.warn({ err: error }, 'Redis connection error'));
  const context: WorkerContext = {
    config,
    db,
    log: app.log,
    sendEmail: services.sendEmail ?? resendSender(config, app.log),
    telegram: services.telegram ?? telegramBot(config.telegramBotToken, app.log),
    sendPush: services.sendPush !== undefined ? services.sendPush : vapid ? pushSender(vapid, config.vapidSubject) : null,
    owned: jobs,
    redis,
    exclusive: (job, run) => withJobLock(dataSource, job, run),
    ...(services.metaFetch ? { metaFetch: services.metaFetch } : {}),
  };
  const definitions = jobDefinitions(context);
  const missing = [...jobs].filter((job) => !definitions[job]);
  if (missing.length) throw new Error(`TS_WORKER_JOBS names jobs this worker cannot run yet: ${missing.join(', ')}`);

  const owned = new Map<JobId, JobDefinition>([...jobs].map((job) => [job, definitions[job] as JobDefinition]));
  const notOwned = (Object.keys(SHARED_JOBS) as JobId[]).filter((job) => !jobs.has(job) && definitions[job]);
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
      // Connect now: the job locks open connections of their own (jobs.ts).
      await db.ping();
      await redis.connect();
      scheduler = await startScheduler({
        redisUrl: config.redisUrl,
        dataSource,
        log: app.log,
        owned,
        notOwned,
        recordRun: async (job, record) => {
          await redis.hset(RUNS_KEY, job, JSON.stringify(record));
          // Its writes (Inbox events, Telegram errors, compaction) reach open
          // sync sockets now rather than at the hubs' next poll.
          if (record.outcome === 'ok') await publishSyncBus(redis);
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
