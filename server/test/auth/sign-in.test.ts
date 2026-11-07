import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { EmailVerificationCodeEntity, UserEntity, WorkspaceInviteEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createInvite, createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, codeFrom, contractTarget, type InProcessTarget, type Target } from '../support/target.ts';

// Sign-in by emailed code and link: tests/test_api.py (the OTP tests),
// tests/test_open_signup.py and tests/test_rate_limit.py, over HTTP.

describe.skipIf(!DATABASE_URL)('sign-in by email', () => {
  let target: Target;
  let db: DataSource;

  beforeAll(async () => {
    target = await contractTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  const browser = (headers?: Record<string, string>) => new Browser(target, headers);
  const newEmail = () => `${unique('person')}@example.test`;
  const codesFor = (email: string) => db.getRepository(EmailVerificationCodeEntity).findBy({ email });
  const userByEmail = (email: string) => db.getRepository(UserEntity).findOneBy({ email });

  it('allows one code request a minute per address', async () => {
    const client = browser();
    const email = newEmail();
    expect((await client.post('/api/auth/request-temporary-password', { email })).status).toBe(200);
    const second = await client.post('/api/auth/request-temporary-password', { email });
    expect(second.status).toBe(429);
    expect(second.json().detail).toBe('A code was sent recently. Wait one minute before requesting another.');
  });

  it('refuses an address that is not one', async () => {
    const response = await browser().post('/api/auth/request-temporary-password', { email: 'nobody' });
    expect(response.status).toBe(400);
    expect(response.json()).toEqual({ detail: 'Invalid email address' });
  });

  it('refuses a malformed input in the words pydantic used', async () => {
    const client = browser();
    const missing = await client.post('/api/auth/request-temporary-password', {});
    expect(missing.status).toBe(422);
    expect(missing.json()).toEqual({ detail: 'Field required' });

    const extra = await client.post('/api/auth/verify-email-link', { token: 'x'.repeat(40), extra: 1 });
    expect(extra.status).toBe(422);
    expect(extra.json()).toEqual({ detail: 'Extra inputs are not permitted' });

    const short = await client.post('/api/auth/verify-temporary-password', { email: 'a@b.c', code: 'ABC' });
    expect(short.status).toBe(422);
    expect(short.json()).toEqual({ detail: 'String should have at least 10 characters' });
  });

  it('answers 502 and spends the code when the email cannot be sent', async () => {
    const { typescriptTarget } = await import('../support/target.ts');
    const failing: InProcessTarget = await typescriptTarget({ RESEND_API_KEY: 're_test_dummy_key' });
    try {
      failing.services.sendEmail = async () => false;
      const email = newEmail();
      const response = await new Browser(failing).post('/api/auth/request-temporary-password', { email });
      expect(response.status).toBe(502);
      expect(response.json().detail).toContain('could not be delivered');
      expect(await userByEmail(email)).toBeNull();
      const [code] = await codesFor(email);
      expect(code.isUsed).toBe(true);
      expect(code.deliveredAt).toBeNull();
      expect(code.code).toBe('');
      expect(code.codeHash).toHaveLength(64);
    } finally {
      await failing.close();
    }
  });

  it('locks a code after five wrong attempts', async () => {
    const client = browser();
    const email = newEmail();
    expect((await client.post('/api/auth/request-temporary-password', { email })).status).toBe(200);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await client.post('/api/auth/verify-temporary-password', { email, code: 'AAAAAAAAAA' });
      expect(failed.status).toBe(401);
      expect(failed.json().detail).toBe('Invalid or expired temporary password');
    }
    const fifth = await client.post('/api/auth/verify-temporary-password', { email, code: 'AAAAAAAAAA' });
    expect(fifth.status).toBe(401);
    expect(fifth.json().detail).toContain('Too many incorrect code attempts');
    const [code] = await codesFor(email);
    expect(code.isUsed).toBe(true);
    expect(code.failedAttempts).toBe(5);
  });

  it('creates the user only after the code is entered, and the code works once', async () => {
    const client = browser();
    const email = newEmail();
    expect((await client.post('/api/auth/request-temporary-password', { email })).status).toBe(200);
    expect(await userByEmail(email)).toBeNull();

    const { code, linkToken } = codeFrom(await target.lastEmail(email));
    // Entered in any case and spacing, like Linear's.
    const typed = `${code.slice(0, 5).toLowerCase()} ${code.slice(5)}`;
    const [first, second] = await Promise.all([
      client.post('/api/auth/verify-temporary-password', { email, code: typed }),
      browser().post('/api/auth/verify-temporary-password', { email, code }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 401]);

    const users = await db.getRepository(UserEntity).findBy({ username: email });
    expect(users).toHaveLength(1);
    expect(users[0].emailVerifiedAt).not.toBeNull();
    expect(users[0].onboardingStep).toBe('workspace');
    expect(users[0].role).toBe('buyer');

    // The code and link are two ways to spend the same credential.
    expect((await browser().post('/api/auth/verify-email-link', { token: linkToken })).status).toBe(401);
  });

  it('signs in once by link and stores only its hash', async () => {
    const client = browser();
    const email = newEmail();
    expect((await client.post('/api/auth/request-temporary-password', { email })).status).toBe(200);
    const message = await target.lastEmail(email);
    expect(message.subject).toBe('Login for Buyerly');
    const { linkToken } = codeFrom(message);
    const [record] = await codesFor(email);
    expect(record.linkTokenHash).not.toBe(linkToken);
    expect(record.linkTokenHash).toHaveLength(64);

    const verified = await client.post('/api/auth/verify-email-link', { token: linkToken });
    expect(verified.status).toBe(200);
    const user = await userByEmail(email);
    expect(verified.json()).toEqual({
      account_id: user!.id,
      username: email,
      full_name: email,
      role: 'buyer',
      message: 'Signed in successfully',
      redirect_url: null,
    });
    expect(client.cookie('buyerly_session')).toBeTruthy();

    const replay = await browser().post('/api/auth/verify-email-link', { token: linkToken });
    expect(replay.status).toBe(401);
    expect(replay.json()).toEqual({ detail: 'This sign-in link is invalid or has expired' });
  });

  it('lets a member who joined sign in again by code and by link', async () => {
    const admin = await createUser(db, { role: 'admin' });
    const workspace = await createWorkspace(db, admin);
    const member = await createUser(db);
    await createInvite(db, { workspace, inviter: admin, email: member.email, status: 'accepted', usedCount: 1 });
    for (const useLink of [false, true]) {
      const client = browser();
      expect((await client.post('/api/auth/request-temporary-password', { email: member.email })).status).toBe(200);
      const { code, linkToken } = codeFrom(await target.lastEmail(member.email!));
      const response = useLink
        ? await client.post('/api/auth/verify-email-link', { token: linkToken })
        : await client.post('/api/auth/verify-temporary-password', { email: member.email, code });
      expect(response.status).toBe(200);
      expect(response.json().redirect_url).toBeNull();
      expect(client.cookie('buyerly_session')).toBeTruthy();
      // The second request comes within a minute of the first.
      await db.getRepository(EmailVerificationCodeEntity).update({ email: member.email! }, { createdAt: new Date(Date.now() - 120_000) });
    }
  });

  it('returns an invited person to the invitation', async () => {
    const admin = await createUser(db, { role: 'admin' });
    const workspace = await createWorkspace(db, admin);
    const email = newEmail();
    const invite = await createInvite(db, { workspace, inviter: admin, email });

    // Without naming the invitation, it is found by the address.
    const client = browser();
    expect((await client.post('/api/auth/request-temporary-password', { email })).status).toBe(200);
    await db.getRepository(EmailVerificationCodeEntity).update({ email }, { createdAt: new Date(Date.now() - 120_000) });

    expect((await client.post('/api/auth/request-temporary-password', { email, invite_token: invite.token })).status).toBe(200);
    const { code } = codeFrom(await target.lastEmail(email));
    const response = await client.post('/api/auth/verify-temporary-password', { email, code });
    expect(response.status).toBe(200);
    expect(response.json().redirect_url).toBe(`/invite/${invite.token}`);
    expect((await userByEmail(email))!.onboardingStep).toBe('personal_details');
  });

  it('refuses a spent or foreign invitation', async () => {
    const admin = await createUser(db, { role: 'admin' });
    const workspace = await createWorkspace(db, admin);
    const email = newEmail();
    const invite = await createInvite(db, { workspace, inviter: admin, email });
    for (const [address, token] of [[newEmail(), invite.token], [email, 'no-such-invitation-token']] as const) {
      const response = await browser().post('/api/auth/request-temporary-password', { email: address, invite_token: token });
      expect(response.status).toBe(403);
      expect(response.json()).toEqual({ detail: 'This invitation is no longer valid. Ask for a new one.' });
      expect(await codesFor(address)).toHaveLength(0);
    }
  });

  it('refuses a code whose invitation was revoked after it was sent', async () => {
    const admin = await createUser(db, { role: 'admin' });
    const workspace = await createWorkspace(db, admin);
    const email = newEmail();
    const invite = await createInvite(db, { workspace, inviter: admin, email });
    const client = browser();
    expect((await client.post('/api/auth/request-temporary-password', { email, invite_token: invite.token })).status).toBe(200);
    await db.getRepository(WorkspaceInviteEntity).update({ id: invite.id }, { status: 'revoked' });

    const { code } = codeFrom(await target.lastEmail(email));
    const denied = await client.post('/api/auth/verify-temporary-password', { email, code });
    expect(denied.status).toBe(403);
    expect(denied.json()).toEqual({ detail: 'Access is no longer permitted. Request a new sign-in link.' });
    expect(await userByEmail(email)).toBeNull();
    // The code is spent all the same.
    expect((await codesFor(email))[0].isUsed).toBe(true);
  });

  it('gives an unapproved account a code but no session', async () => {
    const user = await createUser(db, { approved: false });
    const client = browser();
    const response = await client.signIn(user.email!);
    expect(response.status).toBe(403);
    expect(response.json()).toEqual({ detail: 'Your account is awaiting administrator approval.' });
    expect(client.cookie('buyerly_session')).toBeUndefined();
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).isApproved).toBe(false);
  });

  it('does not open an account whose email was never confirmed', async () => {
    const user = await createUser(db, { verified: false });
    for (const useLink of [false, true]) {
      const client = browser();
      expect((await client.post('/api/auth/request-temporary-password', { email: user.email })).status).toBe(200);
      const { code, linkToken } = codeFrom(await target.lastEmail(user.email!));
      const response = useLink
        ? await client.post('/api/auth/verify-email-link', { token: linkToken })
        : await client.post('/api/auth/verify-temporary-password', { email: user.email, code });
      expect(response.status).toBe(403);
      expect(response.json().detail).toContain("isn't confirmed");
      expect(client.cookie('buyerly_session')).toBeUndefined();
      await db.getRepository(EmailVerificationCodeEntity).update({ email: user.email! }, { createdAt: new Date(Date.now() - 120_000) });
    }
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).emailVerifiedAt).toBeNull();
  });

  it('names a new user after the address unless a username takes it', async () => {
    const email = newEmail();
    await createUser(db, { username: email.toUpperCase(), email: null });
    const response = await browser().signIn(email);
    expect(response.status).toBe(200);
    expect(response.json().username).toMatch(/^user-[0-9a-f]{32}$/);
  });

  it('asks for Turnstile only from a new address without an invitation', async () => {
    const { typescriptTarget } = await import('../support/target.ts');
    const guarded = await typescriptTarget({ TURNSTILE_SECRET_KEY: 'test-turnstile-secret' });
    try {
      const tokens: (string | null | undefined)[] = [];
      let answer = false;
      guarded.services.verifyTurnstile = async (token) => {
        tokens.push(token);
        return answer;
      };
      const client = new Browser(guarded);
      const fresh = newEmail();
      const refused = await client.post('/api/auth/request-temporary-password', { email: fresh });
      expect(refused.status).toBe(400);
      expect(refused.json().detail).toContain("verify you're human");
      expect(tokens).toEqual([undefined]);
      await expect(guarded.lastEmail(fresh)).rejects.toThrow();

      answer = true;
      expect((await client.post('/api/auth/request-temporary-password', { email: fresh, turnstile_token: 'cf-token' })).status).toBe(200);
      expect(tokens.at(-1)).toBe('cf-token');

      tokens.length = 0;
      answer = false;
      const admin = await createUser(db, { role: 'admin' });
      const workspace = await createWorkspace(db, admin);
      const invited = newEmail();
      await createInvite(db, { workspace, inviter: admin, email: invited });
      for (const email of [(await createUser(db)).email!, invited]) {
        expect((await new Browser(guarded).post('/api/auth/request-temporary-password', { email })).status).toBe(200);
      }
      expect(tokens).toEqual([]);
    } finally {
      await guarded.close();
    }
  });

  it('limits wrong codes per address, and per account across addresses', async () => {
    const user = await createUser(db);
    const client = browser();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await client.post('/api/auth/verify-temporary-password', { email: `x${user.email}`, code: 'WRONGCODES' })).status).toBe(401);
    }
    const limited = await client.post('/api/auth/verify-temporary-password', { email: user.email, code: 'OTHERCODES' });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeTruthy();
    expect(limited.json().detail).toContain('Too many requests');

    // Rotating addresses does not help: the account has a counter of its own.
    const other = await createUser(db);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const rotated = await browser().post('/api/auth/verify-temporary-password', { email: other.email, code: 'WRONGCODES' });
      expect(rotated.status).toBe(401);
    }
    expect((await browser().post('/api/auth/verify-temporary-password', { email: other.email, code: 'OTHERCODES' })).status).toBe(429);
  });
});
