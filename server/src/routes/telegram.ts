import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../http/errors.ts';
import { linkChat, setReachable } from '../notifications/telegram-link.ts';

// The webhook Telegram calls the bot through (api/routers/telegram.py
// telegram_webhook), a REST path by decision №55. The bot answers only
// "/start <token>" from a private chat, the one-time link of
// Settings → Connected accounts, and follows being blocked and unblocked;
// everything else is acknowledged and ignored.

const LINKED_TEXT = (workspace: string): string =>
  `Telegram is connected to <b>${workspace}</b> in Buyerly. New notifications from your Inbox will arrive here.`;
const EXPIRED_TEXT =
  'This link has expired or was already used. In Buyerly open Settings → Connected accounts and press Connect again.';

// html.escape(…, quote=True).
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
// isinstance(value, int): a JSON integer (Python's bool never comes from JSON here).
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
// Python's `x or {}` / `x or ""`: falsy values give the fallback.
const objectOr = (value: unknown): Json => (value ? (value as Json) : {});

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  // Whatever Telegram (or anyone) posts is read as Python's request.json()
  // reads it: any content type, and a body that is no JSON is just ignored.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  app.post('/api/telegram/webhook', async (request) => {
    const bot = app.services.telegram;
    const header = request.headers['x-telegram-bot-api-secret-token'];
    const secret = Array.isArray(header) ? header[0] : header;
    if (!bot.configured || !secret || !secretMatches(secret, bot.webhookSecret())) {
      throw new HttpError(404, 'Not Found');
    }
    let update: unknown;
    try {
      update = JSON.parse(typeof request.body === 'string' ? request.body : '');
    } catch {
      return { ok: true };
    }
    if (!isObject(update)) return { ok: true };

    const membership = update.my_chat_member;
    if (isObject(membership)) {
      const chat = objectOr(membership.chat);
      const status = objectOr(membership.new_chat_member).status;
      if (chat.type === 'private' && isInt(chat.id) && (status === 'kicked' || status === 'member')) {
        await app.db.transaction((tx) => setReachable(tx, chat.id as number, status === 'member'));
      }
      return { ok: true };
    }

    const message = update.message;
    if (!isObject(message)) return { ok: true };
    const chat = objectOr(message.chat);
    const text = message.text || '';
    // Only "/start <token>" from a private chat is a link.
    if (chat.type !== 'private' || !isInt(chat.id) || typeof text !== 'string' || !text.startsWith('/start ')) {
      return { ok: true };
    }
    // text.split(maxsplit=1)[1].strip(); a bare "/start " is ignored here
    // (Python fails on it with a 500, which Telegram only retries).
    const token = /^\S+\s+([\s\S]+)$/.exec(text.trim())?.[1].trim() ?? '';
    if (!token || token.length > 64) return { ok: true };
    const chatId = chat.id;
    const workspace = await app.db.transaction((tx) => linkChat(tx, token, { id: chatId }, objectOr(message.from)));
    const reply = workspace ? LINKED_TEXT(escapeHtml(workspace)) : EXPIRED_TEXT;
    const result = await bot.sendMessage(chatId, reply);
    if (!result.ok) request.log.warn('Telegram link reply to %s failed: %s', chatId, result.error);
    return { ok: true };
  });
}
