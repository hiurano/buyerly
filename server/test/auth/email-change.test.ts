import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { EmailVerificationCodeEntity, UserEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, codeFrom, contractTarget, type Target } from '../support/target.ts';

// Changing the email by code: tests/test_api.py (the email change tests), over HTTP.

describe.skipIf(!DATABASE_URL)('email change', () => {
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

  async function signedIn(): Promise<{ user: UserEntity; client: Browser }> {
    const user = await createUser(db);
    const client = new Browser(target);
    expect((await client.signIn(user.email!)).status).toBe(200);
    return { user, client };
  }

  const reload = (id: number) => db.getRepository(UserEntity).findOneByOrFail({ id });

  it('confirms the new address before it becomes the member’s', async () => {
    const { user, client } = await signedIn();
    const next = `${unique('new')}@example.test`;

    const requested = await client.post('/api/auth/request-email-change', { new_email: `  ${next.toUpperCase()} ` }, client.csrf());
    expect(requested.status).toBe(200);
    expect(requested.json()).toEqual({ ok: true, message: 'A confirmation code has been sent to the new email', unconfirmed_email: next });

    let stored = await reload(user.id);
    expect(stored.unconfirmedEmail).toBe(next);
    expect(stored.email).toBe(user.email);
    const [otp] = await db.getRepository(EmailVerificationCodeEntity).findBy({ email: next });
    expect(otp.code).toBe('');
    expect(otp.codeHash).toHaveLength(64);
    expect(otp.purpose).toBe('email_change');
    const message = await target.lastEmail(next);
    expect(message.subject).toMatch(/^Your Buyerly verification code is [A-Z]{10}$/);
    const { code } = codeFrom(message);

    const wrong = await client.post('/api/auth/verify-email-change', { code: 'ZZZZZZZZZZ' }, client.csrf());
    expect(wrong.status).toBe(400);
    expect(wrong.json()).toEqual({ detail: 'Invalid confirmation code' });

    const confirmed = await client.post('/api/auth/verify-email-change', { code }, client.csrf());
    expect(confirmed.status).toBe(200);
    expect(confirmed.json()).toEqual({ ok: true, message: 'Email confirmed and linked to your account', email: next, email_verified: true });

    stored = await reload(user.id);
    expect(stored.email).toBe(next);
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.unconfirmedEmail).toBeNull();
    expect((await client.get('/api/me')).json()).toMatchObject({ email: next, email_verified: true, unconfirmed_email: null });
  });

  it('says so when the address is already confirmed', async () => {
    const { user, client } = await signedIn();
    const response = await client.post('/api/auth/request-email-change', { new_email: user.email }, client.csrf());
    expect(response.json()).toEqual({ ok: true, message: 'This email is already confirmed for your account', already_verified: true });
  });

  it('refuses an address another member confirmed, in any case and spacing', async () => {
    const taken = await createUser(db);
    const { client } = await signedIn();
    const response = await client.post('/api/auth/request-email-change', { new_email: `  ${taken.email!.toUpperCase()}  ` }, client.csrf());
    expect(response.status).toBe(409);
    expect(response.json()).toEqual({ detail: 'This email address is already in use by another user' });
  });

  it('takes the address from a member who never confirmed it', async () => {
    const holder = await createUser(db, { verified: false });
    const { user, client } = await signedIn();
    expect((await client.post('/api/auth/request-email-change', { new_email: holder.email }, client.csrf())).status).toBe(200);
    const { code } = codeFrom(await target.lastEmail(holder.email!));
    expect((await client.post('/api/auth/verify-email-change', { code }, client.csrf())).status).toBe(200);
    expect((await reload(holder.id)).email).toBeNull();
    expect((await reload(user.id)).email).toBe(holder.email);
  });

  it('refuses a confirmation the address was confirmed by someone else meanwhile', async () => {
    const { user, client } = await signedIn();
    const next = `${unique('race')}@example.test`;
    expect((await client.post('/api/auth/request-email-change', { new_email: next }, client.csrf())).status).toBe(200);
    const { code } = codeFrom(await target.lastEmail(next));
    await createUser(db, { email: next });
    const response = await client.post('/api/auth/verify-email-change', { code }, client.csrf());
    expect(response.status).toBe(409);
    expect(response.json()).toEqual({ detail: 'This email has already been confirmed by another user' });
    expect((await reload(user.id)).email).toBe(user.email);
  });

  it('needs a session and the CSRF token', async () => {
    expect((await new Browser(target).post('/api/auth/request-email-change', { new_email: 'a@b.c' })).status).toBe(401);
    const { client } = await signedIn();
    const response = await client.post('/api/auth/verify-email-change', { code: 'ABC' });
    expect(response.status).toBe(403);
    expect(response.json()).toEqual({ detail: 'CSRF check failed' });
  });
});
