import type { EntityManager } from 'typeorm';
import type { InboxDisplay } from '@buyerly/shared';
import type { UserEntity } from '../entities/index.ts';
import type { AccountAccess } from '../workspaces/account-access.ts';
import { INBOX_KINDS, inboxKinds } from './channels.ts';
import { after, bool, field, list, literal, model, str, validate, ValueError, type Check } from './model.ts';

// A member's Inbox over the audit log (api/routers/audit.py, Linear's Inbox):
// which events are their notifications, which are read, deleted or snoozed,
// what the priority inbox holds and how the filters match. Every piece is
// the SQL SQLAlchemy builds there, over `audit_events` left-joined to the
// member's `inbox_notification_states s`, so both servers count alike.

// Linear notifies the inviter of an accepted invite by email only; a new day
// in an ad account is bookkeeping (#325).
const HIDDEN_EVENT_TYPES = ['INVITE_ACCEPT', 'ACCOUNT_DAY_STARTED'];
const URGENT_EVENT_TYPES = ['ACCOUNT_HEALTH_ALERT', 'ACCOUNT_ISSUE', 'TOKEN_EXPIRED', 'UNDO_ACTION_FAILED'];
const RULE_ACTION_EVENT_TYPES = [
  'STOP', 'AUTO_REACTIVATE', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'PROPOSE_REACTIVATE',
  'STOP_CONFIRMATION_STARTED', 'RULE_ACTION_COOLDOWN', 'RULE_ACTION_PENDING', 'RULE_ACTION_RECONCILED',
];

export const INBOX_PAGE_SIZE = 50;

// Bound parameters of one statement.
export class Params {
  readonly values: unknown[] = [];

  add(value: unknown, cast = ''): string {
    this.values.push(value);
    return `$${this.values.length}${cast}`;
  }

  // The statement and its values, renumbered to the parameters it uses:
  // Postgres refuses a parameter the text never mentions (pieces like the
  // read mark are built for every query but not every query needs them).
  bind(sql: string): [string, unknown[]] {
    const used = new Map<number, number>();
    const text = sql.replace(/\$(\d+)/g, (_match, index: string) => {
      const from = Number(index);
      if (!used.has(from)) used.set(from, used.size + 1);
      return `$${used.get(from)}`;
    });
    return [text, [...used.keys()].map((from) => this.values[from - 1])];
  }
}

const quoted = (values: string[]): string => values.map((value) => `'${value}'`).join(', ');

// _inbox_kind: which kind of notification an event is; the first match wins.
export const KIND_SQL = `CASE
  WHEN (audit_events.event_type IN (${quoted(URGENT_EVENT_TYPES)}) OR audit_events.status = 'ERROR') THEN 'urgent'
  WHEN audit_events.event_type = 'NOTIFY_ONLY' THEN 'rule_alerts'
  WHEN starts_with(audit_events.event_type, 'ASSISTANT_') THEN 'assistant'
  WHEN (audit_events.category = 'WORKSPACE_INVITE' OR starts_with(audit_events.event_type, 'SUPPORT_SESSION_')
        OR starts_with(audit_events.event_type, 'META_INVITE_')) THEN 'team'
  WHEN (audit_events.category = 'MANUAL_ACTION' OR audit_events.actor_type = 'user') THEN 'manual'
  WHEN (audit_events.event_type IN (${quoted(RULE_ACTION_EVENT_TYPES)}) OR audit_events.rule_id IS NOT NULL) THEN 'rule_actions'
  ELSE 'system' END`;

// _inbox_from_key: who a notification is from, as Linear's From filter sees it.
export const FROM_SQL = `CASE
  WHEN audit_events.actor_type = 'user' THEN 'user:' || audit_events.actor_id
  WHEN audit_events.rule_id IS NOT NULL THEN 'rule:' || CAST(audit_events.rule_id AS VARCHAR)
  ELSE 'buyerly' END`;

// Linear's Inbox filter properties, mapped onto audit events.
const FILTER_COLUMNS: Record<string, string> = {
  type: 'audit_events.event_type',
  from: `(${FROM_SQL})`,
  account: 'audit_events.account_id',
  status: 'audit_events.status',
};

export interface FilterClause { field: string; operator: 'is' | 'is_not'; values: string[] }

// A person chosen under From matches whichever id an action recorded them by.
function samePerson(params: Params, values: string[]): string {
  if (!values.some((value) => value.startsWith('user:'))) return 'false';
  const chosen = params.add(values, '::text[]');
  return `CASE WHEN (audit_events.actor_type = 'user' AND (
      audit_events.actor_id IN (SELECT CAST(users.id AS VARCHAR) FROM users WHERE 'user:' || users.telegram_id = ANY(${chosen}))
      OR audit_events.actor_id IN (SELECT users.telegram_id FROM users
        WHERE users.telegram_id IS NOT NULL AND 'user:' || CAST(users.id AS VARCHAR) = ANY(${chosen}))))
    THEN true ELSE false END`;
}

