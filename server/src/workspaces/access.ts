import type { WorkspaceItem } from '@buyerly/shared';
import { IsNull, MoreThan, type EntityManager } from 'typeorm';
import { rows as query } from '../database.ts';
import {
  UserEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
  WorkspaceSupportGrantEntity,
} from '../entities/index.ts';

// Which workspaces a member may act in (api/deps.py): their memberships, and
// for platform admins the workspaces with an active support grant. Every area
// that takes a workspace from the route resolves it here.

async function activeSupportGrant(tx: EntityManager, userId: number, workspaceId: number): Promise<boolean> {
  return tx.exists(WorkspaceSupportGrantEntity, {
    where: { workspaceId, userId, expiresAt: MoreThan(new Date()), revokedAt: IsNull() },
  });
}

async function isMember(tx: EntityManager, userId: number, workspaceId: number): Promise<boolean> {
  return tx.exists(WorkspaceMemberEntity, { where: { workspaceId, userId } });
}

async function mayAct(tx: EntityManager, user: UserEntity, workspaceId: number): Promise<boolean> {
  if (await isMember(tx, user.id, workspaceId)) return true;
  return user.role === 'admin' && activeSupportGrant(tx, user.id, workspaceId);
}

// The workspace a request acts in: the one named by slug or id, else the
// member's active one, else their first membership (which becomes active).
// Null when the member may not act in it, or has no workspace yet: creating
// one is an explicit onboarding step, never a side effect of a read.
export async function userWorkspace(
  tx: EntityManager,
  user: UserEntity,
  options: { slug?: string; workspaceId?: number } = {},
): Promise<WorkspaceEntity | null> {
  if (options.slug) {
    const workspace = await tx.findOneBy(WorkspaceEntity, { slug: options.slug });
    return workspace && (await mayAct(tx, user, workspace.id)) ? workspace : null;
  }
  if (options.workspaceId) {
    if (!(await mayAct(tx, user, options.workspaceId))) return null;
    return tx.findOneBy(WorkspaceEntity, { id: options.workspaceId });
  }
  if (user.activeWorkspaceId && (await mayAct(tx, user, user.activeWorkspaceId))) {
    const workspace = await tx.findOneBy(WorkspaceEntity, { id: user.activeWorkspaceId });
    if (workspace) return workspace;
  }
  const first = await tx.findOne(WorkspaceMemberEntity, { where: { userId: user.id } });
  if (first) {
    const workspace = await tx.findOneBy(WorkspaceEntity, { id: first.workspaceId });
    if (workspace) {
      await tx.update(UserEntity, { id: user.id }, { activeWorkspaceId: workspace.id });
      user.activeWorkspaceId = workspace.id;
      return workspace;
    }
  }
  return null;
}

// Every workspace the member may open, with live counts, in id order.
export async function userWorkspacesList(tx: EntityManager, user: UserEntity): Promise<WorkspaceItem[]> {
  const active = await userWorkspace(tx, user);
  const rows = await query<{ id: number; role: string | null }>(tx, 
    `SELECT w.id, m.role FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.id`,
    [user.id],
  );
  const roles = new Map<number, string | null>(rows.map((row) => [row.id, row.role]));
  if (user.role === 'admin') {
    const grants = await query<{ id: number; role: string | null }>(tx, 
      `SELECT w.id, g.role FROM workspaces w
         JOIN workspace_support_grants g ON g.workspace_id = w.id
        WHERE g.user_id = $1 AND g.expires_at > $2 AND g.revoked_at IS NULL`,
      [user.id, new Date()],
    );
    for (const grant of grants) if (!roles.has(grant.id)) roles.set(grant.id, grant.role || 'admin');
  }
  if (!roles.size) return [];

  const ids = [...roles.keys()].sort((a, b) => a - b);
  const workspaces = await query<Pick<WorkspaceEntity, 'id' | 'name' | 'slug' | 'badgeText' | 'badgeColor' | 'logoUrl'> & {
    accounts: string;
    members: string;
  }>(tx, 
    `SELECT w.id, w.name, w.slug, w.badge_text AS "badgeText", w.badge_color AS "badgeColor",
            w.logo_url AS "logoUrl",
            (SELECT count(*) FROM accounts a WHERE a.workspace_id = w.id) AS accounts,
            (SELECT count(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS members
       FROM workspaces w
      WHERE w.id = ANY($1)
      ORDER BY w.id`,
    [ids],
  );
  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    badge_text: workspace.badgeText || Array.from(workspace.name).slice(0, 1).join('').toUpperCase(),
    badge_color: workspace.badgeColor || '#F5A300',
    logo_url: workspace.logoUrl || '',
    role: roles.get(workspace.id) || 'owner',
    is_active: workspace.id === active?.id,
    accounts_count: Number(workspace.accounts),
    // Python's `count or 1`: a workspace always has at least its owner.
    members_count: Number(workspace.members) || 1,
  }));
}
