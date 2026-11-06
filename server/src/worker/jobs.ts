import type { DataSource } from 'typeorm';

// Background jobs the TypeScript worker can own (#611 stage 4, decision 54).
// They move from the Python worker (services/worker.py) one at a time:
// TS_WORKER_JOBS lists the ones this worker runs, and the Python worker
// skips exactly those (core/worker_jobs.py). Moving one back is removing it
// from the list and restarting both workers.
//
// Jobs that call Meta (account sync and rules, day-boundary runs, analytics
// store, inventory cache, account health, token rotation) are not here: they
// stay on Python until the TypeScript Meta client and the side-by-side rules
// comparison are done.

// The advisory lock each run holds, pg_try_advisory_lock(namespace, number).
// The same numbers as core/worker_jobs.py SHARED_JOBS: a job is never run by
// both workers at once, even while a deploy swaps containers.
export const LOCK_NAMESPACE = 611;
export const SHARED_JOBS = {
  inbox_email: 1,
  inbox_telegram: 2,
  inbox_push: 3,
  sync_log_compaction: 4,
  worker_watchdog: 5,
} as const;

export type JobId = keyof typeof SHARED_JOBS;

export const isJobId = (value: string): value is JobId => Object.hasOwn(SHARED_JOBS, value);

// TS_WORKER_JOBS as a set of known ids, and the names it holds that are not jobs.
export function parseJobList(raw: string): { jobs: Set<JobId>; unknown: string[] } {
  const jobs = new Set<JobId>();
  const unknown: string[] = [];
  for (const item of raw.split(',')) {
    const name = item.trim();
    if (!name) continue;
    if (isJobId(name)) jobs.add(name);
    else unknown.push(name);
  }
  return { jobs, unknown };
}

// Runs `work` while holding the job's advisory lock on a connection of its
// own; resolves to false without running it when another worker holds it.
export async function withJobLock(dataSource: DataSource, job: JobId, work: () => Promise<void>): Promise<boolean> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const [row] = (await runner.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', [LOCK_NAMESPACE, SHARED_JOBS[job]])) as {
      acquired: boolean;
    }[];
    if (!row?.acquired) return false;
    try {
      await work();
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, SHARED_JOBS[job]]);
    }
    return true;
  } finally {
    await runner.release();
  }
}
