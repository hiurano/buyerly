import type { NotificationChannels } from '@buyerly/shared';
import { bool, field, list, literal, model, after, validate, type Check } from './model.ts';

// Where a member's notifications go besides the Inbox: Settings →
// Notifications → Email, Telegram and Desktop, as Linear's channels
// (api/routers/audit.py NotificationChannels). Kept per member and
// workspace in workspace_members.notification_channels; NULL or anything
// the model refuses reads as the defaults.

// Kinds of Inbox notification, in the order Focus grouping shows them
// (audit.py INBOX_KINDS).
export const INBOX_KINDS = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

// list[InboxKind] with max_length, kept in INBOX_KINDS order without repeats.
export const inboxKinds: Check<InboxKind[]> = after(
  list(literal(INBOX_KINDS), INBOX_KINDS.length),
  (kinds) => INBOX_KINDS.filter((kind) => kinds.includes(kind)),
);

// EmailNotifications and its two subclasses, which only start switched off.
function channel(name: string, enabled: boolean) {
  return model(name, {
    enabled: field(bool, () => enabled),
    // "Only deliver priority notifications".
    priority_only: field(bool, () => false),
    kinds: field(inboxKinds, () => [...INBOX_KINDS]),
  });
}

const EMAIL = channel('EmailNotifications', true);
const TELEGRAM = channel('TelegramNotifications', false);
const DESKTOP = channel('DesktopNotifications', false);

const defaults = (check: Check<NotificationChannels['email']>) => () => validate(check, {}).value!;

export const NOTIFICATION_CHANNELS: Check<NotificationChannels> = model('NotificationChannels', {
  email: field(EMAIL, defaults(EMAIL)),
  telegram: field(TELEGRAM, defaults(TELEGRAM)),
  desktop: field(DESKTOP, defaults(DESKTOP)),
  // Other updates → Invite accepted.
  invite_accepted: field(bool, () => true),
});

// audit.py _stored_notification_channels.
export function storedNotificationChannels(stored: unknown): NotificationChannels {
  const parsed = stored !== null && typeof stored === 'object' && !Array.isArray(stored)
    ? validate(NOTIFICATION_CHANNELS, stored).value
    : null;
  return parsed ?? (validate(NOTIFICATION_CHANNELS, {}).value as NotificationChannels);
}
