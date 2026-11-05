import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The signed-in account over GraphQL (decision 55): each field answers as
// its REST route does, cookies included, against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

describe.skipIf(!DATABASE_URL)('the signed-in account over GraphQL', () => {
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

  async function signedIn(email: string, agent = 'Buyerly test browser'): Promise<Browser> {
    const browser = new Browser(target, { 'user-agent': agent });
    expect((await browser.signIn(email)).status).toBe(200);
    return browser;
  }

  async function member() {
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    return { user, workspace, browser: await signedIn(user.email!) };
  }

  async function graphql(browser: Browser, query: string, variables?: Record<string, unknown>) {
    const answer = await browser.post('/api/graphql', { query, variables }, browser.csrf());
    expect(answer.status).toBe(200);
    return { body: answer.json() as GraphQLAnswer, setCookie: answer.cookieHeader };
  }

  function refusal(body: GraphQLAnswer): [number | undefined, string | undefined] {
    return [body.errors?.[0]?.extensions?.statusCode, body.errors?.[0]?.message];
  }

  it('reads the profile and the sessions as the REST routes do', async () => {
    const { browser } = await member();
    const { body } = await graphql(browser, '{ viewer }');
    expect(body.data!.viewer).toEqual((await browser.get('/api/me')).json());
    const sessions = await graphql(browser, '{ authenticationSessions }');
    expect(sessions.body.data!.authenticationSessions).toEqual((await browser.get('/api/auth/sessions')).json());
  });

  it('ends one session, the others, or all of them', async () => {
    const { user, browser: laptop } = await member();
    const phone = await signedIn(user.email!, 'Phone');
    const tablet = await signedIn(user.email!, 'Tablet');

    expect(refusal((await graphql(laptop, 'mutation { logoutSession(sessionId: "no-such-session") { success } }')).body))
      .toEqual([404, 'Session not found']);
    const sessions = (await laptop.get('/api/auth/sessions')).json() as { id: string; user_agent: string }[];
    const tabletId = sessions.find((item) => item.user_agent === 'Tablet')!.id;
    const ended = await graphql(laptop, 'mutation($id: String!) { logoutSession(sessionId: $id) { success lastSyncId } }', { id: tabletId });
    expect((ended.body.data!.logoutSession as { success: boolean }).success).toBe(true);
    // Another browser's session: this one keeps its cookies.
    expect(ended.setCookie).not.toContain('buyerly_session=;');
    expect((await tablet.get('/api/me')).status).toBe(401);

    const others = await graphql(laptop, 'mutation { logoutAllSessions(keepCurrent: true) { success } }');
    expect(others.body.data!.logoutAllSessions).toEqual({ success: true });
    expect((await phone.get('/api/me')).status).toBe(401);
    expect((await laptop.get('/api/me')).status).toBe(200);

    const all = await graphql(laptop, 'mutation { logoutAllSessions { success } }');
    expect(all.body.data!.logoutAllSessions).toEqual({ success: true });
    expect(all.setCookie).toContain('buyerly_session=');
    expect((await laptop.get('/api/me')).status).toBe(401);
  });

  it('logs this account out and clears its cookies', async () => {
    const { browser } = await member();
    const { body, setCookie } = await graphql(browser, 'mutation { logout { success } }');
    expect(body.data!.logout).toEqual({ success: true });
    expect(setCookie).toContain('buyerly_session=');
    expect((await browser.get('/api/me')).status).toBe(401);
  });

  it('changes the email as the REST routes do', async () => {
    const { browser } = await member();
    const request = 'mutation($input: JSON!) { userEmailChangeRequest(input: $input) { success emailChange } }';
    const verify = 'mutation($input: JSON!) { userEmailChangeVerify(input: $input) { success emailChange } }';
    expect(refusal((await graphql(browser, request, { input: { new_email: 'no-at-sign' } })).body))
      .toEqual([400, 'Invalid email address']);
    expect(refusal((await graphql(browser, request, { input: {} })).body)[0]).toBe(422);
    const sent = await graphql(browser, request, { input: { new_email: `New-${Date.now()}@Example.test` } });
    expect(sent.body.data!.userEmailChangeRequest).toMatchObject({
      success: true,
      emailChange: { ok: true, message: 'A confirmation code has been sent to the new email' },
    });
    expect(refusal((await graphql(browser, verify, { input: { code: '000000' } })).body))
      .toEqual([400, 'Invalid confirmation code']);
  });
});
