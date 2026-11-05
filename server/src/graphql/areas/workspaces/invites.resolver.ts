import { Arg, Ctx, Int, Mutation, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { afterCommit, rows } from '../../../database.ts';
import { inviteAcceptedEmail, invitationEmail } from '../../../email/workspace-emails.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { recordEvent } from '../../../workspaces/audit.ts';
import { joinDefaultTeam } from '../../../workspaces/default-team.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { WorkspaceInvitePayload, type Payload } from '../../payloads.ts';
import { limitField } from '../../rate-limit.ts';
import { JSONScalar } from '../../scalars.ts';
import { inviteToken, inviteUrl, isAdmin, roleOrRefuse, workspace } from './members.resolver.ts';

// Email invites: sending, sending again and accepting (api/routers/members.py).

interface CreateInvite {
  email?: string | null;
  role?: string;
  expires_in_days?: number;
  max_uses?: number;
}

// CreateWorkspaceInviteRequest.
const CREATE = inputSchema<CreateInvite>({
  type: 'object',
  properties: {
    email: { type: ['string', 'null'], maxLength: 255 },
    role: { type: 'string', pattern: '^(admin|member|guest)$' },
    expires_in_days: { type: 'integer', minimum: 1, maximum: 365 },
    max_uses: { type: 'integer', minimum: 0, maximum: 1000 },
  },
});

export interface InviteRow {
  id: number;
  workspace_id: number;
  token: string;
  email: string | null;
  role: string;
  status: string;
  max_uses: number;
  used_count: number;
  inviter_user_id: number | null;
  expires_at: string | null;
  created_at: string;
  expired: boolean;
}

export const INVITE_COLUMNS = `id, workspace_id, token, email, role, status, max_uses, used_count, inviter_user_id,
  ${isoUtc('expires_at')} AS expires_at, coalesce(${isoUtc('created_at')}, '') AS created_at,
  (expires_at IS NOT NULL AND now() > expires_at) AS expired`;

// A new pending invite, with its INVITE_CREATE event.
export async function insertInvite(
  tx: EntityManager,
  user: UserEntity,
  invite: { workspaceId: number; email: string | null; role: string; maxUses: number; expiresInDays: number },
): Promise<InviteRow> {
  const [created] = await rows<InviteRow>(
    tx,
    `INSERT INTO workspace_invites (workspace_id, token, email, role, inviter_user_id, status, max_uses, used_count, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, 0, now() + make_interval(days => $7), now(), now())
     RETURNING ${INVITE_COLUMNS}`,
    [invite.workspaceId, inviteToken(), invite.email, invite.role, user.id, invite.maxUses, invite.expiresInDays],
  );
  await recordEvent(tx, {
    workspaceId: invite.workspaceId, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_CREATE',
    message: `Invite created for ${invite.email || 'a public link'}`,
    details: { invite_id: created.id, email: invite.email, role: created.role, max_uses: created.max_uses },
  });
  return created;
}

// send_workspace_invitation_email: whether the mailer took it.
export async function sendInvitation(context: GraphQLContext, invite: InviteRow, workspaceName: string, inviterName: string): Promise<boolean> {
  try {
    return await context.app.services.sendEmail(
      invitationEmail({ to: invite.email!, workspaceName, inviterName, role: invite.role, inviteToken: invite.token }),
    );
  } catch (error) {
    context.app.log.error({ err: error, recipient: invite.email }, 'Failed to send invitation email');
    return false;
  }
}

const inviterName = (user: UserEntity) => user.fullName || user.username || 'A colleague';

// Linear emails whoever sent the invite as soon as the invitee joins, unless
// they turned off Other updates → Invite accepted.
async function emailInviter(context: GraphQLContext, inviterId: number | null, memberId: number, workspaceId: number): Promise<void> {
  if (!inviterId || inviterId === memberId) return;
  try {
    const found = await context.app.db.transaction(async (tx) => {
      const [inviter] = await rows<{ email: string | null; channels: unknown }>(
        tx,
        `SELECT u.email, m.notification_channels AS channels FROM users u
           JOIN workspace_members m ON m.user_id = u.id AND m.workspace_id = $2 WHERE u.id = $1`,
        [inviterId, workspaceId],
      );
      const [member] = await rows<{ name: string }>(
        tx,
        "SELECT coalesce(nullif(full_name, ''), nullif(email, ''), username) AS name FROM users WHERE id = $1",
        [memberId],
      );
      const [ws] = await rows<{ slug: string }>(tx, 'SELECT slug FROM workspaces WHERE id = $1', [workspaceId]);
      return inviter && member && ws ? { inviter, member, ws } : null;
    });
    // Someone who has left the workspace is not told about it any more.
    if (!found || !found.inviter.email) return;
    const channels = found.inviter.channels;
    if (channels && typeof channels === 'object' && (channels as { invite_accepted?: unknown }).invite_accepted === false) return;
    const webapp = (context.app.config.webappUrl || 'https://buyerly.app').replace(/\/+$/, '');
    await context.app.services.sendEmail(
      inviteAcceptedEmail({
        to: found.inviter.email,
        memberName: found.member.name,
        membersUrl: `${webapp}/${found.ws.slug}/settings/members`,
        settingsUrl: `${webapp}/${found.ws.slug}/settings/account/notifications`,
      }),
    );
  } catch (error) {
    context.app.log.error({ err: error, workspaceId }, 'Could not email the inviter about the workspace');
  }
}

@Resolver()
export class InvitesResolver {
  @Mutation(() => WorkspaceInvitePayload, { nullable: true, description: 'Invites people to the workspace by email.' })
  async workspaceInviteCreate(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const req = CREATE.parse(input);
    const { app, user } = context;
    const email = req.email && req.email.trim() ? req.email.trim().toLowerCase() : null;
    const { ws, invite } = await app.db.transaction(async (tx) => {
      const found = await workspace(tx, workspaceId);
      const role = await roleOrRefuse(tx, user, workspaceId, 'CREATE_INVITE');
      if (!isAdmin(role)) throw new RouteError(403, 'You do not have permission to create invites');
      const created = await insertInvite(tx, user, {
        workspaceId, email, role: req.role ?? 'member', maxUses: req.max_uses ?? 1, expiresInDays: req.expires_in_days ?? 7,
      });
      return { ws: found, invite: created };
    });
    if (email) {
      // Python records the delivery as a success unless sending threw.
      await sendInvitation(context, invite, ws.name, inviterName(user));
      await app.db.transaction((tx) =>
        recordEvent(tx, {
          workspaceId, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_SEND',
          message: `Invite delivery to ${email}: success`, details: { invite_id: invite.id, email },
        }),
      );
    }
    return mutated(context, WorkspaceInvitePayload, {
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
      inviter_name: user.fullName || user.username || '',
      expires_at: invite.expires_at,
      created_at: invite.created_at,
    });
  }

  @Mutation(() => WorkspaceInvitePayload, { nullable: true, description: 'Sends a pending invite again.' })
  async workspaceInviteResend(
    @Arg('workspaceId', () => Int) workspaceId: number,
    @Arg('id', () => Int) id: number,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    limitField(context, 'invite_resend', 5);
    const { app, user } = context;
    const { ws, invite } = await app.db.transaction(async (tx) => {
      const found = await workspace(tx, workspaceId);
      const role = await roleOrRefuse(tx, user, workspaceId, 'RESEND_INVITE');
      if (!isAdmin(role)) throw new RouteError(403, 'You do not have permission to resend invites');
      const [current] = await rows<InviteRow>(
        tx,
        `SELECT ${INVITE_COLUMNS} FROM workspace_invites WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
        [id, workspaceId],
      );
      if (!current) throw new RouteError(404, 'Invite not found');
      // "expired" is only ever derived or stored for a pending invite whose date passed.
      if (!current.email || !['pending', 'expired'].includes(current.status)) {
        throw new RouteError(400, 'Only a pending email invite can be resent');
      }
      const [renewed] = await rows<InviteRow>(
        tx,
        `UPDATE workspace_invites SET status = 'pending', expires_at = now() + interval '7 days', updated_at = now()
          WHERE id = $1 RETURNING ${INVITE_COLUMNS}`,
        [current.id],
      );
      return { ws: found, invite: renewed };
    });
    const sent = await sendInvitation(context, invite, ws.name, inviterName(user));
    await app.db.transaction((tx) =>
      recordEvent(tx, {
        workspaceId, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_SEND', status: sent ? 'SUCCESS' : 'FAILED',
        message: `Invite resent to ${invite.email}: ${sent ? 'success' : 'error'}`,
        details: { invite_id: invite.id, email: invite.email, resend: true },
      }),
    );
    if (!sent) throw new RouteError(502, 'The invitation email could not be delivered');
    return mutated(context, WorkspaceInvitePayload, { status: 'ok', message: 'Invite resent', expires_at: invite.expires_at });
  }

  @Mutation(() => WorkspaceInvitePayload, { nullable: true, description: 'Joins a workspace through an invite.' })
  async workspaceInviteAccept(@Arg('token', () => String) token: string, @Ctx() context: GraphQLContext): Promise<Payload> {
    limitField(context, 'invite_accept', 10);
    const { app, user } = context;
    const joined = await app.db.transaction(async (tx) => {
      const [invite] = await rows<InviteRow>(tx, `SELECT ${INVITE_COLUMNS} FROM workspace_invites WHERE token = $1 FOR UPDATE`, [token]);
      if (!invite) throw new RouteError(404, 'Invite not found');
      // A refused attempt is kept, then refused.
      const reject = async (reason: string, message: string, status: number, detail: string): Promise<never> => {
        await recordEvent(tx, {
          workspaceId: invite.workspace_id, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_REJECT', status: 'FAILED',
          message, details: { invite_id: invite.id, reason },
        });
        throw afterCommit(new RouteError(status, detail));
      };
      if (invite.status === 'revoked') await reject('revoked', 'Attempt to accept a revoked invite', 400, 'This invite was revoked');
      if (invite.expired) {
        await rows(tx, "UPDATE workspace_invites SET status = 'expired', updated_at = now() WHERE id = $1 RETURNING id", [invite.id]);
        await reject('expired', 'Attempt to accept an expired invite', 400, 'This invite has expired');
      }
      const [ws] = await rows<{ id: number; name: string; slug: string }>(tx, 'SELECT id, name, slug FROM workspaces WHERE id = $1', [invite.workspace_id]);
      if (!ws) throw new RouteError(404, 'Workspace not found');

      // A personal invite needs the confirmed address it was sent to.
      if (invite.email) {
        const userEmail = (user.email ?? '').trim().toLowerCase();
        if (!userEmail || !user.emailVerifiedAt) {
          await reject(
            'unverified_email', 'Attempt to accept a targeted invite without a confirmed email', 403,
            'A confirmed email address is required to accept a personal invite.',
          );
        }
        if (userEmail !== invite.email.trim().toLowerCase()) {
          await reject(
            'email_mismatch', 'Attempt to accept a targeted invite with a mismatched email', 403,
            'This invite is intended for a different email address.',
          );
        }
      }

      const [existing] = await rows<{ role: string }>(
        tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [invite.workspace_id, user.id],
      );
      // A retry by the user who already joined is idempotent: it must not
      // consume another use even after a single-use invite became accepted.
      // Others still see the exhausted state while this row lock is held.
      if (!existing && (invite.status === 'accepted' || (invite.max_uses > 0 && invite.used_count >= invite.max_uses))) {
        await reject('max_uses_reached', 'This invite has reached its usage limit', 400, 'This invite has reached its usage limit');
      }

      if (!existing) {
        const [member] = await rows<{ id: number }>(
          tx,
          'INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES ($1, $2, $3, now()) RETURNING id',
          [invite.workspace_id, user.id, invite.role],
        );
        // As Linear's invite: the new member joins the workspace's default team.
        await joinDefaultTeam(tx, invite.workspace_id, { memberId: member.id });
        const used = invite.used_count + 1;
        await rows(
          tx,
          'UPDATE workspace_invites SET used_count = $2, status = $3, updated_at = now() WHERE id = $1 RETURNING id',
          [invite.id, used, invite.max_uses > 0 && used >= invite.max_uses ? 'accepted' : invite.status],
        );
      }
      const [person] = await rows<{ onboarding_step: string; onboarding_completed: boolean }>(
        tx,
        `UPDATE users SET active_workspace_id = $2,
                onboarding_step = CASE WHEN coalesce(first_name, '') = '' AND coalesce(full_name, '') = '' THEN 'personal_details' ELSE 'completed' END,
                onboarding_completed = NOT (coalesce(first_name, '') = '' AND coalesce(full_name, '') = '')
          WHERE id = $1 RETURNING onboarding_step, onboarding_completed`,
        [user.id, ws.id],
      );
      const role = existing ? existing.role : invite.role;
      await recordEvent(tx, {
        workspaceId: invite.workspace_id, user, category: 'WORKSPACE_INVITE', eventType: 'INVITE_ACCEPT',
        message: `Invite accepted by ${user.username ?? 'None'}`,
        details: { invite_id: invite.id, workspace_id: ws.id, user_id: user.id, role },
      });
      return { ws, role, person, joinedNow: !existing, inviterId: invite.inviter_user_id };
    });
    if (joined.joinedNow) await emailInviter(context, joined.inviterId, user.id, joined.ws.id);
    return mutated(context, WorkspaceInvitePayload, {
      status: 'ok',
      message: `You have joined the workspace ${joined.ws.name}`,
      workspace_id: joined.ws.id,
      workspace_slug: joined.ws.slug,
      role: joined.role,
      onboarding_step: joined.person.onboarding_step,
      onboarding_completed: joined.person.onboarding_completed,
    });
  }
}
