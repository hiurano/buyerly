import type { FastifyBaseLogger } from 'fastify';
import type { EntityManager } from 'typeorm';
import type { Database } from '../database.ts';
import { rows } from '../database.ts';
import { AuditEventEntity } from '../entities/index.ts';
import { pythonIso } from '../notifications/telegram-link.ts';

// The worker watchdog (#199). It runs in the API server, not the worker
// (#685): a stalled or paused worker can't report its own stall. The proof of
// work is `finished_at` of the last completed monitoring cycle in
// automation_runtime_states['monitoring'].
// Once that is CRITICAL_LAG_SECONDS old, every workspace with an active ad
// account gets one urgent WORKER_STALLED Inbox notification, and
// WORKER_RECOVERED once cycles finish again.

export const WARNING_LAG_SECONDS = 180;
export const CRITICAL_LAG_SECONDS = 360;
export const CHECK_INTERVAL_MS = 60_000;
const STATE_KEY = 'worker_watchdog';
export const STALLED_EVENT = 'WORKER_STALLED';
export const RECOVERED_EVENT = 'WORKER_RECOVERED';

export interface CycleStatus {
  status: 'ok' | 'warning' | 'critical' | 'unknown';
  lag_seconds: number | null;
  finished_at: string | null;
  errors_count: unknown;
}

// A stored moment as Python's datetime.fromisoformat reads it (naive means
// UTC), in microseconds since the epoch, and as .isoformat() writes it back.
export function parsePythonIso(value: unknown): { micros: number; iso: string } | null {
  if (!value || typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.replace('Z', '+00:00'));
  if (!match) return null;
  const [, date, hour, minute, second = '00', fraction = '', zone = '+00:00'] = match;
  const offset = zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const millis = Date.parse(`${date}T${hour}:${minute}:${second}${offset}`);
  if (Number.isNaN(millis)) return null;
  const micro = Number(fraction.padEnd(6, '0') || '0');
  const iso = `${date}T${hour}:${minute}:${second}${micro ? `.${String(micro).padStart(6, '0')}` : ''}${offset}`;
  return { micros: millis * 1000 + micro, iso };
}

// cycle_status: freshness of the last completed monitoring cycle; "unknown"
// when the worker never finished one (a fresh install).
export function cycleStatus(payload: Record<string, unknown> | null, now: Date = new Date()): CycleStatus {
  const finished = parsePythonIso(payload?.finished_at);
  if (!finished) return { status: 'unknown', lag_seconds: null, finished_at: null, errors_count: null };
  const lag = Math.max(0, Math.floor((now.getTime() * 1000 - finished.micros) / 1_000_000));
  const status = lag >= CRITICAL_LAG_SECONDS ? 'critical' : lag >= WARNING_LAG_SECONDS ? 'warning' : 'ok';
  return { status, lag_seconds: lag, finished_at: finished.iso, errors_count: payload?.errors_count ?? null };
}

// The advisory lock a pass holds for its transaction (jobs.ts LOCK_NAMESPACE,
// the number the worker's `worker_watchdog` job had): during a deploy the old
// and the new API process never alert twice.
const LOCK = [611, 5] as const;

// One locked pass; null when another API process holds the lock.
export async function checkLocked(db: Database, log: FastifyBaseLogger, now: Date = new Date()): Promise<(CycleStatus & { action: string | null }) | null> {
  return db.transaction(async (tx) => {
    const [lock] = await rows<{ acquired: boolean }>(tx, 'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired', [...LOCK]);
    return lock?.acquired ? checkIn(tx, log, now) : null;
  });
}

// The loop in the API process: a pass every CHECK_INTERVAL_MS; the returned
// function stops it.
export function startWatchdog(db: Database, log: FastifyBaseLogger, intervalMs: number = CHECK_INTERVAL_MS): () => void {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    checkLocked(db, log)
      .catch((error: unknown) => log.error({ err: error }, 'Worker watchdog pass failed'))
      .finally(() => { running = false; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

// The pass inside a transaction of the caller's.
export async function checkIn(tx: EntityManager, log: FastifyBaseLogger, now: Date = new Date()): Promise<CycleStatus & { action: string | null }> {
  const [monitoring] = await rows<{ payload: Record<string, unknown> | null }>(
    tx,
    "SELECT payload FROM automation_runtime_states WHERE state_key = 'monitoring'",
  );
  const status = cycleStatus(monitoring?.payload ?? null, now);
  const [stateRow] = await rows<{ payload: Record<string, unknown> | null }>(
    tx,
    'SELECT payload FROM automation_runtime_states WHERE state_key = $1 FOR UPDATE',
    [STATE_KEY],
  );
  let state = stateRow?.payload ?? {};
  const alerted = Boolean(state.alerted_at);
  let action: string | null = null;
  let message = '';
  let eventStatus = '';
  if (status.status === 'critical' && !alerted) {
    action = STALLED_EVENT;
    const minutes = Math.floor(status.lag_seconds! / 60);
    message = `Buyerly has not finished checking rules for ${minutes} min `
      + `(last completed check ${status.finished_at}). Rules are not being `
      + 'applied until the worker recovers.';
    eventStatus = 'ERROR';
    state = { alerted_at: pythonIso(now), stalled_since: status.finished_at };
  } else if (status.status === 'ok' && alerted) {
    action = RECOVERED_EVENT;
    message = 'Buyerly is checking rules again.';
    eventStatus = 'SUCCESS';
    state = { recovered_at: pythonIso(now), stalled_since: state.stalled_since ?? null };
  }
  if (!action) return { ...status, action };

  const workspaces = await rows<{ id: number; owner_user_id: number | null }>(
    tx,
    `SELECT id, owner_user_id FROM workspaces
      WHERE id IN (SELECT workspace_id FROM accounts WHERE is_active = true) ORDER BY id`,
  );
  const details = { lag_seconds: status.lag_seconds, last_finished_at: status.finished_at };
  const events = tx.getRepository(AuditEventEntity);
  await events.save(workspaces.map((workspace) => events.create({
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_user_id,
    actorType: 'system',
    actorId: 'worker_watchdog',
    category: 'SYSTEM',
    eventType: action,
    status: eventStatus,
    entityLevel: '',
    action: eventStatus === 'ERROR' ? 'INVESTIGATE' : 'MONITOR',
    message,
    details,
  })));
  await rows(
    tx,
    `INSERT INTO automation_runtime_states (state_key, payload, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [STATE_KEY, JSON.stringify(state)],
  );
  const level = action === STALLED_EVENT ? 'error' : 'warn';
  log[level]({ lagSeconds: status.lag_seconds, workspaces: workspaces.length }, `Worker watchdog: ${action}`);
  return { ...status, action };
}
