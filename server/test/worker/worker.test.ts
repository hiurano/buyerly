import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { databaseOver } from '../../src/database.ts';
import { compactSyncLog } from '../../src/sync/compaction.ts';
import { compactedThrough, lastSyncId, needsBootstrap } from '../../src/sync/log.ts';
import { readConfig } from '../../src/config.ts';
import { telegramBot } from '../../src/notifications/telegram.ts';
import { buildWorker, jobDefinitions } from '../../src/worker/app.ts';
import { LOCK_NAMESPACE, SHARED_JOBS, parseJobList, withJobLock } from '../../src/worker/jobs.ts';
import { startScheduler, type RunRecord } from '../../src/worker/scheduler.ts';
import { testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

const REDIS_URL = process.env.REDIS_URL ?? '';
const repository = new URL('../../../', import.meta.url);
const pythonSource = (path: string): string => readFileSync(new URL(path, repository), 'utf8');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('job ownership (TS_WORKER_JOBS)', () => {
  it('reads known ids and reports the rest', () => {
    const { jobs, unknown } = parseJobList(' inbox_email, ,sync_log_compaction,monitoring ');
    expect([...jobs]).toEqual(['inbox_email', 'sync_log_compaction']);
    expect(unknown).toEqual(['monitoring']);
  });

  it('uses the Python worker\'s lock numbers', () => {
    const source = pythonSource('core/worker_jobs.py');
    expect(source).toContain(`LOCK_NAMESPACE = ${LOCK_NAMESPACE}`);
    const block = /SHARED_JOBS = \{([^}]*)\}/.exec(source)?.[1] ?? '';
    const python = Object.fromEntries([...block.matchAll(/"(\w+)": (\d+)/g)].map((match) => [match[1], Number(match[2])]));
    expect(python).toEqual(SHARED_JOBS);
  });

  it('runs every job on the Python worker\'s interval', () => {
    const source = pythonSource('services/worker.py');
    const units: Record<string, number> = { seconds: 1000, minutes: 60_000, hours: 3_600_000 };
    const definitions = jobDefinitions({
      config: readConfig({}),
      db: databaseOver({ options: {} } as unknown as DataSource),
      log: Fastify().log,
      sendEmail: async () => true,
      telegram: telegramBot('', Fastify().log),
      sendPush: null,
      owned: new Set(),
      exclusive: async () => true,
    });
    expect(Object.keys(definitions).sort()).toEqual(['inbox_email', 'inbox_push', 'inbox_telegram', 'sync_log_compaction', 'worker_watchdog']);
    // The watchdog ran in the API's loop (services/worker_watchdog.py).
    const watchdog = /CHECK_INTERVAL_SECONDS = (\d+)/.exec(pythonSource('services/worker_watchdog.py'));
    expect(definitions.worker_watchdog?.everyMs).toBe(Number(watchdog![1]) * 1000);
    for (const [job, definition] of Object.entries(definitions).filter(([job]) => job !== 'worker_watchdog')) {
      const match = new RegExp(`\\("${job}", \\w+, \\{"(\\w+)": (\\d+)\\}\\)`).exec(source);
      expect(match, `${job} in services/worker.py`).not.toBeNull();
      expect(definition.everyMs).toBe(Number(match![2]) * units[match![1]]);
    }
  });

  it('refuses to start with a job it cannot run yet', () => {
    const config = readConfig({ TS_WORKER_JOBS: 'sync_log_compaction,no_such_job', REDIS_URL: 'redis://localhost:1' });
    expect(() => buildWorker(config, { options: {} } as unknown as DataSource)).toThrow(/no_such_job/);
  });
});

