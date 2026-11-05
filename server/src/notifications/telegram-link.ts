import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { WorkspaceEntity, WorkspaceMemberEntity } from '../entities/index.ts';
import { rows } from '../database.ts';
import { INBOX_KINDS, storedNotificationChannels } from './channels.ts';

// A member's personal Telegram account (api/routers/telegram.py), as
// Linear's personal Slack account: Connect opens the bot by a one-time
// link, the person presses Start, and the chat belongs to that member.

// The link works once and only for a short while.
export const LINK_TTL_MS = 10 * 60 * 1000;

export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

// datetime.isoformat() of an aware UTC value from asyncpg: microseconds
// unless zero, then "+00:00".
export function pythonIsoSql(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM ${column})::bigint % 1000000 = 0 THEN ''
            ELSE to_char(${column} AT TIME ZONE 'UTC', '.US') END
    || '+00:00'`;
}

// The same for a moment from this process's clock (milliseconds only).
export function pythonIso(value: Date): string {
  const iso = value.toISOString().replace(/Z$/, '');
  return value.getUTCMilliseconds() === 0 ? `${iso.slice(0, -4)}+00:00` : `${iso}000+00:00`;
}

export interface TelegramConnectionInfo {
  available: boolean;
  connected: boolean;
  username: string | null;
  first_name: string | null;
  connected_at: string | null;
  error: string | null;
}

interface ConnectionRow {
  username: string | null;
  first_name: string | null;
  connected_at: string | null;
  error: string | null;
}

// telegram.py _connection_payload(None).
export function noConnection(available: boolean): TelegramConnectionInfo {
  return { available, connected: false, username: null, first_name: null, connected_at: null, error: null };
}

// telegram.py _connection_payload of the member's connection.
export async function connectionInfo(tx: EntityManager, memberId: number | null, available: boolean): Promise<TelegramConnectionInfo> {
  const [row] = memberId === null ? [] : await rows<ConnectionRow>(
    tx,
    `SELECT username, first_name, ${pythonIsoSql('connected_at')} AS connected_at, delivery_error AS error
       FROM telegram_connections WHERE member_id = $1`,
    [memberId],
  );
  if (!row) return noConnection(available);
  return { available, connected: true, ...row };
}

export interface TelegramChat { id: number }
export interface TelegramSender { username?: unknown; first_name?: unknown }

// telegram.py _link: connect the chat to the member the token was made
// for; the workspace's name, or null when the token is unknown or expired.
export async function linkChat(tx: EntityManager, token: string, chat: TelegramChat, sender: TelegramSender): Promise<string | null> {
  // Taking the token deletes it, so it never works twice.
  const [taken] = await rows<{ member_id: number; expired: boolean }>(
    tx,
    'DELETE FROM telegram_link_tokens WHERE token_hash = $1 RETURNING member_id, expires_at <= now() AS expired',
    [tokenHash(token)],
  );
  if (!taken || taken.expired) return null;
  const member = await tx.findOneBy(WorkspaceMemberEntity, { id: taken.member_id });
  if (!member) return null;
  await tx.query(
    `INSERT INTO telegram_connections (member_id, chat_id, username, first_name, connected_at, delivery_error, delivery_error_at)
     VALUES ($1, $2, $3, $4, now(), NULL, NULL)
     ON CONFLICT (member_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, username = EXCLUDED.username,
       first_name = EXCLUDED.first_name, connected_at = EXCLUDED.connected_at,
       delivery_error = NULL, delivery_error_at = NULL`,
    [member.id, chat.id, sender.username ?? null, sender.first_name ?? null],
  );
  // Connecting turns the channel on, with every type if none was left.
  const channels = storedNotificationChannels(member.notificationChannels);
  channels.telegram.enabled = true;
  if (!channels.telegram.kinds.length) channels.telegram.kinds = [...INBOX_KINDS];
  await tx.update(WorkspaceMemberEntity, { id: member.id }, { notificationChannels: channels });
  const workspace = await tx.findOneBy(WorkspaceEntity, { id: member.workspaceId });
  return workspace ? workspace.name : 'your workspace';
}

// Blocking and unblocking the bot: delivery stops and resumes with it.
export async function setReachable(tx: EntityManager, chatId: number, reachable: boolean): Promise<void> {
  await tx.query(
    reachable
      ? 'UPDATE telegram_connections SET delivery_error = NULL, delivery_error_at = NULL WHERE chat_id = $1'
      : "UPDATE telegram_connections SET delivery_error = 'blocked', delivery_error_at = now() WHERE chat_id = $1",
    [chatId],
  );
}
