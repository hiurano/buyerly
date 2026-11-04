import { randomUUID } from 'node:crypto';
import type {
  BrowserAccountItem,
  LoginResponse,
  RequestEmailChangeRequest,
  RequestTemporaryPasswordRequest,
  UserProfileResponse,
  VerifyEmailChangeRequest,
  VerifyEmailLinkRequest,
  VerifyTemporaryPasswordRequest,
  WebSessionItem,
} from '@buyerly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IsNull, MoreThan, Not, QueryFailedError, Raw, type EntityManager, type FindOptionsWhere } from 'typeorm';
import { authenticated, currentUser } from '../auth/plugin.ts';
import {
  OTP_EMAIL_CHANGE,
  OTP_EMAIL_VERIFICATION,
  OTP_LOGIN,
  emailScope,
  loginScope,
  type IssuedOtp,
} from '../auth/otp.ts';
import {
  clearSessionCookies,
  createWebSession,
  liveBrowserSessions,
  sessionCookieTokens,
} from '../auth/sessions.ts';
import { afterCommit } from '../database.ts';
import { otpVerificationEmail } from '../email/login-email.ts';
import { UserEntity, WebSessionEntity, WorkspaceInviteEntity } from '../entities/index.ts';
import { HttpError } from '../http/errors.ts';
import { rateLimit } from '../http/rate-limit.ts';
import { userWorkspacesList } from '../workspaces/access.ts';

// Sign-in by emailed code or link, browser sessions, and the profile
// (api/routers/auth.py), on the same paths and with the same answers.
// /api/auth/update-profile is served by GraphQL (userUpdate) and moves with
// it; /api/admin/overview moves with Admin.

// pydantic's request models, as JSON Schema; extra="forbid" everywhere.
function bodySchema(properties: Record<string, object>, required: string[]): object {
  return { type: 'object', properties, required, additionalProperties: false };
}
const text = (minLength: number, maxLength: number) => ({ type: 'string', minLength, maxLength });
const optionalText = (minLength: number, maxLength: number) => ({ type: ['string', 'null'], minLength, maxLength });

const REQUEST_TEMPORARY_PASSWORD = bodySchema(
  { email: text(3, 255), invite_token: optionalText(16, 255), turnstile_token: optionalText(0, 2048) },
  ['email'],
);
const VERIFY_TEMPORARY_PASSWORD = bodySchema({ email: text(3, 255), code: text(10, 20) }, ['email', 'code']);
const VERIFY_EMAIL_LINK = bodySchema({ token: text(32, 255) }, ['token']);
const REQUEST_EMAIL_CHANGE = bodySchema({ new_email: text(3, 255) }, ['new_email']);
const VERIFY_EMAIL_CHANGE = bodySchema({ code: text(1, 20) }, ['code']);

const CODE_SENT_RECENTLY = 'A code was sent recently. Wait one minute before requesting another.';
const NOT_DELIVERED = 'The verification code email could not be delivered. Please try again later.';
const SUPERSEDED = 'This code request was superseded by a newer one';
const TOO_MANY_ATTEMPTS = 'Too many incorrect code attempts. Request a new code.';

// A time as pydantic writes Python's datetime: ISO 8601 in UTC with "Z" and
// six fraction digits, none when they are all zero. node-postgres reads
// milliseconds, so the last three digits are always 0 here.
export function utcIso(value: Date): string {
  const iso = value.toISOString();
  return value.getUTCMilliseconds() === 0 ? iso.replace(/\.\d{3}Z$/, 'Z') : iso.replace(/Z$/, '000Z');
}

function lowerEquals(value: string) {
  return Raw((column) => `lower(${column}) = :value`, { value });
}

function inviteIsActive(invite: WorkspaceInviteEntity, now: Date): boolean {
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt && invite.expiresAt <= now) return false;
  return invite.maxUses === 0 || invite.usedCount < invite.maxUses;
}

