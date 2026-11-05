import { Ctx, Query, Resolver } from 'type-graphql';
import { pyRound } from '../../../python-numbers.ts';
import { accountAccess, allowsAccountPk } from '../../../workspaces/account-access.ts';
import { userWorkspace } from '../../../workspaces/access.ts';
import type { GraphQLContext } from '../../context.ts';
import { JSONScalar } from '../../scalars.ts';

// The workspace's reliability page (api/routers/health.py health_overview):
// SLI targets and measurements, the worker's freshness, and the saved health
// of each ad account the member may see. The probes themselves (/health/live,
// /health/ready, /health/worker) stay REST (decision 55).

// services/worker_watchdog.py thresholds.
const WARNING_LAG_SECONDS = 180;
const CRITICAL_LAG_SECONDS = 360;
const PROBLEM_TOKEN_STATUSES = ['expired', 'needs_reconnect', 'missing_scopes', 'error'];

// datetime.isoformat() of a timestamptz as asyncpg reads it (UTC, "+00:00"),
// microseconds only when there are any.
export function isoformatSql(column: string): string {
  return `CASE WHEN ${column} IS NULL THEN NULL ELSE
    to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM ${column})::bigint % 1000000 = 0 THEN ''
            ELSE to_char(${column} AT TIME ZONE 'UTC', '.US') END
    || '+00:00' END`;
}

// datetime.now(timezone.utc).isoformat().
function isoformatNow(): string {
  const now = new Date();
  const text = now.toISOString().replace('Z', '');
  return `${now.getUTCMilliseconds() ? `${text}000` : text.slice(0, 19)}+00:00`;
}

// datetime.fromisoformat for the stored stamps: a naive one cannot be
// compared with now (Python's TypeError) and counts as unparsable.
const STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

