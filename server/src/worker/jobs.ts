import type { DataSource } from 'typeorm';

// Every background job the worker runs (decision 54; they moved from the
// Python worker in #611 stage 4).
//
// `account_sync` is the data half of the monitoring cycle (account details,
// analytics facts, the inventory cache, account health), `monitoring` the
// rules half: due rule checks and the Meta writes they call for.

// The advisory lock each run holds, pg_try_advisory_lock(namespace, number):
// two worker processes (an old and a new one while a deploy swaps them) never
// run one job at once. The numbers are the ones the Python worker used; 8 was
// the rules engine's shadow run, 5 the worker watchdog (now in the API
// server, worker/watchdog.ts, which still locks 611/5).
export const LOCK_NAMESPACE = 611;
export const JOB_LOCKS = {
  inbox_email: 1,
  inbox_telegram: 2,
  inbox_push: 3,
  sync_log_compaction: 4,
  account_day_boundary: 6,
  account_sync: 7,
  monitoring: 9,
} as const;

export type JobId = keyof typeof JOB_LOCKS;

// Jobs earlier releases scheduled and this one no longer runs: their BullMQ
// schedules are removed at start.
export const RETIRED_JOBS: readonly string[] = ['rules_shadow', 'worker_watchdog'];

// Runs `work` while holding the job's advisory lock on a connection of its
// own; resolves to false without running it when another worker holds it.
export async function withJobLock(dataSource: DataSource, job: JobId, work: () => Promise<void>): Promise<boolean> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const [row] = (await runner.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', [LOCK_NAMESPACE, JOB_LOCKS[job]])) as {
      acquired: boolean;
    }[];
    if (!row?.acquired) return false;
    try {
      await work();
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, JOB_LOCKS[job]]);
    }
    return true;
  } finally {
    await runner.release();
  }
}
