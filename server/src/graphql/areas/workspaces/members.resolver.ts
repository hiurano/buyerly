import { randomBytes } from 'node:crypto';
import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { callerRole, recordEvent, refuseAndRecord } from '../../../workspaces/audit.ts';
import { personalWorkspace } from '../../../workspaces/default-team.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { WorkspaceInviteLinkPayload, WorkspaceInvitePayload, WorkspaceMemberPayload, WorkspacePayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';

// Members, pending invites and the invite link (api/routers/members.py).

const ROLE = inputSchema<{ role: string }>({
  type: 'object',
  required: ['role'],
  properties: { role: { type: 'string', pattern: '^(admin|member|guest)$' } },
});
const TRANSFER = inputSchema<{ new_owner_user_id: number }>({
  type: 'object',
  required: ['new_owner_user_id'],
  properties: { new_owner_user_id: { type: 'integer' } },
});

interface WorkspaceRow {
  id: number;
  name: string;
  owner_user_id: number;
}

export async function workspace(tx: EntityManager, id: number): Promise<WorkspaceRow> {
  const [found] = await rows<WorkspaceRow>(tx, 'SELECT id, name, owner_user_id FROM workspaces WHERE id = $1', [id]);
  if (!found) throw new RouteError(404, 'Workspace not found');
  return found;
}

// The caller's role, or the blocked attempt recorded and refused.
export async function roleOrRefuse(tx: EntityManager, user: UserEntity, workspaceId: number, action: string): Promise<string> {
  const role = await callerRole(tx, user, workspaceId);
  if (!role) return refuseAndRecord(tx, user, workspaceId, 'You do not have access to this workspace', action, { id: String(workspaceId) });
  return role;
}

export const isAdmin = (role: string) => role === 'owner' || role === 'admin';

// WorkspaceMemberItem (api/schemas/members.py).
const MEMBER_COLUMNS = `m.id, u.id AS user_id, coalesce(u.username, '') AS username,
  coalesce(nullif(u.full_name, ''), nullif(u.username, ''), '') AS full_name,
  coalesce(u.first_name, '') AS first_name, coalesce(u.last_name, '') AS last_name,
  u.email, coalesce(u.avatar_url, '') AS avatar_url, m.role, coalesce(${isoUtc('m.joined_at')}, '') AS joined_at`;

export function inviteUrl(webappUrl: string, token: string): string {
  const base = webappUrl.replace(/\/+$/, '');
  return base ? `${base}/invite/${token}` : `/invite/${token}`;
}

// secrets.token_urlsafe(24).
export function inviteToken(): string {
  return `inv_${randomBytes(24).toString('base64url')}`;
}

// The workspace's invite link: a pending public invite with no use limit and no expiry.
const LINK = "workspace_id = $1 AND email IS NULL AND max_uses = 0 AND expires_at IS NULL";

// A member who loses their active workspace moves to another of theirs, or to a new one of their own.
async function moveActiveWorkspace(tx: EntityManager, userId: number, leftWorkspaceId: number): Promise<number | null> {
  const [person] = await rows<{ active_workspace_id: number | null }>(tx, 'SELECT active_workspace_id FROM users WHERE id = $1', [userId]);
  if (!person || person.active_workspace_id !== leftWorkspaceId) return null;
  const [other] = await rows<{ workspace_id: number }>(tx, 'SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY id LIMIT 1', [userId]);
  if (other) {
    await rows(tx, 'UPDATE users SET active_workspace_id = $1 WHERE id = $2 RETURNING id', [other.workspace_id, userId]);
    return other.workspace_id;
  }
  return personalWorkspace(tx, userId);
}

async function dropMember(tx: EntityManager, workspaceId: number, userId: number): Promise<void> {
  await rows(tx, 'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING id', [workspaceId, userId]);
  // Their ad accounts in this workspace are left without a lead, as Linear's projects are.
  await rows(tx, 'UPDATE accounts SET lead_user_id = NULL WHERE workspace_id = $1 AND lead_user_id = $2 RETURNING id', [workspaceId, userId]);
}

