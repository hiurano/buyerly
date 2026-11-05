import type { EntityManager } from 'typeorm';
import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import { AUDIT_EVENT_COLUMNS, serializeAuditEvents, type AuditEventRow } from '../../../audit/events.ts';
import { InboxNotificationStateEntity, UserEntity, WorkspaceMemberEntity } from '../../../entities/index.ts';
import {
  FROM_SQL,
  INBOX_DISPLAY,
  INBOX_PAGE_SIZE,
  KIND_SQL,
  Params,
  displayPriority,
  filterConditions,
  inboxColumns,
  parseFilter,
  parsePriority,
  storedInboxDisplay,
  unreadCounts,
  viewFilters,
  FilterError,
  type Priority,
  type Viewer,
} from '../../../notifications/inbox.ts';
import { field, model, bool, type Check } from '../../../notifications/model.ts';
import { userWorkspaceMember, type ActingMember } from '../../../workspaces/access.ts';
import { accountAccess } from '../../../workspaces/account-access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { invalidInput, RouteError } from '../../errors.ts';
import { InboxDisplayPayload, InboxNotificationPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { datetime } from '../audit/audit.resolver.ts';
import { workspaceMember } from '../views/views.resolver.ts';
import { parseBody } from './body.ts';

// The member's Inbox (api/routers/audit.py, Linear's Inbox): the list, its
// filter menu, Display options, the unread badge and what the member does
// to a notification. Notifications are audit events; the member's marks on
// one live in inbox_notification_states.

interface Member {
  workspaceId: number;
  member: ActingMember;
  stored: WorkspaceMemberEntity | null;
}

async function inboxMember(tx: EntityManager, user: UserEntity): Promise<Member> {
  const { workspaceId, member } = await workspaceMember(tx, user);
  const stored = member.id === null ? null : await tx.findOneBy(WorkspaceMemberEntity, { id: member.id });
  return { workspaceId, member, stored };
}

async function viewerOf(tx: EntityManager, user: UserEntity, { workspaceId, member, stored }: Member): Promise<Viewer> {
  return {
    user,
    workspaceId,
    readBefore: stored?.inboxReadBefore ?? null,
    deletedBefore: stored?.inboxDeletedBefore ?? null,
    access: await accountAccess(tx, member, workspaceId),
    guest: member.role === 'guest',
  };
}

// Query(..., ge=, le=, pattern=, max_length=) in pydantic's words; the first failure answers.
function bounded(value: number, min: number, max?: number): number {
  if (value < min) throw invalidInput([`Input should be greater than or equal to ${min}`]);
  if (max !== undefined && value > max) throw invalidInput([`Input should be less than or equal to ${max}`]);
  return value;
}

function matching(value: string | null, pattern: RegExp, source: string): string | null {
  if (value !== null && !pattern.test(value)) throw invalidInput([`String should match pattern '${source}'`]);
  return value;
}

function short(value: string | null, max: number): string | null {
  if (value !== null && [...value].length > max) throw invalidInput([`String should have at most ${max} characters`]);
  return value;
}

const TAB = /^(priority|other)$/;

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof FilterError) throw new RouteError(400, error.message);
    throw error;
  }
}

const READ = model('InboxReadRequest', { read: field(bool) });

// InboxSnoozeRequest: an optional datetime, as pydantic reads one from JSON.
const SNOOZE: Check<{ until: Date | null }> = model('InboxSnoozeRequest', {
  until: field<Date | null>((value, issues) => {
    if (value === null) return null;
    if (typeof value === 'number') return new Date(Math.abs(value) > 2e10 ? value : value * 1000);
    if (typeof value !== 'string') {
      issues.push('Input should be a valid datetime');
      return undefined;
    }
    try {
      return new Date(datetime(value)!);
    } catch {
      issues.push('Input should be a valid datetime or date, invalid character in year');
      return undefined;
    }
  }, () => null),
});

interface Facet { value: string; count: number; label?: string }

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const personName = (account: UserEntity): string => account.fullName || account.username || '';
const userFromKey = (account: UserEntity): string => `user:${account.telegramId || account.id}`;

