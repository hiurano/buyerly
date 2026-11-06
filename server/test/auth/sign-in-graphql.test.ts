import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { Browser } from '../support/browser.ts';
import { createInvite, createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, codeFrom, contractTarget, type Target } from '../support/target.ts';

// Signing in and the invite page over GraphQL (decision 55): public fields
// that run without a session, answering as their REST routes do, against
// either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const CHALLENGE = 'mutation C($input: JSON!) { emailUserAccountAuthChallenge(input: $input) }';
const CODE = 'mutation T($input: JSON!) { emailTokenUserAccountAuth(input: $input) }';
const LINK = 'mutation L($input: JSON!) { emailLinkUserAccountAuth(input: $input) }';

describe.skipIf(!DATABASE_URL)('signing in over GraphQL', () => {
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

  const newEmail = () => `${unique('person')}@example.test`;

  async function graphql(browser: Browser, query: string, variables?: Record<string, unknown>) {
    const answer = await browser.post('/api/graphql', { query, variables });
    expect(answer.status).toBe(200);
    return answer.json<GraphQLAnswer>();
  }

  it('signs in with the emailed code, without a session, and lists the account', async () => {
    const browser = new Browser(target);
    const email = newEmail();
    const challenge = await graphql(browser, CHALLENGE, { input: { email } });
    expect(challenge.errors).toBeUndefined();
    expect(challenge.data!.emailUserAccountAuthChallenge).toEqual({ ok: true, message: 'A temporary password has been sent to your email' });

    const { code } = codeFrom(await target.lastEmail(email));
    const signedIn = await graphql(browser, CODE, { input: { email, code } });
    expect(signedIn.errors).toBeUndefined();
    expect(signedIn.data!.emailTokenUserAccountAuth).toMatchObject({ username: email, message: 'Signed in successfully' });

    // The session cookie came back with the answer: the browser is signed in.
    expect((await browser.get('/api/me')).status).toBe(200);
    const accounts = await graphql(browser, '{ availableUsers }');
    expect(accounts.data!.availableUsers).toEqual((await browser.get('/api/auth/accounts')).json());
    expect((accounts.data!.availableUsers as { email: string }[]).map((item) => item.email)).toEqual([email]);
  });

  it('signs in with the emailed link once', async () => {
    const browser = new Browser(target);
    const email = newEmail();
    await graphql(browser, CHALLENGE, { input: { email } });
    const { linkToken } = codeFrom(await target.lastEmail(email));
    const first = await graphql(browser, LINK, { input: { token: linkToken } });
    expect(first.errors).toBeUndefined();
    const again = await graphql(new Browser(target), LINK, { input: { token: linkToken } });
    expect(again.errors?.[0]?.extensions?.statusCode).toBe(401);
    expect(again.errors?.[0]?.message).toBe('This sign-in link is invalid or has expired');
  });

  it('refuses a wrong code and bad input as the routes do', async () => {
    const browser = new Browser(target);
    const wrong = await graphql(browser, CODE, { input: { email: newEmail(), code: 'AAAAAAAAAA' } });
    expect(wrong.errors?.[0]?.extensions?.statusCode).toBe(401);
    expect(wrong.errors?.[0]?.message).toBe('Invalid or expired temporary password');
    const bad = await graphql(browser, CHALLENGE, { input: { email: 'no-at-sign' } });
    expect(bad.errors?.[0]?.extensions?.statusCode).toBe(400);
  });

  it('shows an invite signed out, as the route does', async () => {
    const inviter = await createUser(db);
    const workspace = await createWorkspace(db, inviter);
    const invite = await createInvite(db, { workspace, inviter, email: null });
    const browser = new Browser(target);
    const query = 'query D($token: String!) { workspaceInviteDetails(token: $token) }';
    for (const token of [invite.token, 'no-such-invite-token']) {
      const answer = await graphql(browser, query, { token });
      expect(answer.data!.workspaceInviteDetails).toEqual((await browser.get(`/api/invites/${token}`)).json());
    }
  });

  it('still refuses a signed-out request that asks for anything else too', async () => {
    const answer = await new Browser(target).post('/api/graphql', { query: '{ availableUsers viewer }' });
    expect(answer.status).toBe(401);
  });

  it('runs public fields only from a JSON body', async () => {
    const answer = await new Browser(target).request('POST', '/api/graphql', {
      body: Buffer.from('{"query":"{ availableUsers }"}'),
      headers: { 'content-type': 'text/plain' },
    });
    expect(answer.status).not.toBe(200);
  });
});
