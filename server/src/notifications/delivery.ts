import type { FastifyBaseLogger } from 'fastify';
import { In, type EntityManager } from 'typeorm';
import type { Database } from '../database.ts';
import { rows } from '../database.ts';
import { inboxNotificationEmail } from '../email/workspace-emails.ts';
import type { SendEmail } from '../email/send.ts';
import { UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../entities/index.ts';
import { accountAccess } from '../workspaces/account-access.ts';
import { storedNotificationChannels } from './channels.ts';
import { KIND_SQL, Params, displayPriority, inInboxSql, inboxColumns, prioritySql, storedInboxDisplay, type Viewer } from './inbox.ts';
import type { TelegramBot } from './telegram.ts';
import { pushGone, type PushSendResult, type SendPush } from './web-push.ts';

// Inbox notifications out to each member's other channels, as Linear does
// (services/inbox_email.py, inbox_telegram.py, inbox_push.py), run by the
// worker. Settings → Notifications decides which kinds go out on a channel,
// and only notifications still unread, not deleted and not snoozed go. Each
// delivery is recorded (claimed) before it is sent, under a unique
// (user, event) key, so no notification goes twice even if two workers
// overlap; a failed send forgets the claim, so a later run tries again.

const MINUTE_MS = 60_000;
// Email waits for the member to read the notification in the app first.
export const EMAIL_DELAY_MS = 5 * MINUTE_MS;
// Older events are not sent any more: after a long worker outage the news is stale.
export const EMAIL_LOOKBACK_MS = 30 * MINUTE_MS;
export const TELEGRAM_LOOKBACK_MS = 30 * MINUTE_MS;
export const PUSH_LOOKBACK_MS = 30 * MINUTE_MS;
export const MAX_PER_RUN = 100;
// Resend accepts two requests a second.
export const EMAIL_SEND_INTERVAL_MS = 600;
export const TELEGRAM_SEND_INTERVAL_MS = 50;
const BLOCKED_ERROR = 'blocked';

// The Inbox row titles from frontend/src/lib/audit.ts (AUDIT_EVENT_TITLES),
// as services/inbox_email.py EVENT_TITLES.
export const EVENT_TITLES: Record<string, string> = {
  STOP: 'Turned off',
  AUTO_REACTIVATE: 'Turned on',
  MANUAL_PAUSE: 'Turned off manually',
  MANUAL_REACTIVATE: 'Turned on manually',
  INCREASE_BUDGET: 'Budget raised',
  DECREASE_BUDGET: 'Budget lowered',
  NOTIFY_ONLY: 'Rule alert',
  PROPOSE_REACTIVATE: 'Suggested turning on',
  STOP_CONFIRMATION_STARTED: 'Rechecking before turning off',
  RULE_ACTION_COOLDOWN: "Skipped during the rule's pause",
  RULE_ACTION_PENDING: 'Waiting for Meta',
  RULE_ACTION_RECONCILED: 'Confirmed with Meta',
  UNDO_ACTION: 'Undone',
  UNDO_ACTION_FAILED: 'Undo failed',
  ACCOUNT_DAY_STARTED: 'New day in the ad account',
  ACCOUNT_HEALTH_ALERT: 'Ad account needs attention',
  ACCOUNT_HEALTH_RECOVERED: 'Ad account is back to normal',
  ACCOUNT_ISSUE: 'Ad account issue',
  TOKEN_EXPIRED: 'Meta access expired',
  DELETE_RULE_PRESET: 'Rule deleted',
  RESTORE_RULE_PRESET: 'Rule restored',
  ASSISTANT_CREATE_RULE: 'AI assistant created a rule',
  ASSISTANT_ATTACH_RULE: 'AI assistant attached a rule',
  ASSISTANT_DETACH_RULE: 'AI assistant detached a rule',
  WORKER_STALLED: 'Rules are not being checked',
  WORKER_RECOVERED: 'Rules are being checked again',
};

export interface InboxEvent {
  id: number;
  event_type: string | null;
  action: string | null;
  category: string | null;
  entity_name: string | null;
  adset_name: string | null;
  account_name: string | null;
  entity_id: string | null;
  adset_id: string | null;
  account_id: string | null;
  message: string | null;
}

function humanize(value: string): string {
  const parts = value.trim().toLowerCase().split('_').filter(Boolean);
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Unknown';
}

// The same title the Inbox row shows.
export function eventTitle(event: InboxEvent): string {
  return (event.event_type && EVENT_TITLES[event.event_type]) || humanize(event.action || event.event_type || event.category || '');
}

export function eventTarget(event: InboxEvent): string {
  return event.entity_name || event.adset_name || event.account_name || event.entity_id || event.adset_id || event.account_id || 'Workspace event';
}

const webapp = (webappUrl: string): string => (webappUrl || 'https://buyerly.app').replace(/\/+$/, '');
export const notificationPath = (workspace: WorkspaceEntity, event: InboxEvent): string => `/${workspace.slug}/inbox/${event.id}`;
export const notificationUrl = (webappUrl: string, workspace: WorkspaceEntity, event: InboxEvent): string =>
  `${webapp(webappUrl)}${notificationPath(workspace, event)}`;
// Where Unsubscribe leads: Settings → Notifications → Email.
export const emailSettingsUrl = (webappUrl: string, workspace: WorkspaceEntity): string =>
  `${webapp(webappUrl)}/${workspace.slug}/settings/account/notifications/email`;

type Channel = 'email' | 'telegram' | 'desktop';

// channel_condition: which notifications a channel's settings let through, or null for none.
export function channelCondition(params: Params, member: WorkspaceMemberEntity, channel: Channel): string | null {
  const settings = storedNotificationChannels(member.notificationChannels)[channel];
  if (!settings.enabled) return null;
  const display = storedInboxDisplay(member.inboxDisplay);
  // As in Linear, "Only deliver priority notifications" counts only while the
  // priority inbox is on; then the kinds below it do not apply.
  if (settings.priority_only && display.priority_inbox) return prioritySql(params, displayPriority(display));
  if (!settings.kinds.length) return null;
  return `(${KIND_SQL}) = ANY(${params.add(settings.kinds, '::text[]')})`;
}

const DELIVERY_TABLES = {
  email: 'inbox_email_deliveries',
  telegram: 'inbox_telegram_deliveries',
  desktop: 'inbox_push_deliveries',
} as const;

interface Recipient {
  member: WorkspaceMemberEntity;
  user: UserEntity;
  workspace: WorkspaceEntity;
}

// due_inbox_events: this member's notifications not read, deleted or
// snoozed, between `since` and `until`, not sent on the channel yet.
export async function dueInboxEvents(
  tx: EntityManager,
  { member, user, workspace }: Recipient,
  channel: Channel,
  window: { since: Date; until: Date; limit: number; now?: Date },
): Promise<InboxEvent[]> {
  const params = new Params();
  const wanted = channelCondition(params, member, channel);
  if (wanted === null) return [];
  const viewer: Viewer = {
    user,
    workspaceId: workspace.id,
    readBefore: member.inboxReadBefore ?? null,
    deletedBefore: member.inboxDeletedBefore ?? null,
    access: await accountAccess(tx, member, workspace.id),
    guest: member.role === 'guest',
  };
  const columns = inboxColumns(params, viewer, window.now ?? new Date());
  const sql = `SELECT audit_events.id, audit_events.event_type, audit_events.action, audit_events.category,
      audit_events.entity_name, audit_events.adset_name, audit_events.account_name, audit_events.entity_id,
      audit_events.adset_id, audit_events.account_id, audit_events.message
    FROM audit_events ${columns.join}
    WHERE audit_events.workspace_id = ${params.add(workspace.id)}
      AND ${inInboxSql(params, viewer)}
      AND audit_events.created_at > ${params.add(window.since, '::timestamptz')}
      AND audit_events.created_at <= ${params.add(window.until, '::timestamptz')}
      AND NOT ${columns.deleted} AND NOT ${columns.snoozed} AND NOT ${columns.isRead}
      AND ${wanted}
      AND NOT EXISTS (SELECT 1 FROM ${DELIVERY_TABLES[channel]} d WHERE d.user_id = ${params.add(user.id)} AND d.audit_event_id = audit_events.id)
    ORDER BY audit_events.created_at, audit_events.id
    LIMIT ${params.add(window.limit)}`;
  return tx.query<InboxEvent[]>(...params.bind(sql));
}

// Members (with their user and workspace) whose ids are given, in id order.
async function recipients(tx: EntityManager, memberIds: number[]): Promise<Recipient[]> {
  if (!memberIds.length) return [];
  const members = await tx.find(WorkspaceMemberEntity, { where: { id: In(memberIds) }, order: { id: 'ASC' } });
  const users = new Map((await tx.findBy(UserEntity, { id: In([...new Set(members.map((m) => m.userId))]) })).map((u) => [u.id, u]));
  const workspaces = new Map(
    (await tx.findBy(WorkspaceEntity, { id: In([...new Set(members.map((m) => m.workspaceId))]) })).map((w) => [w.id, w]),
  );
  return members.flatMap((member) => {
    const user = users.get(member.userId);
    const workspace = workspaces.get(member.workspaceId);
    return user && workspace ? [{ member, user, workspace }] : [];
  });
}

async function claim(db: Database, table: string, columns: Record<string, unknown>): Promise<boolean> {
  const names = Object.keys(columns);
  const values = Object.values(columns);
  const claimed = await db.transaction((tx) =>
    rows<{ id: number }>(
      tx,
      `INSERT INTO ${table} (${names.join(', ')}, created_at) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}, now())
       ON CONFLICT (user_id, audit_event_id) DO NOTHING RETURNING id`,
      values,
    ),
  );
  return claimed.length > 0;
}

const markSent = (tx: EntityManager, table: string, userId: number, eventId: number) =>
  rows(tx, `UPDATE ${table} SET sent_at = now() WHERE user_id = $1 AND audit_event_id = $2`, [userId, eventId]);
const forget = (tx: EntityManager, table: string, userId: number, eventId: number) =>
  rows(tx, `DELETE FROM ${table} WHERE user_id = $1 AND audit_event_id = $2`, [userId, eventId]);

const pause = (ms: number) => (ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export interface DeliveryContext {
  db: Database;
  log: FastifyBaseLogger;
  webappUrl: string;
  now?: Date;
}

// deliver_inbox_emails: returns how many went out. A failed send stops the
// run: the mail service is likely down.
export async function deliverInboxEmails(
  context: DeliveryContext & { sendEmail: SendEmail; pauseMs?: number },
): Promise<number> {
  const { db, log, webappUrl, sendEmail } = context;
  const now = context.now ?? new Date();
  const pauseMs = context.pauseMs ?? EMAIL_SEND_INTERVAL_MS;
  const table = DELIVERY_TABLES.email;
  let sent = 0;
  const people = await db.transaction(async (tx) => {
    const ids = await rows<{ id: number }>(
      tx,
      `SELECT workspace_members.id FROM workspace_members
         JOIN users ON users.id = workspace_members.user_id
         JOIN workspaces ON workspaces.id = workspace_members.workspace_id
        WHERE users.email IS NOT NULL AND users.email != '' ORDER BY workspace_members.id`,
    );
    return recipients(tx, ids.map((row) => row.id));
  });
  for (const person of people) {
    if (sent >= MAX_PER_RUN) break;
    let events: InboxEvent[];
    try {
      events = await db.transaction((tx) =>
        dueInboxEvents(tx, person, 'email', {
          since: new Date(now.getTime() - EMAIL_DELAY_MS - EMAIL_LOOKBACK_MS),
          until: new Date(now.getTime() - EMAIL_DELAY_MS),
          limit: MAX_PER_RUN - sent,
          now,
        }),
      );
    } catch (error) {
      log.error({ err: error, memberId: person.member.id }, 'Could not pick Inbox emails for a member');
      continue;
    }
    const { user, workspace } = person;
    for (const event of events) {
      if (!(await claim(db, table, { user_id: user.id, audit_event_id: event.id, email: user.email }))) continue;
      let delivered: boolean;
      try {
        delivered = await sendEmail(
          inboxNotificationEmail({
            to: user.email!,
            workspaceName: workspace.name,
            title: eventTitle(event),
            target: eventTarget(event),
            accountName: event.account_name || '',
            message: event.message || '',
            url: notificationUrl(webappUrl, workspace, event),
            settingsUrl: emailSettingsUrl(webappUrl, workspace),
          }),
        );
      } catch (error) {
        log.error({ err: error, eventId: event.id }, 'Inbox email failed');
        delivered = false;
      }
      if (!delivered) {
        // Not sent: forget it, so a later run tries again while it is still recent.
        await db.transaction((tx) => forget(tx, table, user.id, event.id));
        return sent;
      }
      await db.transaction((tx) => markSent(tx, table, user.id, event.id));
      sent += 1;
      await pause(pauseMs);
    }
  }
  return sent;
}

// The Telegram message: what happened and to what, the details, then where (HTML).
export function telegramText(workspace: WorkspaceEntity, event: InboxEvent): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const lines = [`<b>${escape(eventTitle(event))}</b> · ${escape(eventTarget(event))}`];
  if (event.message) lines.push(escape(event.message));
  lines.push(escape([event.account_name, workspace.name].filter(Boolean).join(' · ')));
  return lines.join('\n');
}

// deliver_inbox_telegram: returns how many went out.
export async function deliverInboxTelegram(
  context: DeliveryContext & { telegram: TelegramBot; pauseMs?: number },
): Promise<number> {
  const { db, log, webappUrl, telegram } = context;
  const now = context.now ?? new Date();
  const pauseMs = context.pauseMs ?? TELEGRAM_SEND_INTERVAL_MS;
  const table = DELIVERY_TABLES.telegram;
  let sent = 0;
  const people = await db.transaction(async (tx) => {
    const found = await rows<{ member_id: number; chat_id: string }>(
      tx,
      `SELECT workspace_members.id AS member_id, telegram_connections.chat_id FROM workspace_members
         JOIN telegram_connections ON telegram_connections.member_id = workspace_members.id
         JOIN users ON users.id = workspace_members.user_id
         JOIN workspaces ON workspaces.id = workspace_members.workspace_id
        WHERE telegram_connections.delivery_error IS NULL ORDER BY workspace_members.id`,
    );
    const chats = new Map(found.map((row) => [row.member_id, Number(row.chat_id)]));
    return (await recipients(tx, [...chats.keys()])).map((person) => ({ ...person, chatId: chats.get(person.member.id)! }));
  });
  for (const person of people) {
    if (sent >= MAX_PER_RUN) break;
    let events: InboxEvent[];
    try {
      events = await db.transaction((tx) =>
        dueInboxEvents(tx, person, 'telegram', { since: new Date(now.getTime() - TELEGRAM_LOOKBACK_MS), until: now, limit: MAX_PER_RUN - sent, now }),
      );
    } catch (error) {
      log.error({ err: error, memberId: person.member.id }, 'Could not pick Telegram notifications for a member');
      continue;
    }
    const { user, workspace, chatId } = person;
    for (const event of events) {
      if (!(await claim(db, table, { user_id: user.id, audit_event_id: event.id, chat_id: chatId }))) continue;
      let result: { ok: boolean; unreachable?: boolean; error: string };
      try {
        result = await telegram.sendMessage(chatId, telegramText(workspace, event), {
          label: 'Open in Buyerly',
          url: notificationUrl(webappUrl, workspace, event),
        });
      } catch (error) {
        log.error({ err: error, eventId: event.id }, 'Telegram notification failed');
        result = { ok: false, error: 'exception' };
      }
      if (result.ok) {
        await db.transaction((tx) => markSent(tx, table, user.id, event.id));
        sent += 1;
      } else if (result.unreachable) {
        await db.transaction(async (tx) => {
          await forget(tx, table, user.id, event.id);
          await rows(tx, 'UPDATE telegram_connections SET delivery_error = $1, delivery_error_at = now() WHERE chat_id = $2', [BLOCKED_ERROR, chatId]);
        });
        log.info({ chatId, error: result.error }, 'Telegram chat is unreachable');
        break;
      } else {
        await db.transaction((tx) => forget(tx, table, user.id, event.id));
        return sent;
      }
      await pause(pauseMs);
    }
  }
  return sent;
}

// What the service worker shows: title, the details, where; and what a click opens.
export function pushMessage(workspace: WorkspaceEntity, event: InboxEvent): Record<string, unknown> {
  const details = event.message ? [event.message] : [];
  details.push([event.account_name, workspace.name].filter(Boolean).join(' · '));
  return {
    title: `${eventTitle(event)} · ${eventTarget(event)}`,
    body: [...details.filter(Boolean).join('\n')].slice(0, 500).join(''),
    url: notificationPath(workspace, event),
    tag: `inbox-${event.id}`,
    id: event.id,
  };
}

interface Browser {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// deliver_inbox_push: returns how many Inbox notifications went out. Each
// goes to every browser the member turned the channel on in; a browser the
// push service no longer knows (404, 410) is forgotten.
export async function deliverInboxPush(context: DeliveryContext & { sendPush: SendPush }): Promise<number> {
  const { db, log, sendPush } = context;
  const now = context.now ?? new Date();
  const table = DELIVERY_TABLES.desktop;
  let sent = 0;
  // Subscriptions whose sign-in ended (logged out, revoked or expired) never deliver again.
  await db.transaction((tx) =>
    rows(
      tx,
      `DELETE FROM desktop_push_subscriptions WHERE web_session_id IN
         (SELECT id FROM web_sessions WHERE revoked_at IS NOT NULL OR expires_at <= $1)`,
      [now],
    ),
  );
  const browsersOf = new Map<number, Browser[]>();
  const subscriptions = await db.transaction((tx) =>
    rows<Browser & { member_id: number }>(tx, 'SELECT id, member_id, endpoint, p256dh, auth FROM desktop_push_subscriptions ORDER BY id'),
  );
  for (const { member_id: memberId, ...browser } of subscriptions) {
    browsersOf.set(memberId, [...(browsersOf.get(memberId) ?? []), browser]);
  }
  if (!browsersOf.size) return 0;
  const people = await db.transaction((tx) => recipients(tx, [...browsersOf.keys()]));
  for (const person of people) {
    if (sent >= MAX_PER_RUN) break;
    let events: InboxEvent[];
    try {
      events = await db.transaction((tx) =>
        dueInboxEvents(tx, person, 'desktop', { since: new Date(now.getTime() - PUSH_LOOKBACK_MS), until: now, limit: MAX_PER_RUN - sent, now }),
      );
    } catch (error) {
      log.error({ err: error, memberId: person.member.id }, 'Could not pick desktop notifications for a member');
      continue;
    }
    const browsers = browsersOf.get(person.member.id) ?? [];
    const { user, workspace } = person;
    for (const event of events) {
      if (!browsers.length || !(await claim(db, table, { user_id: user.id, audit_event_id: event.id }))) continue;
      const message = pushMessage(workspace, event);
      let delivered = false;
      let failed = false;
      const gone: number[] = [];
      for (const browser of [...browsers]) {
        let result: PushSendResult;
        try {
          result = await sendPush(browser, message);
        } catch (error) {
          log.error({ err: error, eventId: event.id }, 'Desktop notification failed');
          result = { ok: false, status: null, error: 'exception' };
        }
        if (result.ok) {
          delivered = true;
        } else if (pushGone(result)) {
          gone.push(browser.id);
          browsers.splice(browsers.indexOf(browser), 1);
        } else {
          failed = true;
          log.info({ eventId: event.id, status: result.status, error: result.error }, 'Push service refused a notification');
        }
      }
      await db.transaction(async (tx) => {
        if (gone.length) await rows(tx, 'DELETE FROM desktop_push_subscriptions WHERE id = ANY($1::int[])', [gone]);
        if (delivered) await markSent(tx, table, user.id, event.id);
        else if (failed) await forget(tx, table, user.id, event.id);
      });
      if (delivered) sent += 1;
      if (failed && !delivered) break;
    }
  }
  return sent;
}