// _actor_users: the people behind user actors, recorded by user id or by Telegram id.
async function actorUsers(tx: EntityManager, actorIds: Set<string>): Promise<Map<string, UserEntity>> {
  const found = new Map<string, UserEntity>();
  if (!actorIds.size) return found;
  const ids = [...actorIds];
  const numeric = ids.filter((value) => /^\d+$/.test(value) && value.length < 10).map(Number);
  const users = await tx.createQueryBuilder(UserEntity, 'u')
    .where('u.telegramId IN (:...ids) OR u.id IN (:...numeric)', { ids, numeric: numeric.length ? numeric : [-1] })
    .getMany();
  for (const account of users) {
    if (account.telegramId && actorIds.has(account.telegramId)) found.set(account.telegramId, account);
  }
  for (const account of users) {
    const key = String(account.id);
    if (actorIds.has(key) && !found.has(key)) found.set(key, account);
  }
  return found;
}

@Resolver()
export class InboxResolver {
  @Query(() => JSONScalar, { description: "A page of the member's Inbox." })
  async inbox(
    @Ctx() { app, user }: GraphQLContext,
    @Arg('offset', () => Int, { nullable: true, defaultValue: null }) offset: number | null,
    @Arg('limit', () => Int, { nullable: true, defaultValue: null }) limit: number | null,
    @Arg('ordering', () => String, { nullable: true, defaultValue: null }) ordering: string | null,
    @Arg('unreadOnly', () => Boolean, { nullable: true, defaultValue: null }) unreadOnly: boolean | null,
    @Arg('showSnoozed', () => Boolean, { nullable: true, defaultValue: null }) showSnoozed: boolean | null,
    @Arg('unreadFirst', () => Boolean, { nullable: true, defaultValue: null }) unreadFirst: boolean | null,
    @Arg('tab', () => String, { nullable: true, defaultValue: null }) tab: string | null,
    @Arg('priority', () => String, { nullable: true, defaultValue: null }) priorityArg: string | null,
    @Arg('filter', () => String, { nullable: true, defaultValue: null }) filter: string | null,
  ): Promise<unknown> {
    const from = bounded(offset ?? 0, 0);
    const size = bounded(limit ?? INBOX_PAGE_SIZE, 1, 100);
    const order = matching(ordering, /^(newest|oldest)$/, '^(newest|oldest)$') ?? 'newest';
    matching(tab, TAB, '^(priority|other)$');
    short(priorityArg, 8000);
    short(filter, 4000);
    const clauses = parsed(() => parseFilter(filter));
    const requested = parsed(() => parsePriority(priorityArg));

    return app.db.transaction(async (tx) => {
      const found = await inboxMember(tx, user);
      const priority = requested ?? displayPriority(storedInboxDisplay(found.stored?.inboxDisplay ?? null));
      const viewer = await viewerOf(tx, user, found);
      const now = new Date();
      const params = new Params();
      const columns = inboxColumns(params, viewer, now);
      const view = viewFilters(params, viewer, columns, {
        unreadOnly: unreadOnly ?? false, showSnoozed: showSnoozed ?? false, tab, priority,
      });
      const filters = [...view, ...filterConditions(params, clauses)];
      let hiddenByFilters = 0;
      if (clauses.length) {
        const count = async (conditions: string[]): Promise<number> => (await tx.query<{ n: number }[]>(
          `SELECT count(audit_events.id)::int AS n FROM audit_events ${columns.join} WHERE ${conditions.join(' AND ')}`,
          params.values,
        ))[0].n;
        hiddenByFilters = (await count(view)) - (await count(filters));
      }
      // A notification back from snooze counts from when it came back, as in Linear.
      const direction = order === 'oldest' ? 'ASC' : 'DESC';
      const orderBy = [...(unreadFirst ? [`${columns.isRead} ASC`] : []), `${columns.movedAt} ${direction}`, `audit_events.id ${direction}`];
      const at = params.add(now, '::timestamptz');
      const rows = await tx.query<(AuditEventRow & { inbox_read: boolean | null; inbox_snoozed: string | null; inbox_unsnoozed: string | null; inbox_kind: string })[]>(
        `SELECT ${AUDIT_EVENT_COLUMNS}, ${columns.isRead} AS inbox_read,
                CASE WHEN s.snoozed_until > ${at} THEN ${utcIso('s.snoozed_until')} END AS inbox_snoozed,
                CASE WHEN ${columns.returned} THEN ${utcIso('s.snoozed_until')} END AS inbox_unsnoozed,
                ${KIND_SQL} AS inbox_kind
           FROM audit_events ${columns.join}
          WHERE ${filters.join(' AND ')}
          ORDER BY ${orderBy.join(', ')}
          OFFSET ${params.add(from)} LIMIT ${params.add(size + 1)}`,
        params.values,
      );
      const page = rows.slice(0, size);
      const items = await serializeAuditEvents(tx, page, { workspaceId: viewer.workspaceId, canWriteWorkspace: !viewer.guest, user });
      items.forEach((item, index) => {
        const row = page[index];
        item.kind = row.inbox_kind;
        item.is_read = Boolean(row.inbox_read);
        item.snoozed_until = row.inbox_snoozed;
        item.unsnoozed_at = row.inbox_unsnoozed;
      });
      return {
        items,
        has_more: rows.length > size,
        ...(await unreadCounts(tx, viewer, priority)),
        hidden_by_filters: hiddenByFilters,
      };
    });
  }

