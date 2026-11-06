import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import { redactSecrets } from '../meta/redact.ts';

// Durable, secret-safe account health (services/account_health.py; #611
// stage 4): one account_health row per ad account, written by the account
// sync and by the rules when Meta refuses a token.

const USER_MARKERS = ['token', 'permission', 'scope', 'reconnect', 'oauth', 'disabled', 'unsettled', 'payment', 'account status', 'access denied'];
const META_MARKERS = ['meta', 'facebook', 'graph', 'rate limit', 'quota', 'throttl', 'temporarily unavailable', 'service unavailable'];

export type HealthCause = 'user' | 'meta' | 'system';

// str(error) of what Python would have raised or passed.
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// str(error or "unknown error")
const describe = (error: unknown): string => {
  if (error === null || error === undefined || error === '') return 'unknown error';
  return errorText(error);
};

// The first `length` code points, as a Python slice takes them.
const head = (text: string, length: number): string => Array.from(text).slice(0, length).join('');

// classify_health_error: a stable error code and the responsible domain.
export function classifyHealthError(error: unknown): { code: string; cause: HealthCause } {
  const lowered = describe(error).toLowerCase();
  let cause: HealthCause = 'system';
  if (USER_MARKERS.some((marker) => lowered.includes(marker))) cause = 'user';
  else if (META_MARKERS.some((marker) => lowered.includes(marker))) cause = 'meta';
  const code = head(lowered.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''), 64) || 'unknown_error';
  return { code, cause };
}

export function safeHealthMessage(error: unknown): string {
  return head(redactSecrets(describe(error)), 240);
}

// datetime.now(timezone.utc).isoformat(): microseconds only when there are any.
export function pythonUtcIso(moment: Date): string {
  const base = moment.toISOString().slice(0, 19);
  const millis = moment.getUTCMilliseconds();
  return `${base}${millis ? `.${String(millis).padStart(3, '0')}000` : ''}+00:00`;
}

export interface HealthRow {
  id: number;
  status: string;
  cause: string;
  consecutive_failures: number;
  last_error_code: string;
  last_error_message: string;
}

export interface HealthUpdate {
  success: boolean;
  error?: unknown;
  cause?: HealthCause | null;
  signals?: Record<string, unknown>;
}

// record_account_health: upserts the row and says whether its status or
// cause changed (a new row that starts healthy is not a change).
export async function recordAccountHealth(
  tx: EntityManager,
  account: { id: number; workspace_id: number | null },
  update: HealthUpdate,
  now: Date = new Date(),
): Promise<{ row: HealthRow | null; transitioned: boolean }> {
  if (account.workspace_id === null) return { row: null, transitioned: false };
  const [existing] = await rows<HealthRow & { signals: Record<string, unknown> | null }>(
    tx,
    'SELECT id, status, cause, consecutive_failures, last_error_code, last_error_message, signals FROM account_health WHERE account_pk = $1 FOR UPDATE',
    [account.id],
  );
  const created = !existing;
  const previous = existing ? `${existing.status}\u0000${existing.cause}` : 'unknown\u0000none';
  const signals: Record<string, unknown> = { ...(existing?.signals ?? {}), ...(update.signals ?? {}) };
  signals.data_fresh_at = update.success ? pythonUtcIso(now) : (signals.data_fresh_at ?? null);

  let fields: Record<string, unknown>;
  if (update.success) {
    fields = { status: 'healthy', cause: 'none', consecutive_failures: 0, last_success_at: now, last_error_code: '', last_error_message: '' };
  } else {
    const classified = classifyHealthError(update.error);
    const failures = Number(existing?.consecutive_failures || 0) + 1;
    const cause = update.cause || classified.cause;
    fields = {
      status: failures >= 3 || cause === 'user' ? 'critical' : 'degraded',
      cause,
      consecutive_failures: failures,
      last_error_at: now,
      last_error_code: classified.code,
      last_error_message: safeHealthMessage(update.error),
    };
  }
  const transitioned = previous !== `${String(fields.status)}\u0000${String(fields.cause)}` && !(created && update.success);
  if (transitioned) fields.last_transition_at = now;
  fields.workspace_id = account.workspace_id;
  fields.last_checked_at = now;
  fields.signals = JSON.stringify(signals);

  const names = Object.keys(fields);
  const values = names.map((name) => fields[name]);
  const cast = (name: string, index: number) => (name === 'signals' ? `$${index}::jsonb` : `$${index}`);
  let row: HealthRow | undefined;
  if (existing) {
    [row] = await rows<HealthRow>(
      tx,
      `UPDATE account_health SET ${names.map((name, index) => `${name} = ${cast(name, index + 2)}`).join(', ')}, updated_at = now()
       WHERE id = $1 RETURNING id, status, cause, consecutive_failures, last_error_code, last_error_message`,
      [existing.id, ...values],
    );
  } else {
    [row] = await rows<HealthRow>(
      tx,
      `INSERT INTO account_health (account_pk, ${names.join(', ')}) VALUES ($1, ${names.map((name, index) => cast(name, index + 2)).join(', ')})
       RETURNING id, status, cause, consecutive_failures, last_error_code, last_error_message`,
      [account.id, ...values],
    );
  }
  return { row: row ?? null, transitioned };
}
