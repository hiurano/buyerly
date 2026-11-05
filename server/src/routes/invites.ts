import type { PublicInviteInfo, PublicInviteStatus } from '@buyerly/shared';
import type { FastifyInstance } from 'fastify';
import { UserEntity, WorkspaceEntity, WorkspaceInviteEntity } from '../entities/index.ts';
import { rateLimit } from '../http/rate-limit.ts';
import { utcIso } from './auth.ts';

// The public side of workspace invites (api/routers/members.py,
// get_public_invite_info): what the invite page shows before anyone signs in.
// Everything else about invites (create, list, revoke, resend, accept, the
// invite link) is served by the client API (GraphQL) and moves with it.

function refused(status: PublicInviteStatus, message: string): PublicInviteInfo {
  return {
    valid: false,
    status,
    workspace_name: null,
    workspace_slug: null,
    workspace_id: null,
    workspace_logo_url: null,
    inviter_name: null,
    role: null,
    target_email: null,
    expires_at: null,
    message,
  };
}

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>(
    '/api/invites/:token',
    { preValidation: [rateLimit({ limit: 30, windowSeconds: 60, scope: 'invite_info' })] },
    async (request): Promise<PublicInviteInfo> =>
      app.db.transaction(async (tx) => {
        const invite = await tx.getRepository(WorkspaceInviteEntity).findOneBy({ token: request.params.token });
        if (!invite) return refused('not_found', 'Invite not found or the link is invalid');
        // The checks run in this order in the Python API: a revoked invite
        // says so even once it has expired.
        if (invite.status === 'revoked') return refused('revoked', 'This invite was revoked by an administrator');
        if (invite.expiresAt && Date.now() > invite.expiresAt.getTime()) return refused('expired', 'This invite has expired');
        if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) {
          return refused('accepted', 'This invite has reached its usage limit');
        }
        const workspace = await tx.getRepository(WorkspaceEntity).findOneBy({ id: invite.workspaceId });
        if (!workspace) return refused('not_found', 'This workspace no longer exists');
        const inviter = invite.inviterUserId
          ? await tx.getRepository(UserEntity).findOneBy({ id: invite.inviterUserId })
          : null;
        return {
          valid: true,
          status: 'pending',
          workspace_name: workspace.name,
          workspace_slug: workspace.slug,
          workspace_id: workspace.id,
          workspace_logo_url: workspace.logoUrl || '',
          inviter_name: inviter ? inviter.fullName || inviter.username : 'The team',
          role: invite.role,
          target_email: invite.email,
          expires_at: invite.expiresAt ? utcIso(invite.expiresAt) : '',
          message: 'Invite is valid',
        };
      }),
  );
}
