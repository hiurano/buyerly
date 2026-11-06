import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import { compactedThrough } from './log.ts';

// The change log's retention (database/sync_log.py compact_sync_log): the
// worker drops entries older than the window once a day and remembers how far
// it went, so a client further behind bootstraps again instead of missing
// changes (sync/log.ts needsBootstrap).

export const SYNC_LOG_RETENTION_DAYS = 30;
const STATE_KEY = 'sync_log';
const DAY_MS = 24 * 60 * 60 * 1000;

// Drops the old entries in `tx` and returns how many went.
export async function compactSyncLog(tx: EntityManager, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SYNC_LOG_RETENTION_DAYS * DAY_MS);
  const [newestOld] = await rows<{ through: string | null }>(
    tx,
    'SELECT max(sync_id) AS through FROM sync_actions WHERE created_at < $1 AND sync_id IS NOT NULL',
    [cutoff],
  );
  if (newestOld?.through == null) return 0;
  const through = Number(newestOld.through);
  const [deleted] = await rows<{ count: number }>(
    tx,
    'WITH gone AS (DELETE FROM sync_actions WHERE sync_id <= $1 RETURNING 1) SELECT count(*)::int AS count FROM gone',
    [through],
  );
  const previous = await compactedThrough(tx);
  // Other keys of the row stay, as the Python side merges into its payload.
  await rows(
    tx,
    `INSERT INTO automation_runtime_states (state_key, payload, updated_at)
     VALUES ($1, jsonb_build_object('compacted_through', $2::bigint), now())
     ON CONFLICT (state_key) DO UPDATE
     SET payload = coalesce(automation_runtime_states.payload, '{}'::jsonb) || jsonb_build_object('compacted_through', $2::bigint),
         updated_at = now()`,
    [STATE_KEY, Math.max(through, previous)],
  );
  return deleted?.count ?? 0;
}
