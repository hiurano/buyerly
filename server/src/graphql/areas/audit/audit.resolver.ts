import { Arg, Ctx, Int, Query, Resolver } from 'type-graphql';
import { AUDIT_EVENT_COLUMNS, serializeAuditEvents, type AuditEventRow } from '../../../audit/events.ts';
import { accountAccess } from '../../../workspaces/account-access.ts';
import { userWorkspaceMember } from '../../../workspaces/access.ts';
import type { GraphQLContext } from '../../context.ts';
import { invalidInput } from '../../errors.ts';
import { JSONScalar } from '../../scalars.ts';

// The workspace's audit log, the Activity page (api/routers/audit.py
// list_audit_events). auditEventUndo stays Python's until the Meta client
// moves: undoing an action changes the entity on Meta.

// Query(..., ge=, le=, max_length=) as pydantic words a failure; each argument
// is checked on its own, in the route's order, and the first failure answers.
function atLeast(value: number, min: number): number {
  if (value < min) throw invalidInput([`Input should be greater than or equal to ${min}`]);
  return value;
}

function atMost(value: number, max: number): number {
  if (value > max) throw invalidInput([`Input should be less than or equal to ${max}`]);
  return value;
}

function short(value: string | null, max: number): string | null {
  if (value !== null && [...value].length > max) throw invalidInput([`String should have at most ${max} characters`]);
  return value;
}

// pydantic's datetime from a string: an ISO 8601 date or date and time, with
// or without an offset (none means UTC, as asyncpg reads a naive datetime), or
// a Unix timestamp (seconds, or milliseconds past 2e10).
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,6})?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const TIMESTAMP = /^[+-]?\d+(?:\.\d+)?$/;

function datetime(value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  if (TIMESTAMP.test(text)) {
    const number = Number(text);
    return new Date(Math.abs(number) > 2e10 ? number : number * 1000).toISOString();
  }
  const match = ISO_DATETIME.exec(text);
  if (!match || Number.isNaN(Date.parse(text.slice(0, 10)))) {
    throw invalidInput(['Input should be a valid datetime or date, invalid character in year']);
  }
  const iso = text.replace(' ', 'T').replace(',', '.');
  return match[1] ? iso : `${iso}${iso.length === 10 ? 'T00:00:00' : ''}Z`;
}

@Resolver()
export class AuditResolver {
  @Query(() => JSONScalar, { description: "A page of the workspace's audit log, newest first." })
  async auditEvents(
    @Ctx() { app, user }: GraphQLContext,
    @Arg('page', () => Int, { nullable: true, defaultValue: null }) page: number | null,
    @Arg('pageSize', () => Int, { nullable: true, defaultValue: null }) pageSize: number | null,
    @Arg('category', () => String, { nullable: true, defaultValue: null }) category: string | null,
    @Arg('status', () => String, { nullable: true, defaultValue: null }) status: string | null,
    @Arg('accountId', () => String, { nullable: true, defaultValue: null }) accountId: string | null,
    @Arg('ruleId', () => Int, { nullable: true, defaultValue: null }) ruleId: number | null,
    @Arg('search', () => String, { nullable: true, defaultValue: null }) search: string | null,
    @Arg('dateFrom', () => String, { nullable: true, defaultValue: null }) dateFrom: string | null,
    @Arg('dateTo', () => String, { nullable: true, defaultValue: null }) dateTo: string | null,
  ): Promise<unknown> {
    const pageNumber = atLeast(page ?? 1, 1);
    const size = atMost(atLeast(pageSize ?? 25, 1), 100);
    short(category, 40);
    short(status, 20);
    short(accountId, 80);
    short(search, 100);
    const from = datetime(dateFrom);
    const to = datetime(dateTo);

    return app.db.transaction(async (tx) => {
      const found = await userWorkspaceMember(tx, user);
      const workspaceId = found?.workspace.id ?? null;
      const member = found?.member ?? null;
      const canWriteWorkspace = !!member && member.role !== 'guest';

      const params: unknown[] = [];
      const param = (value: unknown): string => {
        params.push(value);
        return `$${params.length}`;
      };
      // Legacy rows without a workspace never show in a workspace's history.
      const filters = [workspaceId === null ? 'false' : `workspace_id = ${param(workspaceId)}`];
      if (workspaceId !== null) {
        // A private team's accounts, and for a guest everything off their teams, stay out.
        const access = await accountAccess(tx, member, workspaceId);
        if (!access.everything) {
          const visible = access.actIds.size ? `account_id = ANY(${param([...access.actIds].sort())}::text[])` : 'false';
          filters.push(member?.role === 'guest' ? visible : `(${visible} OR account_id = '')`);
        }
      }
      if (category) filters.push(`category = ${param(category.toUpperCase())}`);
      if (accountId) filters.push(`account_id = ${param(accountId)}`);
      if (ruleId !== null) filters.push(`rule_id = ${param(ruleId)}`);
      if (from) filters.push(`created_at >= ${param(from)}::timestamptz`);
      if (to) filters.push(`created_at <= ${param(to)}::timestamptz`);
      if (search && search.trim()) {
        const pattern = param(`%${search.trim()}%`);
        const columns = ['account_name', 'account_id', 'adset_name', 'adset_id', 'entity_name', 'entity_id', 'rule_name', 'message'];
        filters.push(`(${columns.map((column) => `${column} ILIKE ${pattern}`).join(' OR ')})`);
      }
      const statusFilters = [...filters];
      const statusParams = [...params];
      if (status) {
        const normalized = status.toUpperCase();
        if (normalized === 'REVERTED') {
          filters.push(`id IN (SELECT reverts_event_id FROM audit_events WHERE reverts_event_id IS NOT NULL AND workspace_id ${workspaceId === null ? 'IS NULL' : `= ${param(workspaceId)}`})`);
        } else {
          filters.push(`status = ${param(normalized)}`);
        }
      }
      const where = filters.join(' AND ');
      const statusWhere = statusFilters.join(' AND ');

      const [{ total }] = await tx.query<{ total: number }[]>(`SELECT count(*)::int AS total FROM audit_events WHERE ${where}`, params);
      const statusRows = await tx.query<{ status: string; count: number }[]>(
        `SELECT status, count(id)::int AS count FROM audit_events WHERE ${statusWhere} GROUP BY status`,
        statusParams,
      );
      const [{ reverted }] = await tx.query<{ reverted: number }[]>(
        `SELECT count(reverts_event_id)::int AS reverted FROM audit_events WHERE reverts_event_id IS NOT NULL AND ${statusWhere}`,
        statusParams,
      );
      const rows = await tx.query<AuditEventRow[]>(
        `SELECT ${AUDIT_EVENT_COLUMNS} FROM audit_events WHERE ${where}
          ORDER BY created_at DESC, id DESC OFFSET ${(pageNumber - 1) * size} LIMIT ${size}`,
        params,
      );
      const items = await serializeAuditEvents(tx, rows, { workspaceId, canWriteWorkspace, user });

      const statusCounts: Record<string, number> = {};
      for (const row of statusRows) statusCounts[row.status] = row.count;
      statusCounts.REVERTED = reverted;
      return {
        items,
        page: pageNumber,
        page_size: size,
        total,
        total_pages: Math.max(1, Math.ceil(total / size)),
        status_counts: statusCounts,
      };
    });
  }
}
