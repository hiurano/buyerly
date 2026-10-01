import { apiRequest } from './api';
import { INBOX_KINDS, INBOX_KIND_LABELS, type InboxKind } from './inbox';

/** Settings → Notifications → Email, as in Linear. */
export interface EmailNotifications {
  enabled: boolean;
  /** "Only deliver priority notifications"; counts only while Priority inbox is on. */
  priorityOnly: boolean;
  kinds: InboxKind[];
}

export interface NotificationChannels {
  email: EmailNotifications;
  /** Whether Buyerly sends anything on this channel yet. */
  delivering: { email: boolean };
}

/** Linear's defaults: email on for every type. */
export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannels = {
  email: { enabled: true, priorityOnly: false, kinds: [...INBOX_KINDS] },
  delivering: { email: false },
};

interface NotificationChannelsPayload {
  email: { enabled: boolean; priority_only: boolean; kinds: InboxKind[] };
  delivering?: { email?: boolean };
}

function channelsFromPayload(payload: Partial<NotificationChannelsPayload> | null): NotificationChannels {
  const email = payload?.email;
  const kinds = email?.kinds;
  return {
    email: {
      enabled: email?.enabled !== false,
      priorityOnly: email?.priority_only === true,
      kinds: Array.isArray(kinds) ? INBOX_KINDS.filter((kind) => kinds.includes(kind)) : [...INBOX_KINDS],
    },
    delivering: { email: payload?.delivering?.email === true },
  };
}

export async function fetchNotificationChannels(): Promise<NotificationChannels> {
  return channelsFromPayload(await apiRequest<NotificationChannelsPayload>('/api/notifications/channels'));
}

export async function saveNotificationChannels(channels: NotificationChannels): Promise<NotificationChannels> {
  const payload: NotificationChannelsPayload = {
    email: {
      enabled: channels.email.enabled,
      priority_only: channels.email.priorityOnly,
      kinds: channels.email.kinds,
    },
  };
  return channelsFromPayload(await apiRequest<NotificationChannelsPayload>('/api/notifications/channels', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }));
}

/**
 * The line under a channel in Settings → Notifications, by Linear's rule:
 * "Disabled", "Enabled", "Enabled for all notifications", "Enabled for team",
 * "Enabled for urgent and team", "Enabled for urgent, rule alerts, 2 others".
 */
export function channelStatus(enabled: boolean, kinds: InboxKind[]): { text: string; enabled: boolean } {
  if (!enabled) return { text: 'Disabled', enabled: false };
  if (kinds.length === 0) return { text: 'Enabled', enabled: true };
  const names = INBOX_KINDS.filter((kind) => kinds.includes(kind)).map((kind) => INBOX_KIND_LABELS[kind].toLowerCase());
  let which: string;
  if (names.length === INBOX_KINDS.length) which = 'all notifications';
  else if (names.length === 1) which = names[0];
  else if (names.length === 2) {
    which = names.some((name) => name.includes('and')) ? `${names[0]}, ${names[1]}` : `${names[0]} and ${names[1]}`;
  } else {
    const others = names.length - 2;
    which = `${names[0]}, ${names[1]}, ${others} other${others === 1 ? '' : 's'}`;
  }
  return { text: `Enabled for ${which}`, enabled: true };
}