  @Query(() => JSONScalar, { description: 'Counts behind the Inbox filter menu.' })
  async inboxFacets(
    @Ctx() { app, user }: GraphQLContext,
    @Arg('unreadOnly', () => Boolean, { nullable: true, defaultValue: null }) unreadOnly: boolean | null,
    @Arg('showSnoozed', () => Boolean, { nullable: true, defaultValue: null }) showSnoozed: boolean | null,
    @Arg('tab', () => String, { nullable: true, defaultValue: null }) tab: string | null,
    @Arg('priority', () => String, { nullable: true, defaultValue: null }) priorityArg: string | null,
  ): Promise<unknown> {
    matching(tab, TAB, '^(priority|other)$');
    short(priorityArg, 8000);
    const requested = parsed(() => parsePriority(priorityArg));
    return app.db.transaction(async (tx) => {
      const found = await inboxMember(tx, user);
      const priority: Priority = requested ?? displayPriority(storedInboxDisplay(found.stored?.inboxDisplay ?? null));
      const viewer = await viewerOf(tx, user, found);
      const params = new Params();
      const columns = inboxColumns(params, viewer, new Date());
      const where = viewFilters(params, viewer, columns, {
        unreadOnly: unreadOnly ?? false, showSnoozed: showSnoozed ?? false, tab, priority,
      }).join(' AND ');
      const grouped = (column: string, label?: string) => tx.query<{ value: string | null; count: number; label: string | null }[]>(
        `SELECT ${column} AS value, count(audit_events.id)::int AS count${label ? `, max(${label}) AS label` : ''}
           FROM audit_events ${columns.join} WHERE ${where}
          GROUP BY ${column} ORDER BY count(audit_events.id) DESC, ${column}`,
        params.values,
      );
      const types = await grouped('audit_events.event_type');
      const statuses = await grouped('audit_events.status');
      const accounts = await grouped('audit_events.account_id', 'audit_events.account_name');
      const senders = await grouped(`(${FROM_SQL})`, 'audit_events.rule_name');
      const people = await actorUsers(tx, new Set(senders
        .map((row) => row.value)
        .filter((key): key is string => key !== null && key.startsWith('user:'))
        .map((key) => key.slice(5))));

      // A user nobody can be named for is left out, as Linear lists only
      // people it knows under From; one person recorded by both ids is one sender.
      const fromValues = new Map<string, Facet>();
      for (const { value: key, count, label: ruleName } of senders) {
        if (key === null) continue;
        let value: string;
        let label: string;
        if (key.startsWith('user:')) {
          const account = people.get(key.slice(5));
          if (!account) continue;
          [value, label] = [userFromKey(account), personName(account)];
        } else if (key.startsWith('rule:')) {
          [value, label] = [key, ruleName || 'Rule'];
        } else {
          [value, label] = [key, 'Buyerly'];
        }
        const entry = fromValues.get(value) ?? { value, label, count: 0 };
        entry.count += count;
        fromValues.set(value, entry);
      }
      return {
        type: types.map(({ value, count }) => ({ value, count })),
        from: [...fromValues.values()].sort((a, b) => b.count - a.count || compare(a.value, b.value)),
        account: accounts.map(({ value, count, label }) => ({ value, label: label || value, count })),
        status: statuses.map(({ value, count }) => ({ value, count })),
      };
    });
  }

