import type { WorkspaceItem } from '@buyerly/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { UserEntity } from '../../src/entities/index.ts';
import { Browser, type Response } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase, unique } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// POST /api/graphql (tests/test_client_api.py): the fields this server
// serves answer as the Python ones do, and the rest still answer, from Python.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; path?: string[]; extensions?: Record<string, unknown> }[];
}

describe.skipIf(!DATABASE_URL)('client API', () => {
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

  async function signedIn(): Promise<{ browser: Browser; user: UserEntity }> {
    const user = await createUser(db, { fullName: 'Gina Graph' });
    const workspace = await createWorkspace(db, user);
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    const answer = await browser.signIn(user.email!);
    expect(answer.status).toBe(200);
    return { browser, user };
  }

  function graphql(browser: Browser, query: string, variables?: Record<string, unknown>): Promise<Response> {
    return browser.post('/api/graphql', { query, variables }, browser.csrf());
  }

  const UPDATE = 'mutation($input: JSON!) { userUpdate(input: $input) { success lastSyncId user } }';

  it('refuses a signed-out request before GraphQL runs', async () => {
    const answer = await new Browser(target).post('/api/graphql', { query: '{ workspaces }' });
    expect(answer.status).toBe(401);
    expect(answer.body).toEqual({ detail: 'Sign-in is required' });
  });

  it('refuses a POST without the CSRF token', async () => {
    const { browser } = await signedIn();
    const answer = await browser.post('/api/graphql', { query: '{ workspaces }' });
    expect(answer.status).toBe(403);
  });

  it('lists the workspaces the user belongs to', async () => {
    const { browser } = await signedIn();
    const answer = await graphql(browser, '{ workspaces }');
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toBe('application/json');
    const { data } = answer.body as GraphQLAnswer;
    const workspaces = data!.workspaces as WorkspaceItem[];
    expect(workspaces).toHaveLength(1);
    expect(Object.keys(workspaces[0]).sort()).toEqual(
      ['accounts_count', 'badge_color', 'badge_text', 'id', 'is_active', 'logo_url', 'members_count', 'name', 'role', 'slug'],
    );
    expect(workspaces[0]).toMatchObject({ role: 'owner', is_active: true, members_count: 1 });
  });

  it('updates the profile and returns the sync id to wait for', async () => {
    const { browser, user } = await signedIn();
    const username = unique('renamed');
    const answer = await graphql(browser, UPDATE, { input: { full_name: '  Gina Renamed ', title: 'Buyer', username } });
    expect(answer.status).toBe(200);
    const payload = (answer.body as GraphQLAnswer).data!.userUpdate as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(typeof payload.lastSyncId).toBe('number');
    expect(payload.user).toEqual({
      message: 'Profile updated',
      username,
      full_name: 'Gina Renamed',
      first_name: '',
      last_name: '',
      title: 'Buyer',
      email: user.email,
      avatar_url: '',
    });
    const saved = await db.getRepository(UserEntity).findOneByOrFail({ id: user.id });
    expect([saved.fullName, saved.username]).toEqual(['Gina Renamed', username]);
  });

  it("answers a route's refusal as a GraphQL error with its status code", async () => {
    const { browser } = await signedIn();
    const answer = await graphql(browser, UPDATE, { input: { full_name: '   ' } });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      data: { userUpdate: null },
      errors: [{
        message: 'Your full name cannot be empty.',
        locations: [{ line: 1, column: 27 }],
        path: ['userUpdate'],
        extensions: { type: 'invalid input', statusCode: 400, userPresentableMessage: 'Your full name cannot be empty.' },
      }],
    });
  });

  it('refuses a username someone else has', async () => {
    const { browser } = await signedIn();
    const other = await createUser(db);
    const answer = await graphql(browser, UPDATE, { input: { username: other.username.toUpperCase() } });
    expect((answer.body as GraphQLAnswer).errors?.[0].message).toBe('This username is already taken.');
  });

  it("checks the input as the route's body model, with pydantic's words", async () => {
    const { browser } = await signedIn();
    const extra = await graphql(browser, UPDATE, { input: { nickname: 'x' } });
    expect((extra.body as GraphQLAnswer).errors?.[0]).toMatchObject({
      message: 'Extra inputs are not permitted',
      extensions: { statusCode: 422, type: 'invalid input' },
    });
    const long = await graphql(browser, UPDATE, { input: { title: 'x'.repeat(129) } });
    expect((long.body as GraphQLAnswer).errors?.[0].message).toBe('String should have at most 128 characters');
    const avatar = await graphql(browser, UPDATE, { input: { avatar_url: 'ftp://example.test/a.png' } });
    expect((avatar.body as GraphQLAnswer).errors?.[0].message).toBe('avatar_url must start with https://, http:// or /uploads/avatars/');
  });

  it('keeps the limit on aliases', async () => {
    const { browser } = await signedIn();
    const aliases = Array.from({ length: 11 }, (_, index) => `w${index}: workspaces`).join(' ');
    const answer = await graphql(browser, `{ ${aliases} }`);
    expect((answer.body as GraphQLAnswer).errors?.[0].message).toBe('11 aliases found. Allowed: 10');
  });

  it.skipIf(!process.env.PYTHON_API_URL)('answers the fields not moved yet as well', async () => {
    const { browser } = await signedIn();
    const answer = await graphql(browser, '{ inboxUnreadCount workspaces }');
    expect(answer.status).toBe(200);
    const { data, errors } = answer.body as GraphQLAnswer;
    expect(errors).toBeUndefined();
    expect(data!.inboxUnreadCount).toMatchObject({ unread_count: 0 });
    expect(data!.workspaces).toHaveLength(1);
  });
});