function parseStamp(value: unknown, naiveIsUtc: boolean): Date | null {
  if (!value || typeof value !== 'string') return null;
  const text = value;
  const aware = STAMP.test(text);
  if (!aware && !(naiveIsUtc && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?$/.test(text))) return null;
  const parsed = new Date(aware ? text.replace(' ', 'T') : `${text.replace(' ', 'T')}${text.length === 10 ? 'T00:00:00' : ''}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Python's round(x, 2).
const round2 = (value: number): number => pyRound(value, 2);

// worker_watchdog.cycle_status: a naive finished_at is taken as UTC.
function cycleStatus(payload: Record<string, unknown>): { status: string; lag: number | null; errors: unknown } {
  const finished = parseStamp(payload.finished_at, true);
  if (!finished) return { status: 'unknown', lag: null, errors: null };
  const lag = Math.max(0, Math.trunc((Date.now() - finished.getTime()) / 1000));
  const status = lag >= CRITICAL_LAG_SECONDS ? 'critical' : lag >= WARNING_LAG_SECONDS ? 'warning' : 'ok';
  return { status, lag, errors: payload.errors_count ?? null };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

interface AccountRow {
  id: number;
  account_id: string;
  name: string;
  meta_connection_id: number | null;
}

export interface HealthRow {
  account_pk: number;
  status: string;
  cause: string;
  signals: unknown;
  consecutive_failures: number;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string;
  last_error_message: string;
  last_checked_at: string | null;
}

// services/account_health.py health_payload.
export function healthPayload(row: HealthRow | undefined): Record<string, unknown> {
  if (!row) {
    return {
      status: 'unknown', cause: 'none', signals: {},
      consecutive_failures: 0, last_success_at: null,
      last_error_at: null, last_error_code: '', last_error_message: '',
      last_checked_at: null,
    };
  }
  return {
    status: row.status,
    cause: row.cause,
    signals: record(row.signals),
    consecutive_failures: row.consecutive_failures,
    last_success_at: row.last_success_at,
    last_error_at: row.last_error_at,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    last_checked_at: row.last_checked_at,
  };
}

@Resolver()
export class HealthResolver {
  @Query(() => JSONScalar, { description: 'Reliability signals and ad account health of the active workspace.' })
  async healthOverview(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const workspace = await userWorkspace(tx, user);
      if (!workspace) return { overall_status: 'unknown', counts: {}, accounts: [], signals: {} };

      // workspace_account_access: the membership row only; a support session sees everything.
      const [member] = await tx.query<{ id: number; role: string }[]>(
        'SELECT id, role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspace.id, user.id],
      );
      const access = await accountAccess(
        tx,
        member ? { id: member.id, role: member.role, workspaceId: workspace.id, userId: user.id } : null,
        workspace.id,
      );
      const accounts = (await tx.query<AccountRow[]>(
        `SELECT id, account_id, coalesce(nullif(custom_name, ''), name) AS name, meta_connection_id
           FROM accounts WHERE workspace_id = $1 ORDER BY accounts.name, accounts.id`,
        [workspace.id],
      )).filter((account) => allowsAccountPk(access, account.id));
      const pks = accounts.map((account) => account.id);
      const healthRows = pks.length
        ? await tx.query<HealthRow[]>(
          `SELECT account_pk, status, cause, signals, consecutive_failures,
                  ${isoformatSql('last_success_at')} AS last_success_at, ${isoformatSql('last_error_at')} AS last_error_at,
                  last_error_code, last_error_message, ${isoformatSql('last_checked_at')} AS last_checked_at
             FROM account_health WHERE account_pk = ANY($1::int[]) AND workspace_id = $2`,
          [pks, workspace.id],
        )
        : [];
      const healthByAccount = new Map(healthRows.map((row) => [row.account_pk, row]));

      const [runtimeRow] = await tx.query<{ payload: unknown }[]>(
        "SELECT payload FROM automation_runtime_states WHERE state_key = 'monitoring'",
      );
      const runtime = record(runtimeRow?.payload);
      const cycle = cycleStatus(runtime);

      const [actions] = await tx.query<{ total: number; errors: number }[]>(
        `SELECT count(id)::int AS total, count(id) FILTER (WHERE status = 'ERROR')::int AS errors FROM audit_events
          WHERE workspace_id = $1 AND category = 'RULE_ACTION' AND created_at >= now() - interval '24 hours'`,
        [workspace.id],
      );
      const actionErrorRate = actions.total ? round2((actions.errors / actions.total) * 100) : 0;

      const connectionIds = [...new Set(accounts.map((account) => account.meta_connection_id).filter((id): id is number => !!id))];
      const [{ problems }] = connectionIds.length
        ? await tx.query<{ problems: number }[]>(
          `SELECT count(*)::int AS problems FROM meta_connections
            WHERE workspace_id = $1 AND id = ANY($2::int[]) AND status = ANY($3::text[])`,
          [workspace.id, connectionIds, PROBLEM_TOKEN_STATUSES],
        )
        : [{ problems: 0 }];

      const [settings] = await tx.query<{ soft: number; hard: number }[]>(
        'SELECT usage_soft_limit_percent AS soft, usage_hard_limit_percent AS hard FROM app_settings LIMIT 1',
      );
      const counts: Record<string, number> = { healthy: 0, degraded: 0, critical: 0, unknown: 0 };
      const accountItems = accounts.map((account) => {
        const payload = healthPayload(healthByAccount.get(account.id));
        const status = String(payload.status);
        // counts[status] += 1: an unknown status is the route's KeyError.
        if (!(status in counts)) throw new Error(`Unknown account health status ${status}`);
        counts[status] += 1;
        return { id: account.id, account_id: account.account_id, name: account.name, ...payload };
      });
      let overall = !accounts.length ? 'unknown'
        : counts.critical ? 'critical'
          : counts.degraded ? 'degraded'
            : counts.unknown ? 'unknown' : 'healthy';
      // Saved account health stays green while no cycle runs, so a stale worker overrides it (#199).
      if (accounts.length && cycle.status === 'critical') overall = 'critical';
      else if (accounts.length && cycle.status === 'warning' && overall !== 'critical') overall = 'degraded';

      const usagePercent = Math.trunc(Number(record(runtime.usage).max_percent || 0));
      const synthetic = record(runtime.synthetic);
      const backup = parseStamp(runtime.last_backup_at, false);
      return {
        overall_status: overall,
        counts,
        accounts: accountItems,
        signals: {
          api_availability_target_percent: 99.9,
          api_latency_p95_target_ms: 500,
          api_synthetic_availability_percent: synthetic.availability_percent ?? null,
          api_synthetic_latency_p95_ms: synthetic.latency_p95_ms ?? null,
          api_synthetic_measured_at: synthetic.measured_at ?? null,
          api_synthetic_release_sha: synthetic.release_sha ?? null,
          worker_cycle_status: cycle.status,
          worker_cycle_lag_seconds: cycle.lag,
          worker_cycle_lag_warning_seconds: WARNING_LAG_SECONDS,
          worker_cycle_lag_critical_seconds: CRITICAL_LAG_SECONDS,
          worker_cycle_errors_count: cycle.errors,
          action_error_rate_24h_percent: actionErrorRate,
          action_error_rate_warning_percent: 2,
          action_error_rate_critical_percent: 5,
          meta_quota_percent: usagePercent,
          meta_quota_warning_percent: settings ? settings.soft : 60,
          meta_quota_critical_percent: settings ? settings.hard : 80,
          token_problem_count: problems,
          data_freshness_warning_minutes: 20,
          data_freshness_critical_minutes: 45,
          backup_age_hours: backup ? round2(Math.max(0, (Date.now() - backup.getTime()) / 1000) / 3600) : null,
          backup_age_warning_hours: 26,
          backup_age_critical_hours: 48,
        },
        alert_routes: {
          account_transition: 'Audit Log',
          release_or_platform: 'GitHub Actions + production runbook',
        },
        generated_at: isoformatNow(),
      };
    });
  }
}