export function filterConditions(params: Params, clauses: FilterClause[]): string[] {
  return clauses.map((clause) => {
    let matches = `${FILTER_COLUMNS[clause.field]} = ANY(${params.add(clause.values, '::text[]')})`;
    if (clause.field === 'from') matches = `(${matches} OR ${samePerson(params, clause.values)})`;
    return clause.operator === 'is' ? `(${matches})` : `(NOT (${matches}))`;
  });
}

// _parse_inbox_filter: the list's filter chips, JSON in the `filter` argument.
export class FilterError extends Error {}

export function parseFilter(raw: string | null): FilterClause[] {
  if (!raw) return [];
  let clauses: unknown;
  try {
    clauses = JSON.parse(raw);
  } catch {
    throw new FilterError('Filter is not valid JSON.');
  }
  if (!Array.isArray(clauses) || clauses.length > Object.keys(FILTER_COLUMNS).length) throw new FilterError('Filter must be a list of clauses.');
  const parsed: FilterClause[] = [];
  for (const clause of clauses as unknown[]) {
    const item = clause as Record<string, unknown>;
    if (
      typeof clause !== 'object' || clause === null || Array.isArray(clause)
      || typeof item.field !== 'string' || !(item.field in FILTER_COLUMNS)
      || (item.operator !== 'is' && item.operator !== 'is_not')
      || !Array.isArray(item.values)
      || !item.values.every((value) => typeof value === 'string')
      || item.values.length > 100
    ) {
      throw new FilterError('Unsupported filter clause.');
    }
    if (item.values.length) parsed.push(item as unknown as FilterClause);
  }
  return parsed;
}

// The priority inbox and Display options (InboxPriorityClause, InboxPriority, InboxDisplay).
const CLAUSE = model('InboxPriorityClause', {
  field: field(literal(['type', 'from'] as const)),
  operator: field(literal(['is', 'is_not'] as const), () => 'is' as const),
  values: field(list(str(), 100, 1)),
});

// A custom filter has at least one condition, and one per property.
const RULES = after(list(list(CLAUSE), 50), (rules) => {
  for (const rule of rules) {
    const fields = rule.map((clause) => clause.field);
    if (!fields.length || new Set(fields).size !== fields.length) throw new ValueError('A custom filter needs one condition per property.');
  }
  return rules;
});

export interface Priority { kinds: string[]; rules: FilterClause[][] }

const PRIORITY: Check<Priority> = model('InboxPriority', {
  kinds: field(list(literal(INBOX_KINDS), INBOX_KINDS.length)),
  rules: field(RULES, () => []),
});

export const INBOX_DISPLAY: Check<InboxDisplay> = model('InboxDisplay', {
  unread_only: field(bool, () => false),
  ordering: field(literal(['newest', 'oldest'] as const), () => 'newest' as const),
  show_snoozed: field(bool, () => false),
  unread_first: field(bool, () => false),
  grouping: field(literal(['none', 'focus'] as const), () => 'none' as const),
  priority_inbox: field(bool, () => false),
  // Linear starts with every kind in the priority inbox.
  priority_kinds: field(inboxKinds, () => [...INBOX_KINDS]),
  priority_rules: field(RULES, () => []),
  badge_count: field(literal(['all', 'priority', 'none'] as const), () => 'all' as const),
});

export function storedInboxDisplay(stored: unknown): InboxDisplay {
  const parsed = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? validate(INBOX_DISPLAY, stored).value : null;
  return parsed ?? validate(INBOX_DISPLAY, {}).value!;
}

export const displayPriority = (display: InboxDisplay): Priority => ({ kinds: display.priority_kinds, rules: display.priority_rules });

// _parse_inbox_priority: the `priority` argument, InboxPriority as JSON; null when not given.
export function parsePriority(raw: string | null): Priority | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new FilterError('Unsupported priority inbox.');
  }
  const parsed = validate(PRIORITY, value).value;
  if (!parsed) throw new FilterError('Unsupported priority inbox.');
  return parsed;
}

// _inbox_priority: one of the chosen kinds, or a match for any custom filter.
export function prioritySql(params: Params, priority: Priority): string {
  const byKind = priority.kinds.length ? `(${KIND_SQL}) = ANY(${params.add(priority.kinds, '::text[]')})` : 'false';
  const byRule = priority.rules.map((rule) => `(${filterConditions(params, rule).join(' AND ')})`);
  return `(${[byKind, ...byRule].join(' OR ')})`;
}

// Who is looking: the member's marks (none for support access) and what they see.
export interface Viewer {
  user: UserEntity;
  workspaceId: number;
  readBefore: Date | null;
  deletedBefore: Date | null;
  access: AccountAccess;
  guest: boolean;
}

export interface InboxColumns {
  join: string;
  isRead: string;
  deleted: string;
  snoozed: string;
  returned: string;
  movedAt: string;
}

