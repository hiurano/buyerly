import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { UserEntity, WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createInvite, createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// GET /api/invites/{token}, the invite page before sign-in:
// tests/test_workspaces.py (the public invite checks), over HTTP.

const REFUSED = {
  valid: false,
  workspace_name: null,
  workspace_slug: null,
  workspace_id: null,
  workspace_logo_url: null,
  inviter_name: null,
  role: null,
  target_email: null,
  expires_at: null,
};

describe.skipIf(!DATABASE_URL)('public invite info', () => {
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

  it('describes a pending invite to anyone with the link', async () => {
    const owner = await createUser(db, { fullName: 'Артем' });
    const workspace = await createWorkspace(db, owner);
    const expiresAt = new Date('2099-03-04T05:06:07.123Z');
    const invite = await createInvite(db, { workspace, inviter: owner, email: 'dave@example.test', expiresAt });

    const response = await new Browser(target).get(`/api/invites/${invite.token}`);
    expect(response.status).toBe(200);
    expect(response.json()).toEqual({
      valid: true,
      status: 'pending',
      workspace_name: workspace.name,
      workspace_slug: workspace.slug,
      workspace_id: workspace.id,
      workspace_logo_url: '',
      inviter_name: 'Артем',
      role: 'buyer',
      target_email: 'dave@example.test',
      expires_at: '2099-03-04T05:06:07.123000Z',
      message: 'Invite is valid',
    });
  });

  it('names the inviter by username without a full name, and the team without an inviter', async () => {
    const owner = await createUser(db);
    const workspace = await createWorkspace(db, owner);
    await db.getRepository(WorkspaceEntity).update({ id: workspace.id }, { logoUrl: '/uploads/workspace-logos/x.png' });
    await db.getRepository(UserEntity).update({ id: owner.id }, { fullName: '' });
    const open = await createInvite(db, { workspace, inviter: owner, email: null, maxUses: 0, usedCount: 12, expiresAt: null });
    const client = new Browser(target);

    const byUsername = (await client.get(`/api/invites/${open.token}`)).json();
    expect(byUsername).toMatchObject({
      valid: true,
      inviter_name: owner.username,
      target_email: null,
      expires_at: '',
      workspace_logo_url: '/uploads/workspace-logos/x.png',
    });

    const leaver = await createUser(db);
    const orphaned = await createInvite(db, { workspace, inviter: leaver, email: null });
    await db.getRepository(UserEntity).delete({ id: leaver.id });
    const orphan = (await client.get(`/api/invites/${orphaned.token}`)).json();
    expect(orphan).toMatchObject({ valid: true, inviter_name: 'The team' });
  });

  it('refuses unknown, revoked, expired and used-up invites', async () => {
    const owner = await createUser(db);
    const workspace = await createWorkspace(db, owner);
    const client = new Browser(target);
    const check = async (token: string) => {
      const response = await client.get(`/api/invites/${encodeURIComponent(token)}`);
      expect(response.status).toBe(200);
      return response.json();
    };

    expect(await check('inv_does_not_exist')).toEqual({
      ...REFUSED,
      status: 'not_found',
      message: 'Invite not found or the link is invalid',
    });

    // Revoked wins over expired, as the Python API checks it first.
    const revoked = await createInvite(db, { workspace, inviter: owner, email: null, status: 'revoked', expiresAt: new Date(Date.now() - 1000) });
    expect(await check(revoked.token)).toEqual({ ...REFUSED, status: 'revoked', message: 'This invite was revoked by an administrator' });

    const expired = await createInvite(db, { workspace, inviter: owner, email: null, expiresAt: new Date(Date.now() - 1000) });
    expect(await check(expired.token)).toEqual({ ...REFUSED, status: 'expired', message: 'This invite has expired' });

    const used = await createInvite(db, { workspace, inviter: owner, email: null, maxUses: 2, usedCount: 2 });
    expect(await check(used.token)).toEqual({ ...REFUSED, status: 'accepted', message: 'This invite has reached its usage limit' });
  });

  it('allows 30 checks a minute from one address', async () => {
    const client = new Browser(target);
    for (let i = 0; i < 30; i += 1) {
      expect((await client.get('/api/invites/inv_flood')).status).toBe(200);
    }
    const limited = await client.get('/api/invites/inv_flood');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(limited.json()).toEqual({ detail: `Too many requests. Please try again in ${limited.headers['retry-after']} s.` });
  });
});