  @Query(() => JSONScalar, { description: "Who sent the member's Inbox notifications." })
  async inboxSenders(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    // Everyone a notification can be from, as Linear's custom filter From
    // lists every member: the members, the workspace's rules and Buyerly.
    return app.db.transaction(async (tx) => {
      const { workspaceId } = await workspaceMember(tx, user);
      const members = await tx.createQueryBuilder(UserEntity, 'u')
        .innerJoin(WorkspaceMemberEntity, 'wm', 'wm.userId = u.id')
        .where('wm.workspaceId = :workspaceId', { workspaceId })
        .getMany();
      const rules = await tx.query<{ id: number; name: string | null }[]>(
        'SELECT id, name FROM rule_presets WHERE workspace_id = $1 ORDER BY lower(name), id',
        [workspaceId],
      );
      const people = members
        .map((account) => ({ value: userFromKey(account), label: personName(account), kind: 'user', avatar_url: account.avatarUrl || '' }))
        .sort((a, b) => compare(a.label.toLowerCase(), b.label.toLowerCase()));
      return [
        ...people,
        ...rules.map((rule) => ({ value: `rule:${rule.id}`, label: rule.name || 'Rule', kind: 'rule' })),
        { value: 'buyerly', label: 'Buyerly', kind: 'buyerly' },
      ];
    });
  }

  @Query(() => JSONScalar, { description: "The member's Inbox display options." })
  async inboxDisplay(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    // Linear keeps Display options per member and workspace, on every device.
    return app.db.transaction(async (tx) => storedInboxDisplay((await inboxMember(tx, user)).stored?.inboxDisplay ?? null));
  }

  @Query(() => JSONScalar, { description: "Unread Inbox notifications, for the sidebar's badge." })
  async inboxUnreadCount(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const found = await userWorkspaceMember(tx, user);
      if (!found) return { unread_count: 0, priority_unread_count: 0 };
      const member: Member = {
        workspaceId: found.workspace.id,
        member: found.member,
        stored: found.member.id === null ? null : await tx.findOneBy(WorkspaceMemberEntity, { id: found.member.id }),
      };
      return unreadCounts(tx, await viewerOf(tx, user, member), displayPriority(storedInboxDisplay(member.stored?.inboxDisplay ?? null)));
    });
  }

  @Mutation(() => InboxDisplayPayload, { nullable: true, description: "Saves the member's Inbox display options." })
  async inboxDisplayUpdate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const display = parseBody(INBOX_DISPLAY, input);
    await context.app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, context.user);
      if (member.id === null) throw new RouteError(403, 'Support access cannot change this Inbox.');
      await tx.update(WorkspaceMemberEntity, { id: member.id }, { inboxDisplay: display });
    });
    return mutated(context, InboxDisplayPayload, display);
  }

  @Mutation(() => InboxNotificationPayload, { nullable: true, description: 'Marks an Inbox notification read or unread.' })
  async inboxNotificationRead(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { read } = parseBody(READ, input);
    return mutated(context, InboxNotificationPayload, await updateState(context, id, { isRead: read }));
  }

  @Mutation(() => InboxNotificationPayload, { nullable: true, description: 'Deletes an Inbox notification for the member.' })
  async inboxNotificationDelete(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    return mutated(context, InboxNotificationPayload, await updateState(context, id, { deletedAt: new Date() }));
  }

  @Mutation(() => InboxNotificationPayload, { nullable: true, description: 'Snoozes an Inbox notification, or wakes it.' })
  async inboxNotificationSnooze(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { until } = parseBody(SNOOZE, input);
    if (until !== null && until <= new Date()) throw new RouteError(400, 'Pick a time in the future.');
    // Snoozing keeps the read state, as in Linear; the notification turns
    // unread only when the snooze runs out.
    return mutated(context, InboxNotificationPayload, await updateState(context, id, { snoozedUntil: until }));
  }

  @Mutation(() => InboxNotificationPayload, { nullable: true, description: 'Deletes every Inbox notification of the member.' })
  async inboxDeleteAll(@Ctx() context: GraphQLContext): Promise<Payload> {
    return mutated(context, InboxNotificationPayload, await deleteBulk(context, false));
  }

  @Mutation(() => InboxNotificationPayload, { nullable: true, description: "Deletes the member's read Inbox notifications." })
  async inboxDeleteAllRead(@Ctx() context: GraphQLContext): Promise<Payload> {
    return mutated(context, InboxNotificationPayload, await deleteBulk(context, true));
  }
}

