import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { EntityManager } from 'typeorm';
import { recordAuditEvent } from '../audit/events.ts';
import { rows, type Database } from '../database.ts';
import { META_TIMEZONE_ALIASES } from '../graphql/areas/accounts/clock.ts';
import { redactSecrets } from '../meta/redact.ts';

// The account day boundary (scheduler/worker.py run_day_boundary_cycle,
// core/timezones.py evaluate_day_boundary; #611 stage 4): once a minute,
// every ad account whose local date changed gets ACCOUNT_DAY_STARTED in its
// history, when the change is seen within five minutes of local midnight.
// No Meta calls: the account's clock is its stored time zone.

export const DAY_BOUNDARY_NOTIFICATION_WINDOW_MINUTES = 5;

export interface DayBoundaryDecision {
  current_date: string;
  should_update: boolean;
  should_notify: boolean;
  reason: 'same_date' | 'initialized' | 'new_day' | 'missed_window';
}

// The account's local wall clock, as datetime.astimezone(ZoneInfo(name)) shows it.
export interface LocalNow {
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
  offsetMinutes: number;
}

// resolve_account_clock: the stripped, canonical zone name, or null for none
// or one the system does not know.
export function accountClock(value: string | null | undefined): { configured: string; canonical: string } | null {
  const configured = String(value ?? '').trim();
  if (!configured) return null;
  const canonical = META_TIMEZONE_ALIASES[configured] ?? configured;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: canonical });
  } catch {
    return null;
  }
  return { configured, canonical };
}

const formats = new Map<string, Intl.DateTimeFormat>();

export function localNow(zone: string, now: Date): LocalNow {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'longOffset',
    });
    formats.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(now).map((part) => [part.type, part.value]));
  // "GMT", "GMT+05:30", "GMT-03:00"
  const offset = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(parts.timeZoneName ?? 'GMT');
  const offsetMinutes = offset?.[1] ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), offsetMinutes };
}

// evaluate_day_boundary
export function evaluateDayBoundary(previousDate: string | null | undefined, local: LocalNow, windowMinutes = DAY_BOUNDARY_NOTIFICATION_WINDOW_MINUTES): DayBoundaryDecision {
  const current = local.date;
  const previous = String(previousDate ?? '').trim();
  if (previous === current) return { current_date: current, should_update: false, should_notify: false, reason: 'same_date' };
  if (!previous) return { current_date: current, should_update: true, should_notify: false, reason: 'initialized' };
  const minutes = local.hour * 60 + local.minute;
  const notify = minutes >= 0 && minutes < Math.max(1, windowMinutes);
  return { current_date: current, should_update: true, should_notify: notify, reason: notify ? 'new_day' : 'missed_window' };
}