// _inbox_columns, _inbox_returned and _inbox_moved_at, at `now`.
export function inboxColumns(params: Params, viewer: Viewer, now: Date): InboxColumns {
  const at = params.add(now, '::timestamptz');
  const readBefore = viewer.readBefore ? params.add(viewer.readBefore, '::timestamptz') : at;
  const own = [...new Set([String(viewer.user.id), viewer.user.telegramId ?? ''])].filter(Boolean);
  // Your own actions and everything before the read mark count as read until you say otherwise.
  const implicitRead = `(audit_events.created_at <= ${readBefore}
    OR (audit_events.actor_type = 'user' AND audit_events.actor_id = ANY(${params.add(own, '::text[]')})))`;
  // The snooze ran out and the member has not touched the notification since.
  const returned = `(s.snoozed_until IS NOT NULL AND s.snoozed_until <= ${at} AND s.updated_at < s.snoozed_until)`;
  const isRead = `(coalesce(s.is_read, ${implicitRead}) AND NOT ${returned})`;
  let deleted = 's.deleted_at IS NOT NULL';
  if (viewer.deletedBefore) {
    deleted = `(${deleted} OR (s.id IS NULL AND audit_events.created_at <= ${params.add(viewer.deletedBefore, '::timestamptz')} AND ${implicitRead}))`;
  }
  return {
    join: `LEFT OUTER JOIN inbox_notification_states s ON s.audit_event_id = audit_events.id AND s.user_id = ${params.add(viewer.user.id)}`,
    isRead,
    deleted: `(${deleted})`,
    snoozed: `(s.snoozed_until IS NOT NULL AND s.snoozed_until > ${at})`,
    returned,
    movedAt: `CASE WHEN (s.snoozed_until IS NOT NULL AND s.snoozed_until <= ${at}) THEN s.snoozed_until ELSE audit_events.created_at END`,
  };
}

// _in_inbox: the events that are this member's notifications. An event on an
// ad account somebody else leads is theirs; events on no account, or on one
// nobody leads, reach everyone; kinds picked in an account's bell decide.
export function inInboxSql(params: Params, viewer: Viewer): string {
  const userId = params.add(viewer.user.id);
  const chosen = `SELECT ans.id FROM account_notification_settings ans
    JOIN workspace_members wm ON wm.id = ans.member_id
    WHERE wm.user_id = ${userId} AND wm.workspace_id = audit_events.workspace_id AND ans.account_id = audit_events.account_id`;
  const ledBySomeoneElse = `SELECT accounts.id FROM accounts
    WHERE accounts.workspace_id = audit_events.workspace_id AND accounts.account_id = audit_events.account_id
      AND accounts.lead_user_id IS NOT NULL AND accounts.lead_user_id != ${userId}`;
  const wanted = `${chosen} AND ans.kind = (${KIND_SQL}) AND ans.enabled IS true`;
  let visible = 'true';
  if (!viewer.access.everything) {
    const onVisible = viewer.access.actIds.size
      ? `audit_events.account_id = ANY(${params.add([...viewer.access.actIds].sort(), '::text[]')})`
      : 'false';
    visible = viewer.guest ? onVisible : `(${onVisible} OR audit_events.account_id = '')`;
  }
  return `(audit_events.event_type NOT IN (${quoted(HIDDEN_EVENT_TYPES)})
    AND ((NOT EXISTS (${chosen}) AND NOT EXISTS (${ledBySomeoneElse})) OR EXISTS (${wanted}))
    AND ${visible})`;
}

export interface ViewOptions {
  unreadOnly: boolean;
  showSnoozed: boolean;
  tab?: string | null;
  priority?: Priority;
}

// _inbox_view_filters: what the list shows before filters; a tab keeps Priority or Other.
export function viewFilters(params: Params, viewer: Viewer, columns: InboxColumns, options: ViewOptions): string[] {
  const filters = [`audit_events.workspace_id = ${params.add(viewer.workspaceId)}`, inInboxSql(params, viewer), `NOT ${columns.deleted}`];
  if (!options.showSnoozed) filters.push(`NOT ${columns.snoozed}`);
  if (options.unreadOnly) filters.push(`NOT ${columns.isRead}`);
  if (options.tab) {
    const inPriority = prioritySql(params, options.priority!);
    filters.push(options.tab === 'priority' ? inPriority : `NOT ${inPriority}`);
  }
  return filters;
}

export interface UnreadCounts { unread_count: number; priority_unread_count: number }

// _inbox_unread: unread notifications in all, and in the priority inbox.
export async function unreadCounts(tx: EntityManager, viewer: Viewer, priority: Priority): Promise<UnreadCounts> {
  const params = new Params();
  const columns = inboxColumns(params, viewer, new Date());
  const inPriority = prioritySql(params, priority);
  const [row] = await tx.query<{ total: number; priority: number }[]>(...params.bind(
    `SELECT count(audit_events.id)::int AS total, coalesce(sum(CASE WHEN ${inPriority} THEN 1 ELSE 0 END), 0)::int AS priority
       FROM audit_events ${columns.join}
      WHERE audit_events.workspace_id = ${params.add(viewer.workspaceId)} AND ${inInboxSql(params, viewer)}
        AND NOT ${columns.deleted} AND NOT ${columns.snoozed} AND NOT ${columns.isRead}`,
  ));
  return { unread_count: row.total, priority_unread_count: row.priority };
}
