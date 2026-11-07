import { createHmac } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';

// The Buyerly Telegram bot (core/telegram.py), the part the client API and
// the webhook and the worker's Inbox delivery need: whether it is set up,
// its @username for t.me links, the webhook's secret and sending a message.

export const TELEGRAM_API_URL = 'https://api.telegram.org';

export interface TelegramSendResult {
  ok: boolean;
  error: string;
  // The person blocked the bot or deleted their account: retrying will not help.
  unreachable?: boolean;
}

export interface TelegramBot {
  configured: boolean;
  // Telegram sends it back in X-Telegram-Bot-Api-Secret-Token; derived from the token.
  webhookSecret(): string;
  // Asked from Telegram once per process; null when it cannot be had.
  username(): Promise<string | null>;
  // An HTML message, optionally with one link button.
  sendMessage(chatId: number, text: string, button?: { label: string; url: string }): Promise<TelegramSendResult>;
}

export function telegramBot(token: string, log: FastifyBaseLogger, fetcher: typeof fetch = fetch): TelegramBot {
  let username: string | null = null;

  async function call(method: string, payload: Record<string, unknown>): Promise<Response> {
    return fetcher(`${TELEGRAM_API_URL}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function description(response: Response): Promise<string> {
    const text = await response.text();
    try {
      const found = (JSON.parse(text) as { description?: unknown }).description;
      return typeof found === 'string' ? found : found ? JSON.stringify(found) : '';
    } catch {
      return text.slice(0, 200);
    }
  }

  return {
    configured: Boolean(token),
    webhookSecret: () => createHmac('sha256', token).update('buyerly-telegram-webhook').digest('hex'),
    async username() {
      if (username || !token) return username;
      try {
        const response = await call('getMe', {});
        if (response.ok) {
          const body = (await response.json()) as { result?: { username?: string } };
          username = body.result?.username || null;
        } else {
          log.error('Telegram getMe failed: HTTP %d %s', response.status, await description(response));
        }
      } catch (error) {
        log.error('Telegram getMe failed: %s', (error as Error).message);
      }
      return username;
    },
    async sendMessage(chatId, text, button) {
      if (!token) {
        log.info('[DEV TELEGRAM] To: %s | %s', chatId, text.split('\n', 1)[0]);
        return { ok: true, error: '' };
      }
      try {
        const response = await call('sendMessage', {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.label, url: button.url }]] } } : {}),
        });
        if (response.status === 200) return { ok: true, error: '' };
        const error = await description(response);
        if (response.status === 403 || error.toLowerCase().includes('chat not found')) return { ok: false, unreachable: true, error };
        log.error('Telegram sendMessage to %s failed: HTTP %d %s', chatId, response.status, error);
        return { ok: false, error };
      } catch (error) {
        log.error('Telegram sendMessage to %s failed: %s', chatId, (error as Error).message);
        return { ok: false, error: (error as Error).name };
      }
    },
  };
}

// The webhook Telegram calls the bot back on (routes/telegram.ts). Pointed at
// this server on every start, as core/telegram.py did; harmless to repeat, and
// a failure only delays linking.
export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
const ALLOWED_UPDATES = ['message', 'my_chat_member'];

export async function registerTelegramWebhook(
  token: string,
  webappUrl: string,
  log: FastifyBaseLogger,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const url = (webappUrl || 'https://buyerly.app').replace(/\/+$/, '') + TELEGRAM_WEBHOOK_PATH;
  try {
    const response = await fetcher(`${TELEGRAM_API_URL}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: telegramBot(token, log, fetcher).webhookSecret(),
        allowed_updates: ALLOWED_UPDATES,
        max_connections: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      log.error('Telegram setWebhook failed: HTTP %d %s', response.status, (await response.text()).slice(0, 200));
      return false;
    }
  } catch (error) {
    log.error('Telegram setWebhook failed: %s', (error as Error).message);
    return false;
  }
  log.info('Telegram webhook set to %s', url);
  return true;
}