describe.skipIf(!DATABASE_URL)('job locks and the sync log compaction', () => {
  let first: DataSource;
  let second: DataSource;

  beforeAll(async () => {
    [first, second] = await Promise.all([testDatabase(), testDatabase()]);
  });
  afterAll(async () => {
    await Promise.all([first?.destroy(), second?.destroy()]);
  });

  it('never runs one job in two workers at once', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => { entered = resolve; });
    const running = withJobLock(first, 'worker_watchdog', async () => { entered(); await held; });
    await inside;
    let ran = false;
    expect(await withJobLock(second, 'worker_watchdog', async () => { ran = true; })).toBe(false);
    expect(ran).toBe(false);
    // Another job is free meanwhile.
    expect(await withJobLock(second, 'inbox_push', async () => {})).toBe(true);
    release();
    expect(await running).toBe(true);
    expect(await withJobLock(second, 'worker_watchdog', async () => { ran = true; })).toBe(true);
    expect(ran).toBe(true);
  });

  it('lets go of the lock when the job fails', async () => {
    await expect(withJobLock(first, 'inbox_email', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await withJobLock(second, 'inbox_email', async () => {})).toBe(true);
  });

  // tests/test_sync_log.py test_compaction_drops_old_entries_and_older_clients_bootstrap,
  // inside a transaction that is rolled back: the log is shared by every test.
  it('drops entries past the retention window and older clients bootstrap', async () => {
    const db = databaseOver(first);
    const rollback = new Error('rollback');
    await expect(db.transaction(async (tx) => {
      await tx.query("INSERT INTO sync_actions (model, model_id, action, data, sync_groups, sync_id) VALUES ('Workspace', '0', 'update', '{}', ARRAY['workspace:0'], nextval('sync_actions_sync_id_seq'))");
      const newest = await lastSyncId(tx);
      expect(newest).toBeGreaterThan(0);
      // Today's entries stay (other tests may have left older ones to drop).
      await compactSyncLog(tx);
      const [kept] = await tx.query<{ count: number }[]>('SELECT count(*)::int AS count FROM sync_actions WHERE sync_id = $1', [newest]);
      expect(kept?.count).toBe(1);
      const dropped = await compactSyncLog(tx, new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
      expect(dropped).toBeGreaterThan(0);
      const [left] = await tx.query<{ count: number }[]>('SELECT count(*)::int AS count FROM sync_actions WHERE sync_id IS NOT NULL');
      expect(left?.count).toBe(0);
      expect(await compactedThrough(tx)).toBe(newest);
      expect(await needsBootstrap(tx, 0)).toBe(true);
      expect(await needsBootstrap(tx, newest - 1)).toBe(true);
      expect(await needsBootstrap(tx, newest)).toBe(false);
      // Nothing left to drop: how far it went is kept.
      expect(await compactSyncLog(tx, new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))).toBe(0);
      expect(await compactedThrough(tx)).toBe(newest);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});

describe.skipIf(!DATABASE_URL || !REDIS_URL)('the BullMQ scheduler', () => {
  let dataSource: DataSource;
  let redis: Redis;
  const prefix = `test-${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    dataSource = await testDatabase();
    redis = new Redis(REDIS_URL);
  });
  afterAll(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    redis.disconnect();
    await dataSource?.destroy();
  });

  it('runs an owned job on its interval, one run at a time, and stops on close', async () => {
    let active = 0;
    let most = 0;
    let runs = 0;
    const records: RunRecord[] = [];
    const scheduler = await startScheduler({
      redisUrl: REDIS_URL,
      dataSource,
      log: Fastify({ logger: false }).log,
      prefix,
      owned: new Map([[
        'inbox_push',
        {
          everyMs: 100,
          run: async () => {
            active += 1;
            most = Math.max(most, active);
            runs += 1;
            // Longer than the interval: the next run waits instead of overlapping.
            await sleep(250);
            active -= 1;
          },
        },
      ]]),
      notOwned: ['sync_log_compaction'],
      recordRun: async (_job, record) => { records.push(record); },
    });
    const deadline = Date.now() + 10_000;
    while (runs < 3 && Date.now() < deadline) await sleep(50);
    await scheduler.close();
    const stopped = runs;
    expect(stopped).toBeGreaterThanOrEqual(3);
    expect(most).toBe(1);
    expect(records.every((record) => record.outcome === 'ok')).toBe(true);
    await sleep(400);
    expect(runs).toBe(stopped);
  });
});
