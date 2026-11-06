import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountEntity, UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { EMAIL, refusal, seed } from '../../src/scripts/dev-seed.ts';
import { WORLD } from '../../src/scripts/fake-meta.ts';
import { MetaTokenKeyring } from '../../src/meta/tokens.ts';
import { testDatabase } from '../support/db.ts';
import { DATABASE_URL } from '../support/target.ts';

// The local stack's dev user (scripts/dev_seed.py before the port, tests
// test_dev_sign_in.py and test_fake_meta.py's guard): one user who signs in
// by email, one workspace they own, the fake Meta's ad accounts connected.

const KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
const FAKE = { metaGraphBaseUrl: 'http://fake-meta:8090', metaTokenEncryptionKey: KEY, log: () => undefined };

describe('the dev seed guard', () => {
  it('refuses to run without the local flag', () => {
    expect(refusal({ BUYERLY_DEV_SEED: '' })).toContain('refusing to run without BUYERLY_DEV_SEED=1');
    expect(refusal({})).not.toBeNull();
    expect(refusal({ BUYERLY_DEV_SEED: '1' })).toBeNull();
  });
});

describe.skipIf(!DATABASE_URL)('the dev seed on the database', { timeout: 60_000 }, () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await testDatabase();
  });
  afterAll(async () => {
    await db.destroy();
  });

  it('gives the local stack one dev user who signs in by email, and is safe to repeat', async () => {
    await seed(db, FAKE);
    await seed(db, FAKE);

    const users = await db.getRepository(UserEntity).findBy({ username: 'dev' });
    expect(users.map((u) => [u.username, u.email, u.role, u.isApproved, u.onboardingCompleted])).toEqual([['dev', EMAIL, 'admin', true, true]]);
    expect(users[0].emailVerifiedAt).not.toBeNull();
    const workspaces = await db.getRepository(WorkspaceEntity).findBy({ slug: 'dev' });
    expect(workspaces).toHaveLength(1);
    const members = await db.getRepository(WorkspaceMemberEntity).findBy({ workspaceId: workspaces[0].id });
    expect(members.map((m) => [m.userId, m.role])).toEqual([[users[0].id, 'owner']]);
    expect(users[0].activeWorkspaceId).toBe(workspaces[0].id);
  });

  it('connects the fake Meta ad accounts once, with a token the server can read', async () => {
    await seed(db, FAKE);
    const accounts = await db.getRepository(AccountEntity).find({ where: [...WORLD.accounts.keys()].map((accountId) => ({ accountId })) });
    expect(accounts.map((a) => a.accountId).sort()).toEqual([...WORLD.accounts.keys()].sort());
    expect(accounts.every((a) => a.workspaceId !== null && !a.rulesEnabled && a.isActive)).toBe(true);
    expect(new MetaTokenKeyring(KEY).decrypt(accounts[0].accessTokenEncrypted!)).toBe('fake-meta-token');
  });

  it('adds no accounts when Meta is the real one', async () => {
    await expect(seed(db, { ...FAKE, metaGraphBaseUrl: 'https://graph.facebook.com/' })).resolves.toBeUndefined();
  });

  it('gives an old local dev user without an email one', async () => {
    await db.getRepository(UserEntity).update({ username: 'dev' }, { email: null, emailVerifiedAt: null });
    await seed(db, FAKE);
    const user = await db.getRepository(UserEntity).findOneByOrFail({ username: 'dev' });
    expect(user.email).toBe(EMAIL);
    expect(user.emailVerifiedAt).not.toBeNull();
  });
});
