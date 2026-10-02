import { apiRequest } from './api';
import { INBOX_KINDS, INBOX_KIND_LABELS, type InboxKind } from './inbox';

/** One push channel's page in Settings → Notifications (Email, Telegram), as in Linear. */
export interface ChannelNotifications {
  enabled: boolean;
  /** "Only deliver priority notifications"; counts only while Priority inbox is on. */
  priorityOnly: boolean;
  kinds: InboxKind[];
}

export type NotificationChannel = 'email' | 'telegram';

export interface NotificationChannels {
  email: ChannelNotifications;
  /** In place of Linear's Slack: off until a personal Telegram account is connected. */
  telegram: ChannelNotifications;
  /** Other updates → Invite accepted: "Email when invitees accept an invite". */
  inviteAccepted: boolean;
}

/** Linear's defaults: email on for every type, the chat app off until connected. */
export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannels = {
  email: { enabled: true, priorityOnly: false, kinds: [...INBOX_KINDS] },
  telegram: { enabled: false, priorityOnly: false, kinds: [...INBOX_KINDS] },
  inviteAccepted: true,
};

interface ChannelPayload { enabled: boolean; priority_only: boolean; kinds: InboxKind[] }

interface NotificationChannelsPayload {
  email: ChannelPayload;
  telegram: ChannelPayload;
  invite_accepted: boolean;
}

function channelFromPayload(
  payload: Partial<ChannelPayload> | undefined,
  defaults: ChannelNotifications,
): ChannelNotifications {
  const kinds = payload?.kinds;
  return {
    enabled: typeof payload?.enabled === 'boolean' ? payload.enabled : defaults.enabled,
    priorityOnly: payload?.priority_only === true,
    kinds: Array.isArray(kinds) ? INBOX_KINDS.filter((kind) => kinds.includes(kind)) : [...defaults.kinds],
  };
}

function channelsFromPayload(payload: Partial<NotificationChannelsPayload> | null): NotificationChannels {
  return {
    email: channelFromPayload(payload?.email, DEFAULT_NOTIFICATION_CHANNELS.email),
    telegram: channelFromPayload(payload?.telegram, DEFAULT_NOTIFICATION_CHANNELS.telegram),
    inviteAccepted: payload?.invite_accepted !== false,
  };
}

function channelPayload(channel: ChannelNotifications): ChannelPayload {
  return { enabled: channel.enabled, priority_only: channel.priorityOnly, kinds: channel.kinds };
}

export async function fetchNotificationChannels(): Promise<NotificationChannels> {
  return channelsFromPayload(await apiRequest<NotificationChannelsPayload>('/api/notifications/channels'));
}

export async function saveNotificationChannels(channels: NotificationChannels): Promise<NotificationChannels> {
  const payload: NotificationChannelsPayload = {
    email: channelPayload(channels.email),
    telegram: channelPayload(channels.telegram),
    invite_accepted: channels.inviteAccepted,
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
