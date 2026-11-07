import Fastify from 'fastify';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOver } from '../../src/database.ts';
import { checkIn, cycleStatus } from '../../src/worker/watchdog.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

// The worker watchdog (services/worker_watchdog.py; tests/test_worker_watchdog.py).

const log = Fastify({ logger: false }).log;
const NOW = new Date('2026-10-07T12:00:00Z');

const PAYLOADS: (Record<string, unknown> | null)[] = [
  null,
  {},
  { finished_at: 'not a date' },
  { finished_at: '2026-10-07T11:59:40+00:00', errors_count: 0 },
  { finished_at: '2026-10-07T11:57:00.000001+00:00', errors_count: 2 },
  { finished_at: '2026-10-07T11:56:59.5Z' },
  { finished_at: '2026-10-07T11:54:00' },
  { finished_at: '2026-10-07T11:53:59.999999+00:00' },
  { finished_at: '2026-10-07T12:05:00+00:00' },
  { finished_at: '2026-10-07T13:50:00+02:00' },
];

describe('the last monitoring cycle', () => {
  it('is ok, warning, critical or unknown', () => {
    expect(PAYLOADS.map((payload) => cycleStatus(payload, NOW).status)).toEqual([
      'unknown', 'unknown', 'unknown', 'ok', 'ok', 'warning', 'critical', 'critical', 'ok', 'critical',
    ]);
    expect(cycleStatus({ finished_at: '2026-10-07T11:54:00' }, NOW)).toEqual({
      status: 'critical', lag_seconds: 360, finished_at: '2026-10-07T11:54:00+00:00', errors_count: null,
    });
  });
});

describe.skipIf(!DATABASE_URL)('stall and recovery notifications', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await testDatabase();
  });
  afterAll(async () => {
    await dataSource?.destroy();
  });

  // In one transaction that is rolled back: the monitoring state and every
  // workspace are shared with the other tests.
  it('tells each workspace with an active account once, then once more when cycles resume', async () => {
    const workspace = await createWorkspace(dataSource, await createUser(dataSource));
    const db = databaseOver(dataSource);
    const rollback = new Error('rollback');
    await expect(db.transaction(async (tx) => {
      const finish = (at: Date) => tx.query(
        `INSERT INTO automation_runtime_states (state_key, payload, updated_at) VALUES ('monitoring', $1::jsonb, now())
         ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload`,
        [JSON.stringify({ finished_at: at.toISOString().replace('Z', '+00:00'), errors_count: 0 })],
      );
      await tx.query("DELETE FROM automation_runtime_states WHERE state_key = 'worker_watchdog'");
      const events = async () => tx.query<{ event_type: string; status: string; action: string; message: string; details: Record<string, unknown> }[]>(
        "SELECT event_type, status, action, message, details FROM audit_events WHERE workspace_id = $1 AND actor_id = 'worker_watchdog' ORDER BY id",
        [workspace.id],
      );

      await finish(new Date(NOW.getTime() - 200_000));
      expect((await checkIn(tx, log, NOW)).action).toBeNull();
      await finish(new Date(NOW.getTime() - 432_000));
      expect((await checkIn(tx, log, NOW)).action).toBe('WORKER_STALLED');
      expect((await checkIn(tx, log, NOW)).action).toBeNull();
      const [stalled] = await events();
      expect(stalled).toMatchObject({
        event_type: 'WORKER_STALLED',
        status: 'ERROR',
        action: 'INVESTIGATE',
        message: 'Buyerly has not finished checking rules for 7 min (last completed check 2026-10-07T11:52:48+00:00). Rules are not being applied until the worker recovers.',
        details: { lag_seconds: 432, last_finished_at: '2026-10-07T11:52:48+00:00' },
      });
      await finish(new Date(NOW.getTime() - 10_000));
      expect((await checkIn(tx, log, NOW)).action).toBe('WORKER_RECOVERED');
      expect((await events()).map((event) => [event.event_type, event.status, event.action])).toEqual([
        ['WORKER_STALLED', 'ERROR', 'INVESTIGATE'],
        ['WORKER_RECOVERED', 'SUCCESS', 'MONITOR'],
      ]);
      const [state] = await tx.query<{ payload: Record<string, unknown> }[]>("SELECT payload FROM automation_runtime_states WHERE state_key = 'worker_watchdog'");
      expect(state?.payload).toEqual({ recovered_at: '2026-10-07T12:00:00+00:00', stalled_since: '2026-10-07T11:52:48+00:00' });
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
