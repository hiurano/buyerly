import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EntityManager } from 'typeorm';
import { UserEntity, WebSessionEntity } from '../entities/index.ts';
import { HttpError } from '../http/errors.ts';
import { userWorkspace } from '../workspaces/access.ts';
import { urlSafeToken } from './otp.ts';
import {
  CSRF_HEADER_NAME,
  SESSION_TOUCH_INTERVAL_MS,
  csrfCookieName,
  headerValue,
  liveBrowserSessions,
  newWebSession,
  requestedAccountId,
  secretHash,
  sessionCookieTokens,
  sessionOrigin,
  setSessionCookies,
} from './sessions.ts';

// Who a request acts as (api/auth.py get_authenticated_user and
// get_current_user). Routes opt in with a preValidation hook, the place
// FastAPI resolves its dependencies (before the body is validated, so a
// signed-out request answers 401, not 422):
//
//   app.post('/api/…', { preValidation: [currentUser] }, async (request) => {
//     const { user, webSessionId, slot } = request.auth!;
//   });
//
// `authenticated` signs the request in; `currentUser` also binds it to the
// workspace in X-Workspace-Slug, which the member must be allowed to open.

export interface Authenticated {
  user: UserEntity;
  webSessionId: string;
  // The cookie pair the session came in (0 for a bearer token).
  slot: number;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

function sameHash(stored: string, presented: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(secretHash(presented));
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(request: FastifyRequest): string {
  const authorization = headerValue(request, 'authorization');
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return headerValue(request, 'x-auth-token').trim();
}

interface Resolved {
  auth: Authenticated;
  token: string;
  csrfToSet: string | null;
  expiresAt: Date;
  setCookies: boolean;
}

async function resolve(tx: EntityManager, request: FastifyRequest): Promise<Resolved> {
  const { config } = request.server;
  const bearer = bearerToken(request);
  const fromCookie = !bearer;
  const requestedUserId = requestedAccountId(request);

  // A browser may hold one session per account (Linear's "Add an
  // account…"). The account header picks which one acts; without it the
  // newest sign-in acts, as when a login used to replace the cookie.
  let token = bearer;
  let slot = 0;
  if (fromCookie) {
    const cookieSlots = sessionCookieTokens(request);
    if (cookieSlots.length === 1 && requestedUserId === null) {
      ({ slot, token } = cookieSlots[0]!);
    } else if (cookieSlots.length) {
      const live = await liveBrowserSessions(tx, request);
      const chosen =
        requestedUserId !== null
          ? live.find((item) => item.session.userId === requestedUserId)
          : live.reduce<(typeof live)[number] | undefined>(
              (newest, item) => (!newest || item.session.createdAt > newest.session.createdAt ? item : newest),
              undefined,
            );
      if (chosen) ({ slot, token } = chosen);
    }
    if (requestedUserId !== null && !token) {
      // Never fall back to another account's session: a stale tab must not
      // act as whoever else is signed in.
      throw new HttpError(401, 'This account is no longer logged in');
    }
  }
  if (!token) throw new HttpError(401, 'Sign-in is required');

  const now = new Date();
  let session = await tx.findOneBy(WebSessionEntity, { tokenHash: secretHash(token) });
  let user: UserEntity | null = null;
  let csrfToSet: string | null = null;

  // Browser sessions store only token hashes. A legacy users.auth_token is
  // converted to a session on its first use.
  if (!session && bearer) {
    user = await tx.findOne(UserEntity, { where: { authToken: bearer }, lock: { mode: 'pessimistic_write' } });
    if (user) {
      csrfToSet = urlSafeToken();
      session = newWebSession(tx, {
        userId: user.id,
        token: bearer,
        csrfToken: csrfToSet,
        origin: sessionOrigin(request, 'Legacy browser'),
        idleDays: config.webSessionIdleDays,
      });
      await tx.save(session);
      await tx.update(UserEntity, { id: user.id }, { authToken: null });
      user.authToken = null;
    }
  }

  if (session && (session.revokedAt !== null || session.expiresAt <= now)) session = null;
  if (session && !user) user = await tx.findOneBy(UserEntity, { id: session.userId });
  if (!session || !user) throw new HttpError(401, 'Sign-in is required');

  if (requestedUserId !== null && user.id !== requestedUserId) {
    throw new HttpError(401, 'This account is no longer logged in');
  }
  if (!user.isApproved) throw new HttpError(403, 'Your account is awaiting administrator approval.');
  if (fromCookie && !SAFE_METHODS.has(request.method.toUpperCase())) {
    const presented = headerValue(request, CSRF_HEADER_NAME);
    if (!presented || !sameHash(session.csrfHash, presented)) throw new HttpError(403, 'CSRF check failed');
  }

  // Linear keeps a session until it is logged out, revoked or left unused,
  // and never swaps its token mid-session: a swap races the browser's
  // parallel requests (and a reload after a deploy) and signs the member
  // out. Use moves the end forward instead.
  const changes: Partial<WebSessionEntity> = {};
  let extended = false;
  if (session.lastSeenAt.getTime() <= now.getTime() - SESSION_TOUCH_INTERVAL_MS) {
    extended = true;
    changes.lastSeenAt = now;
    changes.expiresAt = new Date(now.getTime() + config.webSessionIdleDays * 86_400_000);
    const seen = sessionOrigin(request, '');
    // A place belongs to the address it was seen with.
    if (seen.location || (seen.ipAddress && seen.ipAddress !== session.ipAddress)) changes.location = seen.location;
    changes.ipAddress = seen.ipAddress || session.ipAddress;
  }
  if (!fromCookie) {
    csrfToSet = urlSafeToken();
    changes.csrfHash = secretHash(csrfToSet);
  }
  if (Object.keys(changes).length) {
    await tx.update(WebSessionEntity, { id: session.id }, changes);
    Object.assign(session, changes);
  }

  if (fromCookie && extended) {
    // The CSRF cookie lives as long as the session cookie; only the browser
    // holds its value, so it is renewed as sent.
    const sent = request.cookies[csrfCookieName(slot)] ?? '';
    if (sent && sameHash(session.csrfHash, sent)) csrfToSet = sent;
  }
  return {
    auth: { user, webSessionId: session.id, slot },
    token,
    csrfToSet,
    expiresAt: session.expiresAt,
    setCookies: !fromCookie || extended,
  };
}

// preValidation hook: the request's account, or 401/403.
export async function authenticated(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.auth) return;
  const resolved = await request.server.db.transaction((tx) => resolve(tx, request));
  request.auth = resolved.auth;
  if (resolved.setCookies) {
    setSessionCookies(reply, { secure: request.server.config.sessionCookieSecure }, {
      token: resolved.token,
      csrfToken: resolved.csrfToSet,
      expiresAt: resolved.expiresAt,
      slot: resolved.auth.slot,
    });
  }
}

// preValidation hook: authenticated, and bound to the route's workspace when
// the browser names one. Other tabs' scope stays as it is: the binding lives
// on this request's user object only.
export async function currentUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticated(request, reply);
  const slug = request.headers['x-workspace-slug'];
  if (slug === undefined) return;
  const value = Array.isArray(slug) ? (slug[0] ?? '') : slug;
  if (!value.trim()) throw new HttpError(403, 'Workspace access denied');
  const user = request.auth!.user;
  const workspace = await request.server.db.transaction((tx) => userWorkspace(tx, user, { slug: value }));
  if (!workspace) throw new HttpError(403, 'Workspace access denied');
  user.activeWorkspaceId = workspace.id;
}