@Resolver()
export class MembersResolver {
  @Query(() => JSONScalar, { description: "A workspace's members." })
  async workspaceMembers(@Arg('workspaceId', () => Int) workspaceId: number, @Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      await workspace(tx, workspaceId);
      await roleOrRefuse(tx, user, workspaceId, 'LIST_WORKSPACE_MEMBERS');
      const members = await rows<Record<string, unknown>>(
        tx,
        `SELECT ${MEMBER_COLUMNS} FROM workspace_members m JOIN users u ON u.id = m.user_id
          WHERE m.workspace_id = $1
          ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END, m.joined_at ASC`,
        [workspaceId],
      );
      return members.map((member) => ({ ...member, is_current_user: member.user_id === user.id }));
    });
  }

  @Mutation(() => WorkspaceMemberPayload, { nullable: true, description: "Changes a member's role." })
  async workspaceMemberUpdate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('userId', () => Int) userId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = ROLE.parse(input);
    const { app, user } = context;
    const item = await app.db.transaction(async (tx) => {
      const ws = await workspace(tx, workspaceId);
      const role = await roleOrRefuse(tx, user, workspaceId, 'UPDATE_MEMBER_ROLE');
      if (!isAdmin(role)) throw new RouteError(403, 'You do not have permission to change member roles');
      if (userId === user.id) throw new RouteError(400, 'You cannot change your own role');
      const [target] = await rows<{ id: number; role: string }>(tx, 'SELECT id, role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
      if (!target) throw new RouteError(404, 'Member not found in this workspace');
      if (target.role === 'owner') throw new RouteError(400, "The owner's role cannot be changed. Use ownership transfer instead.");
      if (role === 'admin' && target.role === 'admin' && ws.owner_user_id !== user.id) {
        throw new RouteError(403, "Only the owner can change an admin's role");
      }
      if (target.role !== req.role) await rows(tx, 'UPDATE workspace_members SET role = $2 WHERE id = $1 RETURNING id', [target.id, req.role]);
      const [member] = await rows<Record<string, unknown>>(tx, `SELECT ${MEMBER_COLUMNS} FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`, [target.id]);
      return { ...member, is_current_user: false };
    });
    return mutated(context, WorkspaceMemberPayload, item);
  }

  @Mutation(() => WorkspaceMemberPayload, { nullable: true, description: 'Removes a member from the workspace.' })
  async workspaceMemberRemove(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('userId', () => Int) userId: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      const ws = await workspace(tx, workspaceId);
      const role = await roleOrRefuse(tx, user, workspaceId, 'REMOVE_MEMBER');
      if (!isAdmin(role)) throw new RouteError(403, 'You do not have permission to remove members');
      if (userId === user.id) throw new RouteError(400, 'Use the leave method to exit a workspace');
      const [target] = await rows<{ role: string }>(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
      if (!target) throw new RouteError(404, 'Member not found in this workspace');
      if (target.role === 'owner') throw new RouteError(400, 'The workspace owner cannot be removed');
      if (role === 'admin' && target.role === 'admin' && ws.owner_user_id !== user.id) {
        throw new RouteError(403, 'Only the owner can remove an admin');
      }
      await dropMember(tx, workspaceId, userId);
      await moveActiveWorkspace(tx, userId, workspaceId);
    });
    return mutated(context, WorkspaceMemberPayload, { status: 'ok', message: 'Member removed from the workspace' });
  }

  @Mutation(() => WorkspacePayload, { nullable: true, description: 'Leaves a workspace.' })
  async workspaceLeave(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    const next = await app.db.transaction(async (tx) => {
      await workspace(tx, id);
      const [member] = await rows<{ role: string }>(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [id, user.id]);
      if (!member) throw new RouteError(404, 'You are not a member of this workspace');
      if (member.role === 'owner') {
        throw new RouteError(400, 'The owner cannot leave the workspace. Transfer ownership or delete the workspace.');
      }
      await dropMember(tx, id, user.id);
      return moveActiveWorkspace(tx, user.id, id);
    });
    return mutated(context, WorkspacePayload, { status: 'ok', message: 'You have left the workspace', next_workspace_id: next });
  }

  @Mutation(() => WorkspacePayload, { nullable: true, description: 'Hands a workspace to another member.' })
  async workspaceOwnershipTransfer(
    @Arg('id', () => Int) id: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = TRANSFER.parse(input);
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      const ws = await workspace(tx, id);
      if (ws.owner_user_id !== user.id) {
        await refuseAndRecord(tx, user, id, 'Only the owner can transfer workspace ownership', 'TRANSFER_OWNERSHIP', { id: String(id) });
      }
      if (req.new_owner_user_id === user.id) throw new RouteError(400, 'You already own this workspace');
      const [target] = await rows<{ id: number }>(tx, 'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [id, req.new_owner_user_id]);
      if (!target) throw new RouteError(404, 'The new owner must be a member of this workspace');
      await rows(tx, 'UPDATE workspaces SET owner_user_id = $2, updated_at = now() WHERE id = $1 RETURNING id', [id, req.new_owner_user_id]);
      await rows(tx, "UPDATE workspace_members SET role = 'owner' WHERE id = $1 AND role <> 'owner' RETURNING id", [target.id]);
      await rows(tx, "UPDATE workspace_members SET role = 'admin' WHERE workspace_id = $1 AND user_id = $2 AND role <> 'admin' RETURNING id", [id, user.id]);
    });
    return mutated(context, WorkspacePayload, { status: 'ok', message: 'Ownership transferred', new_owner_user_id: req.new_owner_user_id });
  }

  @Query(() => JSONScalar, { description: "A workspace's pending invites." })
  async workspaceInvites(@Arg('workspaceId', () => Int) workspaceId: number, @Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      const ws = await workspace(tx, workspaceId);
      const role = await roleOrRefuse(tx, user, workspaceId, 'LIST_INVITES');
      if (!isAdmin(role)) throw new RouteError(403, 'You do not have permission to view invites');
      const invites = await rows<{
        id: number; token: string; email: string | null; role: string; status: string; max_uses: number; used_count: number;
        inviter_name: string; expires_at: string; created_at: string;
      }>(
        tx,
        `SELECT i.id, i.token, i.email, i.role,
                CASE WHEN i.status = 'pending' AND i.expires_at IS NOT NULL AND now() > i.expires_at THEN 'expired' ELSE i.status END AS status,
                i.max_uses, i.used_count,
                CASE WHEN u.id IS NULL THEN '' ELSE coalesce(nullif(u.full_name, ''), u.username, '') END AS inviter_name,
                coalesce(${isoUtc('i.expires_at')}, '') AS expires_at, coalesce(${isoUtc('i.created_at')}, '') AS created_at
           FROM workspace_invites i LEFT JOIN users u ON u.id = i.inviter_user_id
          WHERE i.workspace_id = $1 ORDER BY i.id DESC`,
        [workspaceId],
      );
      return invites.map((invite) => ({
        id: invite.id,
        workspace_id: ws.id,
        workspace_name: ws.name,
        token: invite.token,
        invite_url: inviteUrl(app.config.webappUrl, invite.token),
        email: invite.email,
        role: invite.role,
        status: invite.status,
        max_uses: invite.max_uses,
        used_count: invite.used_count,
        inviter_name: invite.inviter_name,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
      }));
    });
  }

  @Mutation(() => WorkspaceInvitePayload, { nullable: true, description: 'Revokes a pending invite.' })
  async workspaceInviteDelete(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('id', () => Int) id: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      await workspace(tx, workspaceId);
      const role = await roleOrRefuse(tx, user, workspaceId, 'REVOKE_INVITE');
      if (!isAdmin(role)) throw new RouteError(403, 'You do not have permission to revoke invites');
      const [invite] = await rows<{ id: number; email: string | null; status: string }>(
        tx,
        'SELECT id, email, status FROM workspace_invites WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
        [id, workspaceId],
      );
      if (!invite) throw new RouteError(404, 'Invite not found');
      if (invite.status !== 'revoked') await rows(tx, "UPDATE workspace_invites SET status = 'revoked', updated_at = now() WHERE id = $1 RETURNING id", [invite.id]);
      await recordEvent(tx, {
        workspaceId, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_REVOKE', message: 'Invite revoked',
        details: { invite_id: invite.id, email: invite.email },
      });
    });
    return mutated(context, WorkspaceInvitePayload, { status: 'ok', message: 'Invite revoked' });
  }

  // Invite link: Settings → Security → Invite links, owner and admins only, as in Linear.

  private async requireLinkAdmin(tx: EntityManager, user: UserEntity, workspaceId: number, action: string): Promise<void> {
    await workspace(tx, workspaceId);
    const role = await roleOrRefuse(tx, user, workspaceId, action);
    if (!isAdmin(role)) throw new RouteError(403, 'Only workspace admins can manage the invite link');
  }

  private async currentLink(tx: EntityManager, workspaceId: number): Promise<string | null> {
    const [link] = await rows<{ token: string }>(tx, `SELECT token FROM workspace_invites WHERE ${LINK} AND status = 'pending' ORDER BY id DESC LIMIT 1`, [workspaceId]);
    return link?.token ?? null;
  }

  private async revokeLinks(tx: EntityManager, workspaceId: number): Promise<number> {
    const locked = await rows<{ id: number }>(tx, `SELECT id FROM workspace_invites WHERE ${LINK} AND status = 'pending' FOR UPDATE`, [workspaceId]);
    if (locked.length) {
      await rows(tx, "UPDATE workspace_invites SET status = 'revoked', updated_at = now() WHERE id = ANY($1) RETURNING id", [locked.map((row) => row.id)]);
    }
    return locked.length;
  }

  private async createLink(tx: EntityManager, workspaceId: number, user: UserEntity, eventType: string): Promise<string> {
    const token = inviteToken();
    const [link] = await rows<{ id: number }>(
      tx,
      `INSERT INTO workspace_invites (workspace_id, token, email, role, inviter_user_id, status, max_uses, used_count, expires_at, created_at, updated_at)
       VALUES ($1, $2, NULL, 'member', $3, 'pending', 0, 0, NULL, now(), now()) RETURNING id`,
      [workspaceId, token, user.id],
    );
    await recordEvent(tx, {
      workspaceId, user, category: 'WORKSPACE_INVITE', eventType,
      message: eventType === 'INVITE_LINK_ENABLE' ? 'Invite link enabled' : 'Invite link reset',
      details: { invite_id: link.id },
    });
    return token;
  }

  @Query(() => JSONScalar, { description: "A workspace's invite link, when it has one." })
  async workspaceInviteLink(@Arg('workspaceId', () => Int) workspaceId: number, @Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    return app.db.transaction(async (tx) => {
      await this.requireLinkAdmin(tx, user, workspaceId, 'VIEW_INVITE_LINK');
      const token = await this.currentLink(tx, workspaceId);
      if (token) return { invite_url: inviteUrl(app.config.webappUrl, token), turned_off: false };
      // Onboarding turns links on for a new workspace, as Linear's are on by
      // default, but leaves them off once an admin has turned them off.
      const revoked = await rows(tx, `SELECT 1 FROM workspace_invites WHERE ${LINK} AND status = 'revoked' LIMIT 1`, [workspaceId]);
      return { invite_url: null, turned_off: revoked.length > 0 };
    });
  }

  @Mutation(() => WorkspaceInviteLinkPayload, { nullable: true, description: "Turns the workspace's invite link on." })
  async workspaceInviteLinkEnable(@Arg('workspaceId', () => Int) workspaceId: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    const token = await app.db.transaction(async (tx) => {
      await this.requireLinkAdmin(tx, user, workspaceId, 'ENABLE_INVITE_LINK');
      return (await this.currentLink(tx, workspaceId)) ?? this.createLink(tx, workspaceId, user, 'INVITE_LINK_ENABLE');
    });
    return mutated(context, WorkspaceInviteLinkPayload, { invite_url: inviteUrl(app.config.webappUrl, token), turned_off: false });
  }

  @Mutation(() => WorkspaceInviteLinkPayload, { nullable: true, description: "Replaces the workspace's invite link; the old one stops working." })
  async workspaceInviteLinkReset(@Arg('workspaceId', () => Int) workspaceId: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    const token = await app.db.transaction(async (tx) => {
      await this.requireLinkAdmin(tx, user, workspaceId, 'RESET_INVITE_LINK');
      await this.revokeLinks(tx, workspaceId);
      return this.createLink(tx, workspaceId, user, 'INVITE_LINK_RESET');
    });
    return mutated(context, WorkspaceInviteLinkPayload, { invite_url: inviteUrl(app.config.webappUrl, token), turned_off: false });
  }

  @Mutation(() => WorkspaceInviteLinkPayload, { nullable: true, description: "Turns the workspace's invite link off." })
  async workspaceInviteLinkDisable(@Arg('workspaceId', () => Int) workspaceId: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { app, user } = context;
    await app.db.transaction(async (tx) => {
      await this.requireLinkAdmin(tx, user, workspaceId, 'DISABLE_INVITE_LINK');
      if (await this.revokeLinks(tx, workspaceId)) {
        await recordEvent(tx, { workspaceId, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_LINK_DISABLE', message: 'Invite link disabled' });
      }
    });
    return mutated(context, WorkspaceInviteLinkPayload, { invite_url: null, turned_off: false });
  }
}
