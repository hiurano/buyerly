import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql';
import type { EntityManager } from 'typeorm';
import { recordAuditEvent, userActorId, utcIsoSql } from '../../../audit/events.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { RouteError } from '../../errors.ts';
import { inputSchema } from '../../input.ts';
import { SuccessPayload, SupportSessionPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';

// Platform administration (api/routers/admin_support.py and auth.py
// get_admin_overview): the whole-platform overview, and support sessions, a
// platform admin's time-limited access to one workspace with a reason
// (workspaces/access.ts honours an active grant). Both are for users whose
// role is "admin" only; each grant and revocation is a SECURITY audit event.

function requireAdmin(user: UserEntity, detail: string): void {
  if (user.role !== 'admin') throw new RouteError(403, detail);
}

const PLATFORM_ADMIN_ONLY = 'Platform global administrator rights are required';

interface CreateSupportSession {
  workspace_id: number;
  reason: string;
  duration_minutes?: number;
}

// CreateSupportSessionRequest.
const CREATE = inputSchema<CreateSupportSession>({
  type: 'object',
  required: ['workspace_id', 'reason'],
  properties: {
    workspace_id: { type: 'integer' },
    reason: { type: 'string', minLength: 10, maxLength: 500 },
    duration_minutes: { type: 'integer', minimum: 5, maximum: 240 },
  },
});

// Python's str.strip(): whitespace as str.isspace() knows it.
const SPACE = '[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const STRIP = new RegExp(`^${SPACE}+|${SPACE}+$`, 'g');

// SupportSessionItem.
const GRANT_COLUMNS = `g.id, g.workspace_id, w.name AS workspace_name, g.user_id, g.role, g.reason,
  ${isoUtc('g.expires_at')} AS expires_at, ${isoUtc('g.created_at')} AS created_at,
  ${isoUtc('g.revoked_at')} AS revoked_at, (g.revoked_at IS NULL AND g.expires_at > now()) AS is_active`;

interface GrantRow {
  id: number;
  workspace_id: number;
  workspace_name: string;
  user_id: number;
  role: string;
  reason: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  is_active: boolean;
}

async function grants(tx: EntityManager, where: string, params: unknown[]): Promise<GrantRow[]> {
  return tx.query<GrantRow[]>(
    `SELECT ${GRANT_COLUMNS} FROM workspace_support_grants g JOIN workspaces w ON w.id = g.workspace_id
      WHERE ${where} ORDER BY g.created_at DESC`,
    params,
  );
}

@Resolver()
export class SupportResolver {
  @Query(() => JSONScalar, { description: 'Every user, workspace, membership and invite, for a platform administrator.' })
  async adminOverview(@Ctx() { app, user }: GraphQLContext): Promise<unknown> {
    requireAdmin(user, 'Administrators only');
    return app.db.transaction(async (tx) => ({
      users: await tx.query<unknown[]>(
        `SELECT id, username, full_name, coalesce(first_name, '') AS first_name, coalesce(last_name, '') AS last_name,
                email, role, is_approved, onboarding_completed, active_workspace_id, ${utcIsoSql('created_at')} AS created_at
           FROM users ORDER BY id`,
      ),
      workspaces: await tx.query<unknown[]>(
        `SELECT id, name, slug, badge_text, badge_color, owner_user_id, ${utcIsoSql('created_at')} AS created_at
           FROM workspaces ORDER BY id`,
      ),
      members: await tx.query<unknown[]>(
        `SELECT workspace_id, user_id, role, ${utcIsoSql('joined_at')} AS joined_at FROM workspace_members ORDER BY id`,
      ),
      invites: await tx.query<unknown[]>(
        `SELECT id, workspace_id, email, role, status, ${utcIsoSql('created_at')} AS created_at
           FROM workspace_invites ORDER BY id`,
      ),
    }));
  }

  @Query(() => JSONScalar, { description: "The platform administrator's support sessions, newest first." })
  async supportSessions(
    @Ctx() { app, user }: GraphQLContext,
    @Arg('activeOnly', () => Boolean, { defaultValue: true }) activeOnly: boolean,
  ): Promise<unknown> {
    requireAdmin(user, PLATFORM_ADMIN_ONLY);
    return app.db.transaction((tx) => grants(
      tx,
      `g.user_id = $1${activeOnly ? ' AND g.expires_at > now() AND g.revoked_at IS NULL' : ''}`,
      [user.id],
    ));
  }

  @Mutation(() => SupportSessionPayload, {
    nullable: true,
    description: 'Opens a time-limited support session in a workspace for a platform administrator.',
  })
  async supportSessionCreate(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { user } = context;
    requireAdmin(user, PLATFORM_ADMIN_ONLY);
    const req = CREATE.parse(input);
    const minutes = req.duration_minutes ?? 30;
    const reason = req.reason.replace(STRIP, '');
    const grant = await context.app.db.transaction(async (tx) => {
      const [workspace] = await tx.query<{ id: number; name: string }[]>(
        'SELECT id, name FROM workspaces WHERE id = $1',
        [req.workspace_id],
      );
      if (!workspace) throw new RouteError(404, 'Target workspace not found');
      // One active grant per admin and workspace: a new one ends the others.
      await tx.query<unknown[]>(
        `UPDATE workspace_support_grants SET revoked_at = now()
          WHERE workspace_id = $1 AND user_id = $2 AND expires_at > now() AND revoked_at IS NULL`,
        [workspace.id, user.id],
      );
      const [{ id }] = await tx.query<{ id: number }[]>(
        `INSERT INTO workspace_support_grants (workspace_id, user_id, role, reason, expires_at, created_at)
         VALUES ($1, $2, 'admin', $3, now() + make_interval(mins => $4), now()) RETURNING id`,
        [workspace.id, user.id, reason, minutes],
      );
      const [row] = await grants(tx, 'g.id = $1', [id]);
      await recordAuditEvent(tx, {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        actorType: 'user',
        actorId: userActorId(user),
        category: 'SECURITY',
        eventType: 'SUPPORT_SESSION_GRANTED',
        status: 'SUCCESS',
        action: 'CREATE_SUPPORT_SESSION',
        message: `Support session created for workspace '${workspace.name}' for ${minutes} min. Reason: ${reason}`,
        details: {
          grant_id: id,
          workspace_id: workspace.id,
          workspace_name: workspace.name,
          duration_minutes: minutes,
          expires_at: row.expires_at,
          reason,
        },
      });
      return { ...row, is_active: true };
    });
    return mutated(context, SupportSessionPayload, grant);
  }

  @Mutation(() => SuccessPayload, { nullable: true, description: 'Ends a support session early.' })
  async supportSessionRevoke(@Arg('id', () => Int) id: number, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { user } = context;
    requireAdmin(user, PLATFORM_ADMIN_ONLY);
    await context.app.db.transaction(async (tx) => {
      const [grant] = await tx.query<{ id: number; workspace_id: number; revoked: boolean }[]>(
        `SELECT id, workspace_id, revoked_at IS NOT NULL AS revoked FROM workspace_support_grants
          WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [id, user.id],
      );
      if (!grant) throw new RouteError(404, 'Support session not found');
      if (grant.revoked) return;
      await tx.query('UPDATE workspace_support_grants SET revoked_at = now() WHERE id = $1', [grant.id]);
      await recordAuditEvent(tx, {
        workspaceId: grant.workspace_id,
        ownerUserId: user.id,
        actorType: 'user',
        actorId: userActorId(user),
        category: 'SECURITY',
        eventType: 'SUPPORT_SESSION_REVOKED',
        status: 'SUCCESS',
        action: 'REVOKE_SUPPORT_SESSION',
        message: `Support session #${grant.id} was revoked by an administrator.`,
        details: { grant_id: grant.id, workspace_id: grant.workspace_id },
      });
    });
    return mutated(context, SuccessPayload);
  }
}