// postgres' rendering of a timestamptz as _utc_iso does: microseconds unless zero, then Z.
function utcIso(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM ${column})::bigint % 1000000 = 0 THEN '' ELSE to_char(${column} AT TIME ZONE 'UTC', '.US') END
    || 'Z'`;
}

type StateChange = Partial<Pick<InboxNotificationStateEntity, 'isRead' | 'deletedAt' | 'snoozedUntil'>>;

// _update_inbox_state: the member's mark on one notification of this workspace.
async function updateState(context: GraphQLContext, eventId: number, change: StateChange): Promise<Record<string, unknown>> {
  const { user } = context;
  return context.app.db.transaction(async (tx) => {
    const found = await inboxMember(tx, user);
    const [event] = await tx.query<{ workspace_id: number | null }[]>('SELECT workspace_id FROM audit_events WHERE id = $1', [eventId]);
    if (!event || event.workspace_id !== found.workspaceId) throw new RouteError(404, 'Notification not found.');
    const viewer = await viewerOf(tx, user, found);
    let state = await tx.findOneBy(InboxNotificationStateEntity, { userId: user.id, auditEventId: eventId });
    if (!state) {
      // The first touch pins the read state the member saw, so a later
      // "Delete all read" or a new read mark cannot flip it.
      const params = new Params();
      const columns = inboxColumns(params, viewer, new Date());
      const [seen] = await tx.query<{ read: boolean | null }[]>(
        `SELECT ${columns.isRead} AS read FROM audit_events ${columns.join} WHERE audit_events.id = ${params.add(eventId)}`,
        params.values,
      );
      state = tx.create(InboxNotificationStateEntity, { userId: user.id, auditEventId: eventId, isRead: Boolean(seen.read) });
    }
    Object.assign(state, change);
    // Any touch counts, even one that changes nothing: reading a notification
    // back from snooze must end its "Unsnoozed" state.
    state.updatedAt = new Date();
    await tx.save(state);
    const priority = displayPriority(storedInboxDisplay(found.stored?.inboxDisplay ?? null));
    return { success: true, ...(await unreadCounts(tx, viewer, priority)) };
  });
}

// _delete_inbox_bulk: every notification, or the read ones, of this workspace.
async function deleteBulk(context: GraphQLContext, onlyRead: boolean): Promise<Record<string, unknown>> {
  const { user } = context;
  const now = new Date();
  return context.app.db.transaction(async (tx) => {
    const found = await inboxMember(tx, user);
    if (!found.stored) throw new RouteError(403, 'Support access cannot clear this Inbox.');
    const readOnly = onlyRead
      ? ' AND s.is_read IS true AND NOT (s.snoozed_until IS NOT NULL AND s.snoozed_until <= $3 AND s.updated_at < s.snoozed_until)'
      : '';
    await tx.query(
      `UPDATE inbox_notification_states s SET deleted_at = $3, updated_at = $3
        WHERE s.user_id = $1 AND s.deleted_at IS NULL
          AND s.audit_event_id IN (SELECT id FROM audit_events WHERE workspace_id = $2)${readOnly}`,
      [user.id, found.workspaceId, now],
    );
    const marks: Partial<WorkspaceMemberEntity> = onlyRead
      ? { inboxDeletedBefore: now }
      : { inboxReadBefore: now, inboxDeletedBefore: now };
    await tx.update(WorkspaceMemberEntity, { id: found.stored.id }, marks);
    Object.assign(found.stored, marks);
    const viewer = await viewerOf(tx, user, found);
    return { success: true, ...(await unreadCounts(tx, viewer, displayPriority(storedInboxDisplay(found.stored.inboxDisplay)))) };
  });
}
