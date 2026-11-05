import { createHmac } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';

// The Buyerly Telegram bot (core/telegram.py), the part the client API and
// the webhook need: whether it is set up, its @username for t.me links, the
// webhook's secret and one reply. Delivering Inbox notifications stays with
// the Python worker until stage 4.

export const TELEGRAM_API_URL = 'https://api.telegram.org';

export interface TelegramSendResult {
  ok: boolean;
  error: string;
}

export interface TelegramBot {
  configured: boolean;
  // Telegram sends it back in X-Telegram-Bot-Api-Secret-Token; derived from the token.
  webhookSecret(): string;
  // Asked from Telegram once per process; null when it cannot be had.
  username(): Promise<string | null>;
  // An HTML message.
  sendMessage(chatId: number, text: string): Promise<TelegramSendResult>;
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
    async sendMessage(chatId, text) {
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
        });
        if (response.ok) return { ok: true, error: '' };
        const error = await description(response);
        log.error('Telegram sendMessage to %s failed: HTTP %d %s', chatId, response.status, error);
        return { ok: false, error };
      } catch (error) {
        log.error('Telegram sendMessage to %s failed: %s', chatId, (error as Error).message);
        return { ok: false, error: (error as Error).name };
      }
    },
  };
}