// utc_offset_label: "UTC+05:00", with a true minus sign west of Greenwich.
export function utcOffsetLabel(local: LocalNow): string {
  const total = local.offsetMinutes;
  const sign = total >= 0 ? '+' : '−';
  const absolute = Math.abs(total);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

interface AccountRow {
  id: number;
  account_id: string;
  name: string | null;
  workspace_id: number | null;
  owner_user_id: number | null;
  timezone_name: string | null;
  last_day_start_date: string | null;
}

export interface DayBoundaryStats {
  cycle_id: string;
  accounts_seen: number;
  dates_initialized: number;
  days_notified: number;
  boundaries_missed: number;
  invalid_timezones: number;
  errors: string[];
}

// Python's repr() of a str, for the log line.
const repr = (value: string | null): string => (value === null ? 'None' : `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`);

// MonitoringWorker._persist_audit_event for the day boundary: an account in
// no workspace is quarantined, one without an owner takes the workspace's.
async function recordDayStarted(tx: EntityManager, account: AccountRow, cycleId: string, fields: { message: string; before: Record<string, unknown>; after: Record<string, unknown>; details: Record<string, unknown> }): Promise<number> {
  if (account.workspace_id === null) throw new Error(`Account ${account.account_id} has no workspace; audit event is quarantined`);
  let owner = account.owner_user_id;
  if (owner === null) {
    const [workspace] = await rows<{ owner_user_id: number | null }>(tx, 'SELECT owner_user_id FROM workspaces WHERE id = $1', [account.workspace_id]);
    if (!workspace || workspace.owner_user_id === null) throw new Error(`Account ${account.account_id} has no resolvable audit owner`);
    owner = workspace.owner_user_id;
    await rows(tx, 'UPDATE accounts SET owner_user_id = $2 WHERE id = $1 RETURNING id', [account.id, owner]);
  }
  const event = await recordAuditEvent(tx, {
    workspaceId: account.workspace_id,
    ownerUserId: owner,
    actorType: 'system',
    actorId: 'monitoring_worker',
    category: 'MONITORING',
    eventType: 'ACCOUNT_DAY_STARTED',
    status: 'SUCCESS',
    accountId: account.account_id ?? '',
    accountName: account.name ?? '',
    adsetId: '',
    adsetName: '',
    entityLevel: 'adset',
    entityId: '',
    entityName: '',
    ruleId: null,
    ruleName: '',
    action: 'DETECT_ACCOUNT_DAY_BOUNDARY',
    message: redactSecrets(fields.message),
    beforeState: fields.before as never,
    afterState: fields.after as never,
    details: fields.details as never,
    correlationId: cycleId,
    durationMs: 0,
  });
  return event.id;
}

// Rolled back with the account's date, as Python's session.rollback() is:
// the next tick tries the same day again.
class NotRecorded extends Error {}

export async function runDayBoundaryCycle(db: Database, log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>, now: Date = new Date()): Promise<DayBoundaryStats> {
  const stats: DayBoundaryStats = {
    cycle_id: randomUUID().replaceAll('-', ''),
    accounts_seen: 0,
    dates_initialized: 0,
    days_notified: 0,
    boundaries_missed: 0,
    invalid_timezones: 0,
    errors: [],
  };
  const accounts = await db.transaction((tx) =>
    rows<AccountRow>(tx, 'SELECT id, account_id, name, workspace_id, owner_user_id, timezone_name, last_day_start_date FROM accounts ORDER BY id'),
  );
  stats.accounts_seen = accounts.length;
  for (const account of accounts) {
    const accountId = String(account.account_id);
    const clock = accountClock(account.timezone_name);
    if (!clock) {
      stats.invalid_timezones += 1;
      stats.errors.push(`Account ${accountId}: unknown timezone ${repr(account.timezone_name)}`);
      log.error(`Account ${accountId} day boundary skipped: unknown timezone ${repr(account.timezone_name)}`);
      continue;
    }
    const local = localNow(clock.canonical, now);
    const decision = evaluateDayBoundary(account.last_day_start_date, local);
    const timezoneChanged = clock.canonical !== account.timezone_name;
    if (!decision.should_update) {
      if (timezoneChanged) {
        await db.transaction((tx) => rows(tx, 'UPDATE accounts SET timezone_name = $2 WHERE id = $1 RETURNING id', [account.id, clock.canonical]));
      }
      continue;
    }
    const previous = String(account.last_day_start_date ?? '');
    try {
      await db.transaction(async (tx) => {
        await rows(tx, 'UPDATE accounts SET timezone_name = $2, last_day_start_date = $3 WHERE id = $1 RETURNING id', [account.id, clock.canonical, decision.current_date]);
        if (!decision.should_notify) return;
        const offset = utcOffsetLabel(local);
        const localTime = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
        try {
          await recordDayStarted(tx, account, stats.cycle_id, {
            message: `A new day started in the ad account: ${decision.current_date} at ${localTime} (${clock.canonical}, ${offset})`,
            before: { last_day_start_date: previous },
            after: { last_day_start_date: decision.current_date },
            details: { timezone_name: clock.canonical, utc_offset: offset, local_date: decision.current_date, local_time: localTime },
          });
        } catch (error) {
          log.error(`Failed to persist audit event ACCOUNT_DAY_STARTED: ${String(error)}`);
          throw new NotRecorded();
        }
        log.info(`Account ${accountId} entered local date ${decision.current_date} at ${localTime} (${clock.canonical}, ${offset})`);
      });
    } catch (error) {
      if (!(error instanceof NotRecorded)) throw error;
      stats.errors.push(`Account ${accountId}: failed to persist account day boundary`);
      continue;
    }
    if (!decision.should_notify) {
      if (decision.reason === 'initialized') stats.dates_initialized += 1;
      else {
        stats.boundaries_missed += 1;
        log.warn(`Account ${accountId} new local date ${decision.current_date} was observed outside the midnight window`);
      }
      continue;
    }
    stats.days_notified += 1;
  }
  return stats;
}
