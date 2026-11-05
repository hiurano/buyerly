import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AuditEventEntity, UserEntity, WorkspaceEntity, WorkspaceInviteEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createInvite, createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Members, invites and the invite link over GraphQL (tests/test_workspaces.py
// members, invites and invite-link lifecycles): the same answers, refusals,
// audit events and side effects from either server.

interface Answer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?Z$/;

describe.skipIf(!DATABASE_URL)('workspace members and invites', () => {
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

  interface Person {
    user: UserEntity;
    call(query: string, variables?: Record<string, unknown>): Promise<Answer>;
  }

  async function person(user: UserEntity, workspace: WorkspaceEntity): Promise<Person> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return {
      user,
      async call(query, variables) {
        const answer = await browser.post('/api/graphql', { query, variables }, browser.csrf());
        expect(answer.status).toBe(200);
        return answer.body as Answer;
      },
    };
  }

  async function world() {
    const ownerUser = await createUser(db, { fullName: 'Artem Owner' });
    const workspace = await createWorkspace(db, ownerUser);
    const join = async (role: string, fullName: string) => {
      const user = await createUser(db, { fullName });
      await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
      await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
      return person(user, workspace);
    };
    const owner = await person(ownerUser, workspace);
    const admin = await join('admin', 'Bob Admin');
    const member = await join('member', 'Charlie Member');
    const outsiderUser = await createUser(db);
    const outsider = await person(outsiderUser, await createWorkspace(db, outsiderUser));
    return { ws: workspace, owner, admin, member, outsider };
  }

  function refusal(answer: Answer): [number | undefined, string] {
    expect(answer.errors, JSON.stringify(answer)).toBeDefined();
    return [answer.errors![0].extensions?.statusCode, answer.errors![0].message];
  }

  function data<T>(answer: Answer, field: string): T {
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    return answer.data![field] as T;
  }

  const MEMBERS = 'query($ws: Int!) { workspaceMembers(workspaceId: $ws) }';
  const ROLE = 'mutation($ws: Int!, $user: Int!, $input: JSON!) { workspaceMemberUpdate(workspaceId: $ws, userId: $user, input: $input) { success workspaceMember } }';
  const REMOVE = 'mutation($ws: Int!, $user: Int!) { workspaceMemberRemove(workspaceId: $ws, userId: $user) { workspaceMember } }';
  const LEAVE = 'mutation($id: Int!) { workspaceLeave(id: $id) { workspace } }';
  const TRANSFER = 'mutation($id: Int!, $input: JSON!) { workspaceOwnershipTransfer(id: $id, input: $input) { workspace } }';

  it('lists members, owner first, with who is asking', async () => {
    const w = await world();
    const members = data<Record<string, unknown>[]>(await w.admin.call(MEMBERS, { ws: w.ws.id }), 'workspaceMembers');
    expect(members.map((member) => member.role)).toEqual(['owner', 'admin', 'member']);
    expect(Object.keys(members[0]).sort()).toEqual([
      'avatar_url', 'email', 'first_name', 'full_name', 'id', 'is_current_user', 'joined_at', 'last_name', 'role', 'user_id', 'username',
    ]);
    expect(members[0]).toMatchObject({ user_id: w.owner.user.id, full_name: 'Artem Owner', email: w.owner.user.email, is_current_user: false });
    expect(members[1]).toMatchObject({ user_id: w.admin.user.id, is_current_user: true });
    expect(members[0].joined_at).toMatch(ISO);
  });

  it('refuses outsiders and keeps the attempt in the audit log', async () => {
    const w = await world();
    expect(refusal(await w.outsider.call(MEMBERS, { ws: w.ws.id }))).toEqual([403, 'You do not have access to this workspace']);
    const event = await db.getRepository(AuditEventEntity).findOneByOrFail({ workspaceId: w.ws.id, ownerUserId: w.outsider.user.id });
    expect(event).toMatchObject({
      category: 'SECURITY', eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT', status: 'BLOCKED', action: 'LIST_WORKSPACE_MEMBERS',
      message: 'You do not have access to this workspace', details: { resource_type: 'workspace', resource_id: String(w.ws.id) },
    });
    expect(refusal(await w.owner.call(MEMBERS, { ws: 2_000_000_000 }))).toEqual([404, 'Workspace not found']);
  });

  it('changes roles as Linear allows', async () => {
    const w = await world();
    const promoted = data<{ success: boolean; workspaceMember: Record<string, unknown> }>(
      await w.owner.call(ROLE, { ws: w.ws.id, user: w.member.user.id, input: { role: 'admin' } }),
      'workspaceMemberUpdate',
    );
    expect(promoted.workspaceMember).toMatchObject({ user_id: w.member.user.id, role: 'admin', is_current_user: false, full_name: 'Charlie Member' });
    expect(refusal(await w.owner.call(ROLE, { ws: w.ws.id, user: w.owner.user.id, input: { role: 'member' } }))).toEqual([400, 'You cannot change your own role']);
    expect(refusal(await w.admin.call(ROLE, { ws: w.ws.id, user: w.owner.user.id, input: { role: 'member' } })))
      .toEqual([400, "The owner's role cannot be changed. Use ownership transfer instead."]);
    expect(refusal(await w.admin.call(ROLE, { ws: w.ws.id, user: w.member.user.id, input: { role: 'member' } })))
      .toEqual([403, "Only the owner can change an admin's role"]);
    expect(refusal(await w.owner.call(ROLE, { ws: w.ws.id, user: w.member.user.id, input: { role: 'owner' } })))
      .toEqual([422, "String should match pattern '^(admin|member|guest)$'"]);
    expect(refusal(await w.owner.call(ROLE, { ws: w.ws.id, user: w.outsider.user.id, input: { role: 'guest' } }))).toEqual([404, 'Member not found in this workspace']);
  });

  it('removes members; one left with no workspace gets their own', async () => {
    const w = await world();
    expect(refusal(await w.member.call(REMOVE, { ws: w.ws.id, user: w.admin.user.id }))).toEqual([403, 'You do not have permission to remove members']);
    expect(refusal(await w.owner.call(REMOVE, { ws: w.ws.id, user: w.owner.user.id }))).toEqual([400, 'Use the leave method to exit a workspace']);
    const removed = await w.owner.call(REMOVE, { ws: w.ws.id, user: w.member.user.id });
    expect(data(removed, 'workspaceMemberRemove')).toEqual({ workspaceMember: { status: 'ok', message: 'Member removed from the workspace' } });

    const left = await db.getRepository(UserEntity).findOneByOrFail({ id: w.member.user.id });
    const own = await db.getRepository(WorkspaceEntity).findOneByOrFail({ id: left.activeWorkspaceId! });
    expect(own).toMatchObject({ name: 'Buyerly', slug: `buyerly-${left.id}`, ownerUserId: left.id, badgeText: 'B', badgeColor: '#F5A300' });
    const [team] = await db.query<{ name: string; key: string; is_owner: boolean }[]>('SELECT t.name, t.key, tm.is_owner FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.workspace_id = $1', [own.id]);
    expect(team).toEqual({ name: 'Buyerly', key: 'BUY', is_owner: true });
  });

  it('lets members leave, not the owner, and hands ownership over', async () => {
    const w = await world();
    expect(refusal(await w.owner.call(LEAVE, { id: w.ws.id })))
      .toEqual([400, 'The owner cannot leave the workspace. Transfer ownership or delete the workspace.']);
    expect(refusal(await w.outsider.call(LEAVE, { id: w.ws.id }))).toEqual([404, 'You are not a member of this workspace']);
    const left = data<{ workspace: Record<string, unknown> }>(await w.member.call(LEAVE, { id: w.ws.id }), 'workspaceLeave');
    expect(left.workspace).toMatchObject({ status: 'ok', message: 'You have left the workspace' });
    expect(typeof left.workspace.next_workspace_id).toBe('number');

    expect(refusal(await w.admin.call(TRANSFER, { id: w.ws.id, input: { new_owner_user_id: w.admin.user.id } })))
      .toEqual([403, 'Only the owner can transfer workspace ownership']);
    expect(refusal(await w.owner.call(TRANSFER, { id: w.ws.id, input: { new_owner_user_id: w.member.user.id } })))
      .toEqual([404, 'The new owner must be a member of this workspace']);
    const moved = data<{ workspace: unknown }>(await w.owner.call(TRANSFER, { id: w.ws.id, input: { new_owner_user_id: w.admin.user.id } }), 'workspaceOwnershipTransfer');
    expect(moved.workspace).toEqual({ status: 'ok', message: 'Ownership transferred', new_owner_user_id: w.admin.user.id });
    expect((await db.getRepository(WorkspaceEntity).findOneByOrFail({ id: w.ws.id })).ownerUserId).toBe(w.admin.user.id);
    const roles = await db.getRepository(WorkspaceMemberEntity).findBy({ workspaceId: w.ws.id });
    expect(Object.fromEntries(roles.map((row) => [row.userId, row.role]))).toEqual({ [w.owner.user.id]: 'admin', [w.admin.user.id]: 'owner' });
  });

  it('lists and revokes invites', async () => {
    const w = await world();
    const invite = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: 'new@example.test' });
    const expired = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: null, expiresAt: new Date(Date.now() - 1000), maxUses: 0 });
    const LIST = 'query($ws: Int!) { workspaceInvites(workspaceId: $ws) }';
    expect(refusal(await w.member.call(LIST, { ws: w.ws.id }))).toEqual([403, 'You do not have permission to view invites']);
    const invites = data<Record<string, unknown>[]>(await w.admin.call(LIST, { ws: w.ws.id }), 'workspaceInvites');
    expect(invites.map((item) => [item.id, item.status])).toEqual([[expired.id, 'expired'], [invite.id, 'pending']]);
    expect(invites[1]).toMatchObject({
      workspace_id: w.ws.id, workspace_name: w.ws.name, token: invite.token, email: 'new@example.test', role: 'buyer',
      max_uses: 1, used_count: 0, inviter_name: 'Artem Owner',
    });
    expect(String(invites[1].invite_url)).toMatch(new RegExp(`/invite/${invite.token}$`));
    expect(invites[1].expires_at).toMatch(ISO);

    const REVOKE = 'mutation($ws: Int!, $id: Int!) { workspaceInviteDelete(workspaceId: $ws, id: $id) { workspaceInvite } }';
    expect(data(await w.admin.call(REVOKE, { ws: w.ws.id, id: invite.id }), 'workspaceInviteDelete'))
      .toEqual({ workspaceInvite: { status: 'ok', message: 'Invite revoked' } });
    expect((await db.getRepository(WorkspaceInviteEntity).findOneByOrFail({ id: invite.id })).status).toBe('revoked');
    const event = await db.getRepository(AuditEventEntity).findOneByOrFail({ workspaceId: w.ws.id, eventType: 'INVITE_REVOKE' });
    expect(event).toMatchObject({ category: 'WORKSPACE_INVITE', status: 'SUCCESS', actorId: String(w.admin.user.id), details: { invite_id: invite.id, email: 'new@example.test' } });
    expect(refusal(await w.admin.call(REVOKE, { ws: w.ws.id, id: 2_000_000_000 }))).toEqual([404, 'Invite not found']);
  });

  it('turns the invite link on, resets it and turns it off', async () => {
    const w = await world();
    const GET = 'query($ws: Int!) { workspaceInviteLink(workspaceId: $ws) }';
    const ENABLE = 'mutation($ws: Int!) { workspaceInviteLinkEnable(workspaceId: $ws) { workspaceInviteLink } }';
    const RESET = 'mutation($ws: Int!) { workspaceInviteLinkReset(workspaceId: $ws) { workspaceInviteLink } }';
    const DISABLE = 'mutation($ws: Int!) { workspaceInviteLinkDisable(workspaceId: $ws) { workspaceInviteLink } }';
    type Link = { invite_url: string | null; turned_off: boolean };

    expect(data(await w.owner.call(GET, { ws: w.ws.id }), 'workspaceInviteLink')).toEqual({ invite_url: null, turned_off: false });
    expect(refusal(await w.member.call(ENABLE, { ws: w.ws.id }))).toEqual([403, 'Only workspace admins can manage the invite link']);
    const enabled = data<{ workspaceInviteLink: Link }>(await w.owner.call(ENABLE, { ws: w.ws.id }), 'workspaceInviteLinkEnable').workspaceInviteLink;
    expect(enabled.invite_url).toMatch(/\/invite\/inv_[A-Za-z0-9_-]{32}$/);
    expect(enabled.turned_off).toBe(false);
    const again = data<{ workspaceInviteLink: Link }>(await w.admin.call(ENABLE, { ws: w.ws.id }), 'workspaceInviteLinkEnable').workspaceInviteLink;
    expect(again).toEqual(enabled);
    expect(data(await w.admin.call(GET, { ws: w.ws.id }), 'workspaceInviteLink')).toEqual(enabled);

    const reset = data<{ workspaceInviteLink: Link }>(await w.owner.call(RESET, { ws: w.ws.id }), 'workspaceInviteLinkReset').workspaceInviteLink;
    expect(reset.invite_url).not.toBe(enabled.invite_url);
    const old = await db.getRepository(WorkspaceInviteEntity).findOneByOrFail({ token: enabled.invite_url!.split('/invite/')[1] });
    expect(old.status).toBe('revoked');

    expect(data(await w.owner.call(DISABLE, { ws: w.ws.id }), 'workspaceInviteLinkDisable')).toEqual({ workspaceInviteLink: { invite_url: null, turned_off: false } });
    expect(data(await w.owner.call(GET, { ws: w.ws.id }), 'workspaceInviteLink')).toEqual({ invite_url: null, turned_off: true });
    const events = await db.getRepository(AuditEventEntity).find({ where: { workspaceId: w.ws.id, category: 'WORKSPACE_INVITE' }, order: { id: 'ASC' } });
    expect(events.map((event) => [event.eventType, event.message])).toEqual([
      ['INVITE_LINK_ENABLE', 'Invite link enabled'],
      ['INVITE_LINK_RESET', 'Invite link reset'],
      ['INVITE_LINK_DISABLE', 'Invite link disabled'],
    ]);
  });
});