// Authorize an email sign-in and find the invitation it belongs to, if any.
// Sign-up is open, so any address may sign in; only an explicit invitation
// can refuse: a spent, expired or foreign one is not accepted.
async function resolveLoginAuthorization(
  tx: EntityManager,
  email: string,
  invite: { token?: string | null; id?: number | null } = {},
): Promise<[boolean, WorkspaceInviteEntity | null]> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return [false, null];
  const now = new Date();
  if (invite.token || invite.id) {
    const found = await tx.findOne(WorkspaceInviteEntity, {
      where: invite.token ? { token: invite.token.trim() } : { id: invite.id! },
      lock: { mode: 'pessimistic_write' },
    });
    if (!found || !inviteIsActive(found, now)) return [false, null];
    const target = (found.email ?? '').trim().toLowerCase();
    if (target && target !== cleanEmail) return [false, null];
    return [true, found];
  }
  const pending: WorkspaceInviteEntity[] = await tx
    .createQueryBuilder(WorkspaceInviteEntity, 'invite')
    .where('lower(invite.email) = :email', { email: cleanEmail })
    .andWhere("invite.status = 'pending'")
    .andWhere('(invite.expires_at IS NULL OR invite.expires_at > :now)', { now })
    .andWhere('(invite.max_uses = 0 OR invite.used_count < invite.max_uses)')
    .orderBy('invite.id', 'DESC')
    .getMany();
  return [true, pending[0] ?? null];
}

async function completePasswordlessLogin(
  tx: EntityManager,
  request: FastifyRequest,
  reply: FastifyReply,
  email: string,
  inviteId: number | null | undefined,
): Promise<LoginResponse> {
  const cleanEmail = email.trim().toLowerCase();
  // Sign-up is open. Never fall back to an invitation created after the code
  // was issued: the code carries its invitation context.
  let invite: WorkspaceInviteEntity | null = null;
  if (inviteId != null) {
    const [allowed, found] = await resolveLoginAuthorization(tx, cleanEmail, { id: inviteId });
    if (!allowed) throw afterCommit(new HttpError(403, 'Access is no longer permitted. Request a new sign-in link.'));
    invite = found;
  }

  let user = await tx.findOne(UserEntity, { where: { email: lowerEquals(cleanEmail) }, lock: { mode: 'pessimistic_write' } });
  if (!user) {
    const collision = await tx.exists(UserEntity, { where: { username: lowerEquals(cleanEmail) } });
    user = tx.create(UserEntity, {
      username: collision ? `user-${randomUUID().replace(/-/g, '')}` : cleanEmail,
      email: cleanEmail,
      emailVerifiedAt: new Date(),
      role: 'buyer',
      isApproved: true,
      onboardingCompleted: false,
      onboardingStep: invite ? 'personal_details' : 'workspace',
    });
    await tx.save(user);
  } else {
    if (!user.emailVerifiedAt) {
      // Nobody proved this address belongs to the account: a code to the
      // inbox must not hand over an account someone else set it on.
      throw afterCommit(new HttpError(403, "This email isn't confirmed on its account. Contact support to sign in."));
    }
    if (!user.isApproved && invite) {
      // An invitation is an administrator letting this person in.
      user.isApproved = true;
      await tx.update(UserEntity, { id: user.id }, { isApproved: true });
    }
  }
  if (!user.isApproved) throw afterCommit(new HttpError(403, 'Your account is awaiting administrator approval.'));

  await createWebSession(tx, request, reply, user);
  return {
    account_id: user.id,
    username: user.username,
    full_name: user.fullName || user.username,
    role: user.role,
    message: 'Signed in successfully',
    redirect_url: invite ? `/invite/${invite.token}` : null,
  };
}

function validEmail(raw: string): string {
  const clean = raw.trim().toLowerCase();
  if (!clean.includes('@') || !clean.includes('.')) throw new HttpError(400, 'Invalid email address');
  return clean;
}

// Mail the code (and link); a failed send with Resend configured spends the
// code and answers 502. Returns once the code is marked delivered, which is
// what lets it be entered. `then` runs in the same transaction as the mark.
async function deliver(
  app: FastifyInstance,
  issued: IssuedOtp,
  email: string,
  loginLink: string | null,
  then: (tx: EntityManager) => Promise<void> = async () => {},
): Promise<void> {
  let sent = false;
  try {
    sent = await app.services.sendEmail(otpVerificationEmail(email, issued.code, loginLink));
  } catch (error) {
    app.log.error({ err: error, email }, 'Failed to send the verification email');
  }
  if (!sent && app.config.resendApiKey) {
    await app.db.transaction((tx) => app.otp.invalidate(tx, issued.recordId));
    throw new HttpError(502, NOT_DELIVERED);
  }
  await app.db.transaction(async (tx) => {
    if (!(await app.otp.markDelivered(tx, issued.recordId))) throw new HttpError(409, SUPERSEDED);
    await then(tx);
  });
}

