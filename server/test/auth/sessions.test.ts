import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { UserEntity, WebSessionEntity, WorkspaceSupportGrantEntity } from '../../src/entities/index.ts';
import { secretHash } from '../../src/auth/sessions.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Browser sessions, several accounts in one browser, Security & access and
// the profile: tests/test_api.py (the session tests), over HTTP.

describe.skipIf(!DATABASE_URL)('browser sessions', () => {
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

  const sessionsOf = (userId: number) => db.getRepository(WebSessionEntity).findBy({ userId });
  const ageSession = (userId: number, changes: Partial<WebSessionEntity>) =>
    db.getRepository(WebSessionEntity).update({ userId }, changes);
  const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000);

  // A member with a workspace of their own.
  async function member(options: { role?: 'admin' | 'buyer' } = {}) {
    const user = await createUser(db, { role: options.role ?? 'buyer' });
    const workspace = await createWorkspace(db, user);
    return { user, workspace };
  }

  it('refuses a request without a session', async () => {
    const response = await new Browser(target).get('/api/me');
    expect(response.status).toBe(401);
    expect(response.json()).toEqual({ detail: 'Sign-in is required' });
  });

  it('keeps sessions hashed, CSRF-protected and revocable one by one', async () => {
    const { user, workspace } = await member();
    const client = new Browser(target, { 'user-agent': 'Buyerly test browser' });
    expect((await client.signIn(user.email!)).status).toBe(200);
    const rawToken = client.cookie('buyerly_session')!;
    expect(rawToken).toBeTruthy();
    expect(client.cookie('buyerly_csrf')).toBeTruthy();

    const login = await client.get('/api/me');
    expect(login.status).toBe(200);
    expect(login.json()).toMatchObject({
      id: user.id,
      username: user.username,
      email: user.email,
      email_verified: true,
      unconfirmed_email: null,
      role: 'buyer',
      is_approved: true,
      active_workspace: { id: workspace.id, slug: workspace.slug, role: 'owner', is_active: true, accounts_count: 1, members_count: 1 },
    });

    const csrfBlocked = await client.post('/api/auth/logout-all');
    expect(csrfBlocked.status).toBe(403);
    expect(csrfBlocked.json()).toEqual({ detail: 'CSRF check failed' });

    const sessions = (await client.get('/api/auth/sessions')).json<Record<string, unknown>[]>();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ current: true, user_agent: 'Buyerly test browser', location: '' });
    expect(Object.keys(sessions[0]).sort()).toEqual(
      ['created_at', 'current', 'expires_at', 'id', 'ip_address', 'last_seen_at', 'location', 'user_agent'],
    );

    const revoke = await client.delete(`/api/auth/sessions/${String(sessions[0].id)}`, client.csrf());
    expect(revoke.status).toBe(200);
    expect(revoke.json()).toEqual({ message: 'Session ended' });
    expect((await client.get('/api/me')).status).toBe(401);
    expect((await client.delete(`/api/auth/sessions/${String(sessions[0].id)}`, client.csrf())).status).toBe(401);

    const [stored] = await sessionsOf(user.id);
    expect(stored.tokenHash).toBe(secretHash(rawToken));
    expect(stored.revokedAt).not.toBeNull();
  });

  it('answers 404 for a session that is not the member’s', async () => {
    const { user } = await member();
    const { user: other } = await member();
    const client = new Browser(target);
    await client.signIn(user.email!);
    await new Browser(target).signIn(other.email!);
    const [foreign] = await sessionsOf(other.id);
    const response = await client.delete(`/api/auth/sessions/${foreign.id}`, client.csrf());
    expect(response.status).toBe(404);
    expect(response.json()).toEqual({ detail: 'Session not found' });
  });

  it('logs out every other session, then all', async () => {
    const { user } = await member();
    const laptop = new Browser(target, { 'user-agent': 'Laptop browser' });
    const phone = new Browser(target, { 'user-agent': 'Phone browser' });
    for (const client of [laptop, phone]) expect((await client.signIn(user.email!)).status).toBe(200);

    const sessions = (await laptop.get('/api/auth/sessions')).json<{ user_agent: string; current: boolean }[]>();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((item) => item.current).map((item) => item.user_agent)).toEqual(['Laptop browser']);

    const others = await laptop.post('/api/auth/logout-all?keep_current=true', undefined, laptop.csrf());
    expect(others.status).toBe(200);
    expect(others.json()).toEqual({ message: 'Other sessions ended' });
    expect(others.cookieHeader).not.toContain('buyerly_session=');
    expect((await laptop.get('/api/me')).status).toBe(200);
    expect((await phone.get('/api/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/sessions')).json<{ user_agent: string }[]>().map((item) => item.user_agent)).toEqual(['Laptop browser']);

    const all = await laptop.post('/api/auth/logout-all', undefined, laptop.csrf());
    expect(all.status).toBe(200);
    expect(all.json()).toEqual({ message: 'All sessions ended' });
    expect((await laptop.get('/api/me')).status).toBe(401);
  });

  it('keeps one session per account in a browser, each with its own CSRF and scope', async () => {
    const buyer = await member();
    const admin = await member({ role: 'admin' });
    const browser = new Browser(target);

    const first = await browser.signIn(buyer.user.email!);
    expect(first.status).toBe(200);
    const buyerId = first.json<{ account_id: number }>().account_id;
    const second = await browser.signIn(admin.user.email!);
    expect(second.status).toBe(200);
    const adminId = second.json<{ account_id: number }>().account_id;
    expect([buyerId, adminId]).toEqual([buyer.user.id, admin.user.id]);
    // The first account stays logged in next to the second.
    expect(browser.cookie('buyerly_session')).toBeTruthy();
    expect(browser.cookie('buyerly_session_1')).toBeTruthy();
    expect(browser.cookie('buyerly_csrf')).not.toBe(browser.cookie('buyerly_csrf_1'));

    const accounts = (await browser.get('/api/auth/accounts')).json<{ id: number; slot: number; workspaces: { slug: string }[] }[]>();
    expect(accounts.map((item) => [item.id, item.slot, item.workspaces.map((ws) => ws.slug)])).toEqual([
      [buyerId, 0, [buyer.workspace.slug]],
      [adminId, 1, [admin.workspace.slug]],
    ]);

    const asBuyer = { 'x-buyerly-account': String(buyerId) };
    const asAdmin = { 'x-buyerly-account': String(adminId) };
    expect((await browser.get('/api/me', asBuyer)).json().username).toBe(buyer.user.username);
    expect((await browser.get('/api/me', asAdmin)).json().username).toBe(admin.user.username);
    // Without the header the newest sign-in acts, as a single cookie used to.
    expect((await browser.get('/api/me')).json().username).toBe(admin.user.username);

    // Access stays per account: the buyer cannot read the admin's workspace.
    const denied = await browser.get('/api/auth/sessions', { ...asBuyer, 'x-workspace-slug': admin.workspace.slug });
    expect(denied.status).toBe(403);
    expect(denied.json()).toEqual({ detail: 'Workspace access denied' });
    const allowed = await browser.get('/api/auth/sessions', { ...asAdmin, 'x-workspace-slug': admin.workspace.slug });
    expect(allowed.status).toBe(200);
    expect(allowed.json<unknown[]>()).toHaveLength(1);
    expect((await browser.get('/api/auth/sessions', { ...asAdmin, 'x-workspace-slug': ' ' })).status).toBe(403);
    // The profile is not bound to the route's workspace.
    expect((await browser.get('/api/me', { ...asBuyer, 'x-workspace-slug': admin.workspace.slug })).status).toBe(200);

    // An account that is not logged in here never falls back to another one.
    for (const header of ['999999', 'abc', '-1']) {
      expect((await browser.get('/api/me', { 'x-buyerly-account': header })).status).toBe(401);
    }

    // CSRF belongs to the account: the admin's token cannot log out the buyer.
    expect((await browser.post('/api/auth/logout', {}, { ...asBuyer, ...browser.csrf(1) })).status).toBe(403);

    const logout = await browser.post('/api/auth/logout', {}, { ...asBuyer, ...browser.csrf(0) });
    expect(logout.status).toBe(200);
    expect(logout.json()).toEqual({ message: 'Signed out' });
    expect(logout.cookieHeader).toContain('buyerly_session=');
    expect(logout.cookieHeader).not.toContain('buyerly_session_1=');
    expect((await browser.get('/api/me', asBuyer)).status).toBe(401);
    expect((await browser.get('/api/me', asAdmin)).status).toBe(200);
    expect((await browser.get('/api/auth/accounts')).json<{ id: number }[]>().map((item) => item.id)).toEqual([adminId]);

    // Logging in again as an account already here replaces its own session.
    expect((await browser.signIn(admin.user.email!)).status).toBe(200);
    expect((await browser.get('/api/auth/accounts')).json<{ id: number }[]>().map((item) => item.id)).toEqual([adminId]);
    expect((await sessionsOf(adminId)).filter((item) => item.revokedAt === null)).toHaveLength(1);
  });

  it('holds at most five accounts in one browser', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser(db)));
    const browser = new Browser(target);
    const statuses: number[] = [];
    for (const user of users) statuses.push((await browser.signIn(user.email!)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 409]);
    expect((await browser.get('/api/auth/accounts')).json<unknown[]>()).toHaveLength(5);
  });

  it('ends only the named account’s sessions from Security & access', async () => {
    const buyer = await member();
    const admin = await member({ role: 'admin' });
    const browser = new Browser(target);
    const buyerId = (await browser.signIn(buyer.user.email!)).json<{ account_id: number }>().account_id;
    const adminId = (await browser.signIn(admin.user.email!)).json<{ account_id: number }>().account_id;
    const asBuyer = { 'x-buyerly-account': String(buyerId) };
    const asAdmin = { 'x-buyerly-account': String(adminId) };

    const buyerSessions = (await browser.get('/api/auth/sessions', asBuyer)).json<{ id: string; current: boolean }[]>();
    expect(buyerSessions).toHaveLength(1);
    expect(buyerSessions[0].current).toBe(true);

    const revoke = await browser.delete(`/api/auth/sessions/${buyerSessions[0].id}`, { ...asBuyer, ...browser.csrf(0) });
    expect(revoke.status).toBe(200);
    expect(revoke.cookieHeader).toContain('buyerly_session=');
    expect(revoke.cookieHeader).not.toContain('buyerly_session_1=');
    expect((await browser.get('/api/me', asBuyer)).status).toBe(401);
    expect((await browser.get('/api/me', asAdmin)).status).toBe(200);

    const all = await browser.post('/api/auth/logout-all', undefined, { ...asAdmin, ...browser.csrf(1) });
    expect(all.status).toBe(200);
    expect(all.cookieHeader).toContain('buyerly_session_1=');
    expect((await browser.get('/api/me', asAdmin)).status).toBe(401);
    expect((await browser.get('/api/auth/accounts')).json()).toEqual([]);
  });

  it('lists no accounts for a browser that is not signed in, and drops ended ones', async () => {
    const empty = await new Browser(target).get('/api/auth/accounts');
    expect(empty.status).toBe(200);
    expect(empty.json()).toEqual([]);

    const stale = new Browser(target);
    stale.cookies.set('buyerly_session_2', 'no-such-session-token');
    const dropped = await stale.get('/api/auth/accounts');
    expect(dropped.json()).toEqual([]);
    expect(dropped.cookieHeader).toContain('buyerly_session_2=');
    expect(stale.cookie('buyerly_session_2')).toBeUndefined();
  });

  it('records the browser address behind a trusted proxy', async () => {
    const { user } = await member();
    const client = new Browser(target, { 'x-forwarded-for': '203.0.113.10' });
    expect((await client.signIn(user.email!)).status).toBe(200);
    const [session] = (await client.get('/api/auth/sessions')).json<{ ip_address: string; location: string }[]>();
    expect(session).toMatchObject({ ip_address: '203.0.113.10', location: '' });
  });

  it('records the place Cloudflare reports, and follows the browser', async () => {
    const { user } = await member();
    // Browser -> Cloudflare edge (162.158.1.2) -> our proxy (127.0.0.1) -> server.
    const helsinki = {
      'x-forwarded-for': '203.0.113.10, 162.158.1.2',
      'cf-connecting-ip': '203.0.113.10',
      'cf-ipcity': 'Helsinki',
      'cf-region-code': '18',
      'cf-ipcountry': 'FI',
    };
    const client = new Browser(target, helsinki);
    expect((await client.signIn(user.email!)).status).toBe(200);
    const [first] = (await client.get('/api/auth/sessions')).json<{ ip_address: string; location: string }[]>();
    expect(first).toMatchObject({ ip_address: '203.0.113.10', location: 'Helsinki, 18, FI' });

    // Seen again later from Riga: the place follows the browser.
    await ageSession(user.id, { lastSeenAt: tenMinutesAgo() });
    const riga = {
      'x-forwarded-for': '198.51.100.7, 172.64.0.9',
      'cf-connecting-ip': '198.51.100.7',
      'cf-ipcity': 'Riga',
      'cf-region-code': 'RIX',
      'cf-ipcountry': 'LV',
    };
    expect((await client.get('/api/me', riga)).status).toBe(200);
    let [stored] = await sessionsOf(user.id);
    expect([stored.ipAddress, stored.location]).toEqual(['198.51.100.7', 'Riga, RIX, LV']);

    // Then directly, with made-up Cloudflare headers: neither is believed,
    // and the old place does not stick to the new address.
    await ageSession(user.id, { lastSeenAt: tenMinutesAgo() });
    const forged = { 'x-forwarded-for': '192.0.2.44', 'cf-connecting-ip': '203.0.113.99', 'cf-ipcity': 'Nowhere', 'cf-ipcountry': 'AQ' };
    expect((await client.get('/api/me', forged)).status).toBe(200);
    [stored] = await sessionsOf(user.id);
    expect([stored.ipAddress, stored.location]).toEqual(['192.0.2.44', '']);
  });

  it('keeps a session in use signed in with the same token', async () => {
    const { user } = await member();
    const client = new Browser(target);
    expect((await client.signIn(user.email!)).status).toBe(200);
    const token = client.cookie('buyerly_session');
    const csrf = client.cookie('buyerly_csrf');

    // Signed in long ago and last used yesterday.
    const longAgo = new Date(Date.now() - 30 * 86_400_000);
    await ageSession(user.id, {
      createdAt: longAgo,
      rotatedAt: longAgo,
      lastSeenAt: new Date(Date.now() - 86_400_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    // A reload after a deploy sends many requests at once with the same cookie.
    const burst = await Promise.all(Array.from({ length: 8 }, () => client.get('/api/me')));
    expect(burst.map((response) => response.status)).toEqual(Array(8).fill(200));
    expect(client.cookie('buyerly_session')).toBe(token);
    expect(client.cookie('buyerly_csrf')).toBe(csrf);
    const renewed = burst.filter((response) => response.cookieHeader.includes('buyerly_session='));
    expect(renewed.length).toBeGreaterThan(0);
    expect(renewed[0].cookieHeader).toContain('buyerly_csrf=');
    expect(renewed[0].cookieHeader).toMatch(/buyerly_session=[^;]+;.*Max-Age=77\d{5}/i);

    const [stored] = await sessionsOf(user.id);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);
    expect((await client.post('/api/auth/logout-all', undefined, { 'x-csrf-token': csrf! })).status).toBe(200);
  });

  it('turns a legacy bearer token into a session on first use', async () => {
    const { user } = await member();
    const legacy = unique('legacy-token');
    await db.getRepository(UserEntity).update({ id: user.id }, { authToken: legacy });
    const client = new Browser(target, { authorization: `Bearer ${legacy}` });
    const me = await client.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.json().id).toBe(user.id);
    // The session cookie now carries the old token, with a fresh CSRF token.
    expect(client.cookie('buyerly_session')).toBe(legacy);
    expect(client.cookie('buyerly_csrf')).toBeTruthy();
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).authToken).toBeNull();
    const [session] = await sessionsOf(user.id);
    expect(session.userAgent).toBe('Buyerly contract test');

    // As a cookie it now needs the CSRF token like any other session.
    const cookieOnly = new Browser(target);
    cookieOnly.cookies.set('buyerly_session', legacy);
    expect((await cookieOnly.post('/api/auth/logout', {})).status).toBe(403);
  });

  it('lists support-grant workspaces for platform admins', async () => {
    const admin = await member({ role: 'admin' });
    const { workspace: supported } = await member();
    await db.getRepository(WorkspaceSupportGrantEntity).save(
      db.getRepository(WorkspaceSupportGrantEntity).create({
        workspaceId: supported.id,
        userId: admin.user.id,
        role: 'admin',
        reason: 'contract test',
        expiresAt: new Date(Date.now() + 3_600_000),
        createdAt: new Date(),
        revokedAt: null,
      }),
    );
    const client = new Browser(target);
    await client.signIn(admin.user.email!);
    const me = (await client.get('/api/me')).json<{ workspaces: { slug: string; role: string; is_active: boolean }[] }>();
    expect(me.workspaces.map((item) => [item.slug, item.role, item.is_active])).toEqual([
      [admin.workspace.slug, 'owner', true],
      [supported.slug, 'admin', false],
    ]);
    expect((await client.get('/api/auth/sessions', { 'x-workspace-slug': supported.slug })).status).toBe(200);
  });

  it('makes a member’s first workspace active when none is', async () => {
    const { user, workspace } = await member();
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: null });
    const client = new Browser(target);
    await client.signIn(user.email!);
    expect((await client.get('/api/me')).json().active_workspace).toMatchObject({ id: workspace.id, is_active: true });
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).activeWorkspaceId).toBe(workspace.id);
  });

  it('answers a profile with no workspace yet', async () => {
    const user = await createUser(db);
    const client = new Browser(target);
    await client.signIn(user.email!);
    expect((await client.get('/api/me')).json()).toEqual({
      id: user.id,
      username: user.username,
      full_name: user.username,
      first_name: '',
      last_name: '',
      title: '',
      email: user.email,
      email_verified: true,
      unconfirmed_email: null,
      avatar_url: '',
      role: 'buyer',
      is_approved: true,
      onboarding_step: 'personal_details',
      onboarding_completed: false,
      active_workspace: null,
      workspaces: [],
    });
  });
});
