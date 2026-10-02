import { apiRequest } from './api';

/** The member's personal Telegram account, as Linear's personal Slack account. */
export interface TelegramConnection {
  /** The server has a bot to connect to. */
  available: boolean;
  connected: boolean;
  username: string | null;
  firstName: string | null;
  /** "blocked" once the person blocked the bot: nothing can be delivered. */
  error: string | null;
}

export const NO_TELEGRAM_CONNECTION: TelegramConnection = {
  available: false,
  connected: false,
  username: null,
  firstName: null,
  error: null,
};

interface TelegramConnectionPayload {
  available: boolean;
  connected: boolean;
  username: string | null;
  first_name: string | null;
  error: string | null;
}

function fromPayload(payload: TelegramConnectionPayload): TelegramConnection {
  return {
    available: payload.available === true,
    connected: payload.connected === true,
    username: payload.username ?? null,
    firstName: payload.first_name ?? null,
    error: payload.error ?? null,
  };
}

export async function fetchTelegramConnection(): Promise<TelegramConnection> {
  return fromPayload(await apiRequest<TelegramConnectionPayload>('/api/telegram/connection'));
}

/** A one-time t.me link to the bot; pressing Start there connects this account. */
export async function createTelegramLink(): Promise<string> {
  const { url } = await apiRequest<{ url: string }>('/api/telegram/link', { method: 'POST' });
  return url;
}

export async function disconnectTelegram(): Promise<TelegramConnection> {
  return fromPayload(await apiRequest<TelegramConnectionPayload>('/api/telegram/connection', { method: 'DELETE' }));
}

/** How the account is named next to "Telegram", as Linear's "Jira · name". */
export function telegramAccountName(connection: TelegramConnection): string | null {
  if (connection.username) return `@${connection.username}`;
  return connection.firstName;
}
