import { afterAll, beforeAll, describe } from 'vitest';
import type { DataSource } from 'typeorm';
import { testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';
import { bootstrapCases } from './bootstrap.cases.ts';
import { deltaCases } from './delta.cases.ts';

// The sync engine's contract (tests/test_sync_bootstrap.py, tests/test_sync_stream.py)
// over HTTP. One file, so its cases run one after another: a few of them move
// the change log's compaction mark, which every other sync case reads.

export interface SyncContext {
  target: Target;
  db: DataSource;
}

describe.skipIf(!DATABASE_URL)('sync', () => {
  const context = {} as SyncContext;

  beforeAll(async () => {
    context.target = await contractTarget();
    context.db = await testDatabase();
  });

  afterAll(async () => {
    await context.target?.close();
    await context.db?.destroy();
  });

  bootstrapCases(context);
  deltaCases(context);
});
