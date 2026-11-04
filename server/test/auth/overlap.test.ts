import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { WebSessionEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, codeFrom, pythonTarget, typescriptTarget, type InProcessTarget, type Target } from '../support/target.ts';

// While both servers run (#611), the Python API keeps reading web_sessions
// and email_verification_codes for the areas it still owns, and a rollback
// moves sign-in back to it. So a session or a code from one server must work
// on the other. Runs when a Python API is up (PYTHON_API_URL), as in CI.

const PYTHON = Boolean(process.env.PYTHON_API_URL);

describe.skipIf(!DATABASE_URL || !PYTHON)('sessions shared with the Python API', () => {
  let typescript: InProcessTarget;
  let python: Target;
  let db: DataSource;

  beforeAll(async () => {
    typescript = await typescriptTarget();
    python = pythonTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await typescript?.close();
    await db?.destroy();
  });

  // The same browser (its cookies and address) talking to the other server.
  function on(target: Target, browser: Browser): Browser {
    const moved = new Browser(target, { 'x-forwarded-for': browser.address });
    for (const [name, value] of browser.cookies) moved.cookies.set(name, value);
    return moved;
  }

  async function member() {
    const user = await createUser(db);
    await createWorkspace(db, user);
    return user;
  }

  for (const [from, to] of [['typescript', 'python'], ['python', 'typescript']] as const) {
    it(`accepts a ${from} session on ${to}, and ends it there`, async () => {
      const servers = { typescript, python };
      const user = await member();
      const first = new Browser(servers[from]);
      expect((await first.signIn(user.email!)).status).toBe(200);
      const second = on(servers[to], first);

      // Both answer the same profile and session list for it.
      const [mine, theirs] = [await first.get('/api/me'), await second.get('/api/me')];
      expect(theirs.status).toBe(200);
      expect(theirs.json()).toEqual(mine.json());
      const sessions = (await second.get('/api/auth/sessions')).json<{ id: string; current: boolean }[]>();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].current).toBe(true);
      if (from === 'typescript') {
        // Its times have whole milliseconds, which both print alike.
        expect(sessions).toEqual((await first.get('/api/auth/sessions')).json());
      }
      expect((await second.get('/api/auth/accounts')).json()).toEqual((await first.get('/api/auth/accounts')).json());

      // The CSRF token one server set is the one the other checks.
      expect((await second.post('/api/auth/logout-all', undefined, { 'x-csrf-token': 'wrong' })).status).toBe(403);
      expect((await second.post('/api/auth/logout', {}, second.csrf())).status).toBe(200);
      expect((await first.get('/api/me')).status).toBe(401);
    });

    it(`keeps a session ${from} extended valid on ${to}, with the same tokens`, async () => {
      const servers = { typescript, python };
      const user = await member();
      const browser = new Browser(servers[to]);
      expect((await browser.signIn(user.email!)).status).toBe(200);
      const token = browser.cookie('buyerly_session');
      const csrf = browser.cookie('buyerly_csrf');
      await db.getRepository(WebSessionEntity).update({ userId: user.id }, { lastSeenAt: new Date(Date.now() - 600_000) });

      const extender = on(servers[from], browser);
      const extended = await extender.get('/api/me');
      expect(extended.status).toBe(200);
      expect(extended.cookieHeader).toContain('buyerly_session=');
      expect(extender.cookie('buyerly_session')).toBe(token);
      expect(extender.cookie('buyerly_csrf')).toBe(csrf);
      const [stored] = await db.getRepository(WebSessionEntity).findBy({ userId: user.id });
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);

      const back = on(servers[to], extender);
      expect((await back.post('/api/auth/logout-all', undefined, back.csrf())).status).toBe(200);
    });

    it(`verifies a code ${from} sent on ${to}`, async () => {
      const servers = { typescript, python };
      const user = await member();
      const asker = new Browser(servers[from]);
      expect((await asker.post('/api/auth/request-temporary-password', { email: user.email })).status).toBe(200);
      const { code, linkToken } = codeFrom(await servers[from].lastEmail(user.email!));
      const verifier = on(servers[to], asker);
      // A second request on the other server is refused for a minute too.
      expect((await verifier.post('/api/auth/request-temporary-password', { email: user.email })).status).toBe(429);
      const signedIn = await verifier.post('/api/auth/verify-temporary-password', { email: user.email, code });
      expect(signedIn.status).toBe(200);
      expect(signedIn.json().account_id).toBe(user.id);
      expect((await on(servers[from], verifier).post('/api/auth/verify-email-link', { token: linkToken })).status).toBe(401);
    });
  }

  it('fills the next free slot whichever server signs the next account in', async () => {
    const [buyer, other] = [await member(), await member()];
    const browser = new Browser(typescript);
    expect((await browser.signIn(buyer.email!)).status).toBe(200);
    const onPython = on(python, browser);
    expect((await onPython.signIn(other.email!)).status).toBe(200);
    expect(onPython.cookie('buyerly_session_1')).toBeTruthy();
    const back = on(typescript, onPython);
    const accounts = (await back.get('/api/auth/accounts')).json<{ id: number; slot: number }[]>();
    expect(accounts.map((item) => [item.id, item.slot])).toEqual([[buyer.id, 0], [other.id, 1]]);
    expect(accounts).toEqual((await onPython.get('/api/auth/accounts')).json());
  });
});
