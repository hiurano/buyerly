import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AccountEntity, UserEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// The workspace of the address (tests/test_workspace_isolation_security.py,
// test_route_workspace_scopes_reads_and_writes_without_switching_user): the
// X-Workspace-Slug header scopes a request to one workspace of the member's
// without moving their active workspace, so two tabs can work in two.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const UPDATE = 'mutation($id: String!, $input: JSON!) { accountUpdate(accountId: $id, input: $input) { success account } }';

describe.skipIf(!DATABASE_URL)('the workspace of the address', () => {
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

  it('scopes writes to the workspace named, keeps the active one, and refuses a stranger’s', async () => {
    const user = await createUser(db);
    const home = await createWorkspace(db, user);
    const owner = await createUser(db);
    const other = await createWorkspace(db, owner);
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: other.id, userId: user.id, role: 'admin', joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: home.id });
    const homeAccount = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: home.id });
    const otherAccount = await db.getRepository(AccountEntity).findOneByOrFail({ workspaceId: other.id });

    const tab = async (slug: string): Promise<Browser> => {
      const browser = new Browser(target, { 'x-workspace-slug': slug });
      expect((await browser.signIn(user.email!)).status).toBe(200);
      return browser;
    };
    const call = async (browser: Browser, id: string, name: string): Promise<GraphQLAnswer> => {
      const answer = await browser.post('/api/graphql', { query: UPDATE, variables: { id, input: { custom_name: name } } }, browser.csrf());
      expect(answer.status).toBe(200);
      return answer.body as GraphQLAnswer;
    };

    const second = await tab(other.slug);
    expect((await call(second, otherAccount.accountId, 'Route B')).errors).toBeUndefined();
    // A second tab explicitly remains in the first workspace: the other's account is not there.
    const first = await tab(home.slug);
    expect((await call(first, otherAccount.accountId, 'Nope')).errors?.[0].extensions?.statusCode).toBe(404);
    expect((await call(first, homeAccount.accountId, 'Home')).errors).toBeUndefined();

    expect((await db.getRepository(AccountEntity).findOneByOrFail({ id: otherAccount.id })).customName).toBe('Route B');
    expect((await db.getRepository(AccountEntity).findOneByOrFail({ id: homeAccount.id })).customName).toBe('Home');
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).activeWorkspaceId).toBe(home.id);

    // A workspace the member is not in, one that does not exist, an empty address: refused, with no fallback.
    for (const slug of [`missing-${other.slug}`, ' ']) {
      const answer = await first.get('/api/auth/sessions', { 'x-workspace-slug': slug });
      expect(answer.status, slug).toBe(403);
    }
    // The profile is not bound to the address.
    expect((await first.get('/api/me', { 'x-workspace-slug': `missing-${other.slug}` })).status).toBe(200);
  });
});