function parseBool(raw: unknown): boolean | null {
  const value = String(Array.isArray(raw) ? raw[raw.length - 1] : raw).trim().toLowerCase();
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(value)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(value)) return false;
  return null;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const cookies = () => ({ secure: app.config.sessionCookieSecure });

  // Email one single-use login link and its matching code. A new address
  // with no invitation is a sign-up: it must pass Cloudflare Turnstile first.
  app.post<{ Body: RequestTemporaryPasswordRequest }>(
    '/api/auth/request-temporary-password',
    {
      schema: { body: REQUEST_TEMPORARY_PASSWORD },
      preValidation: [rateLimit({ limit: 5, scope: 'otp_req', identityFields: ['email'] })],
    },
    async (request) => {
      const email = validEmail(request.body.email);
      const issued = await app.db.transaction(async (tx) => {
        const [allowed, invite] = await resolveLoginAuthorization(tx, email, { token: request.body.invite_token });
        if (!allowed) throw new HttpError(403, 'This invitation is no longer valid. Ask for a new one.');
        if (!invite) {
          const hasAccount = await tx.exists(UserEntity, { where: { email: lowerEquals(email) } });
          if (!hasAccount && !(await app.services.verifyTurnstile(request.body.turnstile_token, app.clientAddress.ip(request)))) {
            throw new HttpError(400, "We couldn't verify you're human. Please try again.");
          }
        }
        const scope = loginScope(email);
        if (await app.otp.hasRecentActive(tx, scope)) throw new HttpError(429, CODE_SENT_RECENTLY);
        return app.otp.create(tx, { email, purpose: OTP_LOGIN, scope, inviteId: invite?.id ?? null });
      });
      const webappUrl = (app.config.webappUrl || 'https://buyerly.app').replace(/\/+$/, '');
      await deliver(app, issued, email, `${webappUrl}/auth/email/verify?token=${issued.linkToken}`);
      return { ok: true, message: 'A temporary password has been sent to your email' };
    },
  );

  // Atomically verify a delivered login code, then create or sign in the user.
  app.post<{ Body: VerifyTemporaryPasswordRequest }>(
    '/api/auth/verify-temporary-password',
    {
      schema: { body: VERIFY_TEMPORARY_PASSWORD },
      preValidation: [rateLimit({ limit: 10, scope: 'verify_login_otp', identityFields: ['email'] })],
    },
    async (request, reply): Promise<LoginResponse> => {
      const email = validEmail(request.body.email);
      return app.db.transaction(async (tx) => {
        const result = await app.otp.consume(tx, loginScope(email), request.body.code);
        if (result.status !== 'consumed' || result.purpose !== OTP_LOGIN) {
          if (result.status === 'locked') throw afterCommit(new HttpError(401, TOO_MANY_ATTEMPTS));
          throw afterCommit(new HttpError(401, 'Invalid or expired temporary password'));
        }
        return completePasswordlessLogin(tx, request, reply, email, result.inviteId);
      });
    },
  );

  // Atomically exchange a delivered one-time email link for a session.
  app.post<{ Body: VerifyEmailLinkRequest }>(
    '/api/auth/verify-email-link',
    {
      schema: { body: VERIFY_EMAIL_LINK },
      preValidation: [rateLimit({ limit: 10, scope: 'verify_login_link', identityFields: ['token'] })],
    },
    async (request, reply): Promise<LoginResponse> =>
      app.db.transaction(async (tx) => {
        const result = await app.otp.consumeMagicLink(tx, request.body.token);
        if (result.status !== 'consumed' || result.purpose !== OTP_LOGIN || !result.email) {
          throw afterCommit(new HttpError(401, 'This sign-in link is invalid or has expired'));
        }
        return completePasswordlessLogin(tx, request, reply, result.email, result.inviteId);
      }),
  );

  // Mail a code that attaches or changes the member's email.
  app.post<{ Body: RequestEmailChangeRequest }>(
    '/api/auth/request-email-change',
    {
      schema: { body: REQUEST_EMAIL_CHANGE },
      preValidation: [rateLimit({ limit: 5, scope: 'email_change_req' }), currentUser],
    },
    async (request) => {
      const clean = request.body.new_email.trim().toLowerCase();
      if (!clean || !clean.includes('@') || !clean.includes('.')) throw new HttpError(400, 'Invalid email address');
      const userId = request.auth!.user.id;
      const issued = await app.db.transaction(async (tx) => {
        const user = await tx.findOneByOrFail(UserEntity, { id: userId });
        if ((user.email ?? '').trim().toLowerCase() === clean && user.emailVerifiedAt) return null;
        const taken = await tx.exists(UserEntity, {
          where: { email: lowerEquals(clean), id: Not(user.id), emailVerifiedAt: Not(IsNull()) },
        });
        if (taken) throw new HttpError(409, 'This email address is already in use by another user');
        const scope = emailScope(user.id);
        if (await app.otp.hasRecentActive(tx, scope)) throw new HttpError(429, CODE_SENT_RECENTLY);
        return app.otp.create(tx, { email: clean, purpose: OTP_EMAIL_CHANGE, scope });
      });
      if (!issued) return { ok: true, message: 'This email is already confirmed for your account', already_verified: true };
      await deliver(app, issued, clean, null, async (tx) => {
        await tx.update(UserEntity, { id: userId }, { unconfirmedEmail: clean });
      });
      return { ok: true, message: 'A confirmation code has been sent to the new email', unconfirmed_email: clean };
    },
  );

  // Atomically verify the code and make the new email the member's own.
  app.post<{ Body: VerifyEmailChangeRequest }>(
    '/api/auth/verify-email-change',
    {
      schema: { body: VERIFY_EMAIL_CHANGE },
      preValidation: [rateLimit({ limit: 10, scope: 'verify_email_code' }), currentUser],
    },
    async (request) => {
      const userId = request.auth!.user.id;
      let email: string;
      try {
        email = await app.db.transaction(async (tx) => {
          const user = await tx.findOneByOrFail(UserEntity, { id: userId });
          const pending = user.unconfirmedEmail || user.email;
          if (!pending) throw new HttpError(400, 'There is no active email confirmation request');
          const target = pending.trim().toLowerCase();
          const result = await app.otp.consume(tx, emailScope(user.id), request.body.code);
          if (result.status !== 'consumed' || (result.purpose !== OTP_EMAIL_CHANGE && result.purpose !== OTP_EMAIL_VERIFICATION)) {
            if (result.status === 'locked') throw afterCommit(new HttpError(401, TOO_MANY_ATTEMPTS));
            throw afterCommit(new HttpError(400, 'Invalid confirmation code'));
          }
          // Rolled back: the code stays usable for the request it belongs to.
          if (result.email !== target) throw new HttpError(400, 'The code does not match the active email request');

          const sameEmail: FindOptionsWhere<UserEntity> = { email: lowerEquals(target), id: Not(user.id) };
          if (await tx.exists(UserEntity, { where: { ...sameEmail, emailVerifiedAt: Not(IsNull()) } })) {
            throw new HttpError(409, 'This email has already been confirmed by another user');
          }
          // Legacy holders of the address who never confirmed it lose it.
          await tx.update(UserEntity, sameEmail, { email: null });
          await tx.update(UserEntity, { id: user.id }, { email: target, emailVerifiedAt: new Date(), unconfirmedEmail: null });
          return target;
        });
      } catch (error) {
        if (!(error instanceof QueryFailedError)) throw error;
        request.log.error({ err: error, userId }, 'Activating the email failed');
        throw new HttpError(409, 'The email could not be activated because of a uniqueness conflict');
      }
      return { ok: true, message: 'Email confirmed and linked to your account', email, email_verified: true };
    },
  );

  // Log out this account; the browser's other accounts stay logged in (Linear).
  app.post('/api/auth/logout', { preValidation: [currentUser] }, async (request, reply) => {
    const { user, webSessionId, slot } = request.auth!;
    await app.db.transaction((tx) =>
      tx.update(WebSessionEntity, { id: webSessionId, userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() }),
    );
    clearSessionCookies(reply, cookies(), slot);
    return { message: 'Signed out' };
  });

  // Every account logged in to this browser, in the order they were added.
  // Reads only the cookies this browser sent; cookies of ended sessions are
  // dropped so their slots can take another account.
  app.get('/api/auth/accounts', async (request, reply): Promise<BrowserAccountItem[]> =>
    app.db.transaction(async (tx) => {
      const live = await liveBrowserSessions(tx, request);
      const liveSlots = new Set(live.map((item) => item.slot));
      for (const { slot } of sessionCookieTokens(request)) {
        if (!liveSlots.has(slot)) clearSessionCookies(reply, cookies(), slot);
      }
      const accounts: BrowserAccountItem[] = [];
      const seen = new Set<number>();
      for (const { slot, session } of live) {
        if (seen.has(session.userId)) continue;
        const user = await tx.findOneBy(UserEntity, { id: session.userId });
        if (!user || !user.isApproved) continue;
        seen.add(user.id);
        accounts.push({
          id: user.id,
          username: user.username || '',
          full_name: user.fullName || '',
          email: user.email,
          avatar_url: user.avatarUrl || '',
          slot,
          onboarding_completed: Boolean(user.onboardingCompleted),
          workspaces: await userWorkspacesList(tx, user),
        });
      }
      return accounts;
    }),
  );

  // The member's signed-in browsers, most recently used first.
  app.get('/api/auth/sessions', { preValidation: [currentUser] }, async (request): Promise<WebSessionItem[]> => {
    const { user, webSessionId } = request.auth!;
    const rows = await app.db.transaction((tx) =>
      tx.find(WebSessionEntity, {
        where: { userId: user.id, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
        order: { lastSeenAt: 'DESC', createdAt: 'DESC' },
      }),
    );
    return rows.map((row) => ({
      id: row.id,
      user_agent: row.userAgent,
      ip_address: row.ipAddress,
      location: row.location || '',
      created_at: utcIso(row.createdAt),
      expires_at: utcIso(row.expiresAt),
      last_seen_at: utcIso(row.lastSeenAt),
      current: row.id === webSessionId,
    }));
  });

  app.delete<{ Params: { sessionId: string } }>(
    '/api/auth/sessions/:sessionId',
    { preValidation: [currentUser] },
    async (request, reply) => {
      const { user, webSessionId, slot } = request.auth!;
      const { sessionId } = request.params;
      const ended = await app.db.transaction((tx) =>
        tx.update(WebSessionEntity, { id: sessionId, userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() }),
      );
      if (!ended.affected) throw new HttpError(404, 'Session not found');
      if (sessionId === webSessionId) clearSessionCookies(reply, cookies(), slot);
      return { message: 'Session ended' };
    },
  );

  // End every session of the member; with keep_current, all but this one.
  app.post<{ Querystring: { keep_current?: string } }>(
    '/api/auth/logout-all',
    { preValidation: [currentUser] },
    async (request, reply) => {
      const raw = request.query.keep_current;
      const keepCurrent = raw === undefined ? false : parseBool(raw);
      if (keepCurrent === null) {
        reply.code(422);
        return {
          detail: [{ type: 'bool_parsing', loc: ['query', 'keep_current'], msg: 'Input should be a valid boolean, unable to interpret input', input: raw }],
        };
      }
      const { user, webSessionId, slot } = request.auth!;
      await app.db.transaction((tx) =>
        tx.update(
          WebSessionEntity,
          { userId: user.id, revokedAt: IsNull(), ...(keepCurrent ? { id: Not(webSessionId) } : {}) },
          { revokedAt: new Date() },
        ),
      );
      if (keepCurrent) return { message: 'Other sessions ended' };
      clearSessionCookies(reply, cookies(), slot);
      return { message: 'All sessions ended' };
    },
  );

  // The profile lists every workspace, so it is not bound to the route's
  // X-Workspace-Slug: a URL for a foreign workspace must not read as logged out.
  app.get('/api/me', { preValidation: [authenticated] }, async (request): Promise<UserProfileResponse> =>
    app.db.transaction(async (tx) => {
      const user = await tx.findOneByOrFail(UserEntity, { id: request.auth!.user.id });
      const workspaces = await userWorkspacesList(tx, user);
      return {
        id: user.id,
        username: user.username || '',
        full_name: user.fullName || '',
        first_name: user.firstName || '',
        last_name: user.lastName || '',
        title: user.title || '',
        email: user.email,
        email_verified: Boolean(user.emailVerifiedAt),
        unconfirmed_email: user.unconfirmedEmail,
        avatar_url: user.avatarUrl || '',
        role: user.role,
        is_approved: user.isApproved,
        onboarding_step: user.onboardingStep || 'completed',
        onboarding_completed: Boolean(user.onboardingCompleted),
        active_workspace: workspaces.find((item) => item.is_active) ?? workspaces[0] ?? null,
        workspaces,
      };
    }),
  );
}
