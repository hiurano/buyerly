import { createHash, randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { In, IsNull, type EntityManager } from 'typeorm';
import { WebSessionEntity, type UserEntity } from '../entities/index.ts';
import { HttpError } from '../http/errors.ts';
import { urlSafeToken } from './otp.ts';

// Browser sessions (api/auth.py). The web_sessions table is shared with the
// Python API while both run: rows hold the SHA-256 of the session token and
// of the CSRF token, never the tokens, and both servers hash, name cookies
// and extend sessions the same way, so a session from one is valid on the
// other.

export const SESSION_COOKIE_NAME = 'buyerly_session';
export const CSRF_COOKIE_NAME = 'buyerly_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
// Linear's "Add an account…": one browser keeps a session per account, each in
// its own cookie slot. Slot 0 is the historical cookie pair; slot N adds "_N".
// The browser names the account a request acts as by its user id; the server
// never falls back to another account's session when that one is signed out.
export const ACCOUNT_HEADER_NAME = 'x-buyerly-account';
export const MAX_BROWSER_ACCOUNTS = 5;
// Use moves a session's end forward at most this often.
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

export function sessionCookieName(slot: number): string {
  return slot === 0 ? SESSION_COOKIE_NAME : `${SESSION_COOKIE_NAME}_${slot}`;
}

export function csrfCookieName(slot: number): string {
  return slot === 0 ? CSRF_COOKIE_NAME : `${CSRF_COOKIE_NAME}_${slot}`;
}

export function secretHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function headerValue(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export interface CookieSlot {
  slot: number;
  token: string;
}

// Every session cookie this browser sent, in slot order.
export function sessionCookieTokens(request: FastifyRequest): CookieSlot[] {
  const found: CookieSlot[] = [];
  for (let slot = 0; slot < MAX_BROWSER_ACCOUNTS; slot += 1) {
    const token = (request.cookies[sessionCookieName(slot)] ?? '').trim();
    if (token) found.push({ slot, token });
  }
  return found;
}

// The account the browser asks to act as; a malformed value is refused.
export function requestedAccountId(request: FastifyRequest): number | null {
  const raw = headerValue(request, ACCOUNT_HEADER_NAME).trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw) || raw.length > 18) throw new HttpError(401, 'Sign-in is required');
  return Number(raw);
}

export interface LiveSession extends CookieSlot {
  session: WebSessionEntity;
}

// This browser's unexpired, unrevoked sessions, in slot order.
export async function liveBrowserSessions(tx: EntityManager, request: FastifyRequest): Promise<LiveSession[]> {
  const slots = sessionCookieTokens(request);
  if (!slots.length) return [];
  const byHash = new Map(slots.map((item) => [secretHash(item.token), item]));
  const rows = await tx.find(WebSessionEntity, {
    where: { tokenHash: In([...byHash.keys()]), revokedAt: IsNull() },
  });
  const now = Date.now();
  return rows
    .filter((row) => row.expiresAt.getTime() > now)
    .map((row) => ({ ...byHash.get(row.tokenHash)!, session: row }))
    .sort((a, b) => a.slot - b.slot);
}

export interface CookieSettings {
  secure: boolean;
}

export function setSessionCookies(
  reply: FastifyReply,
  settings: CookieSettings,
  options: { token: string; csrfToken: string | null; expiresAt: Date; slot: number },
): void {
  const maxAge = Math.max(0, Math.floor((options.expiresAt.getTime() - Date.now()) / 1000));
  reply.setCookie(sessionCookieName(options.slot), options.token, {
    maxAge,
    expires: options.expiresAt,
    path: '/',
    secure: settings.secure,
    httpOnly: true,
    sameSite: 'lax',
  });
  if (options.csrfToken !== null) {
    // Readable by the page, which sends it back as X-CSRF-Token.
    reply.setCookie(csrfCookieName(options.slot), options.csrfToken, {
      maxAge,
      expires: options.expiresAt,
      path: '/',
      secure: settings.secure,
      httpOnly: false,
      sameSite: 'strict',
    });
  }
}

export function clearSessionCookies(reply: FastifyReply, settings: CookieSettings, slot: number): void {
  const gone = { maxAge: 0, expires: new Date(0), path: '/', secure: settings.secure };
  reply.setCookie(sessionCookieName(slot), '', { ...gone, httpOnly: true, sameSite: 'lax' });
  reply.setCookie(csrfCookieName(slot), '', { ...gone, httpOnly: false, sameSite: 'strict' });
}

// Where and with what a session was signed in, for Security & access.
export interface SessionOrigin {
  userAgent: string;
  ipAddress: string;
  location: string;
}

// The browser's address behind trusted proxies (not the proxy's own), its
// place as Cloudflare reports it, and its user agent.
export function sessionOrigin(request: FastifyRequest, fallbackAgent: string): SessionOrigin {
  const ip = request.server.clientAddress.ip(request);
  return {
    userAgent: (headerValue(request, 'user-agent') || fallbackAgent).slice(0, 500),
    ipAddress: ip === 'unknown' ? '' : ip.slice(0, 64),
    location: request.server.clientAddress.location(request),
  };
}

export function newWebSession(
  tx: EntityManager,
  options: { userId: number; token: string; csrfToken: string; origin: SessionOrigin; idleDays: number },
): WebSessionEntity {
  const now = new Date();
  return tx.create(WebSessionEntity, {
    id: randomUUID(),
    userId: options.userId,
    tokenHash: secretHash(options.token),
    csrfHash: secretHash(options.csrfToken),
    userAgent: options.origin.userAgent.slice(0, 500),
    ipAddress: options.origin.ipAddress,
    location: options.origin.location,
    createdAt: now,
    expiresAt: new Date(now.getTime() + options.idleDays * 86_400_000),
    lastSeenAt: now,
    rotatedAt: now,
    revokedAt: null,
  });
}

// Sign the user in next to the browser's other accounts. Signing in again as
// an account already in this browser replaces its slot; a new account takes
// the first free slot, and other accounts stay signed in.
export async function createWebSession(
  tx: EntityManager,
  request: FastifyRequest,
  reply: FastifyReply,
  user: UserEntity,
): Promise<WebSessionEntity> {
  const { config } = request.server;
  const live = await liveBrowserSessions(tx, request);
  const sameAccount = live.find((item) => item.session.userId === user.id);
  let slot: number;
  if (sameAccount) {
    slot = sameAccount.slot;
    await tx.update(WebSessionEntity, { id: sameAccount.session.id }, { revokedAt: new Date() });
  } else {
    const taken = new Set(live.map((item) => item.slot));
    const free = Array.from({ length: MAX_BROWSER_ACCOUNTS }, (_, index) => index).filter((index) => !taken.has(index));
    if (!free.length) {
      throw new HttpError(
        409,
        `This browser is already logged in to ${MAX_BROWSER_ACCOUNTS} accounts. Log out of one to add another.`,
      );
    }
    slot = free[0]!;
  }
  const token = urlSafeToken();
  const csrfToken = urlSafeToken();
  const session = newWebSession(tx, {
    userId: user.id,
    token,
    csrfToken,
    origin: sessionOrigin(request, ''),
    idleDays: config.webSessionIdleDays,
  });
  await tx.save(session);
  setSessionCookies(reply, { secure: config.sessionCookieSecure }, { token, csrfToken, expiresAt: session.expiresAt, slot });
  return session;
}
