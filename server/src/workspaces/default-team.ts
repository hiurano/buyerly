import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';

// The team every workspace starts with, as Linear's (core/default_team.py):
// the workspace's oldest team neither retired nor deleted is its default
// team, and the people and ad accounts that join the workspace join it too.

const TEAM_NAME_MAX = 48;

// Linear's identifier from a name: its first three letters or digits, upper-cased ("Media buying" → "MED").
export function defaultTeamKey(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^[0-9]+/, '');
  return letters.slice(0, 3) || 'TEAM';
}

export async function createDefaultTeam(tx: EntityManager, workspaceId: number, name: string, creatorUserId: number | null): Promise<number> {
  const teamName = Array.from(name.split(/\s+/u).filter(Boolean).join(' ')).slice(0, TEAM_NAME_MAX).join('') || 'Team';
  const [team] = await rows<{ id: number }>(
    tx,
    `INSERT INTO teams (workspace_id, name, key, description, created_by_user_id, private, created_at, updated_at)
     VALUES ($1, $2, $3, '', $4, false, now(), now()) RETURNING id`,
    [workspaceId, teamName, defaultTeamKey(name), creatorUserId],
  );
  return team.id;
}

export async function joinDefaultTeam(
  tx: EntityManager,
  workspaceId: number | null,
  options: { memberId?: number; accountId?: number; asOwner?: boolean },
): Promise<void> {
  if (workspaceId === null) return;
  const [team] = await rows<{ id: number }>(
    tx,
    `SELECT id FROM teams WHERE workspace_id = $1 AND deleted_at IS NULL AND retired_at IS NULL
      ORDER BY created_at ASC, id ASC LIMIT 1`,
    [workspaceId],
  );
  if (!team) return;
  if (options.memberId !== undefined) {
    await rows(
      tx,
      `INSERT INTO team_members (team_id, member_id, is_owner, joined_at)
       SELECT $1, $2, $3, now() WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = $1 AND member_id = $2) RETURNING id`,
      [team.id, options.memberId, options.asOwner ?? false],
    );
  }
  if (options.accountId !== undefined) {
    await rows(
      tx,
      `INSERT INTO team_accounts (team_id, account_id, created_at)
       SELECT $1, $2, now() WHERE NOT EXISTS (SELECT 1 FROM team_accounts WHERE team_id = $1 AND account_id = $2) RETURNING id`,
      [team.id, options.accountId],
    );
  }
}

// The workspace a member who has none left lands in (members.py, on leaving
// or removal): "Buyerly", owned by them, with its default team; made active.
export async function personalWorkspace(tx: EntityManager, userId: number): Promise<number> {
  const [workspace] = await rows<{ id: number; name: string }>(
    tx,
    `INSERT INTO workspaces (name, slug, badge_text, badge_color, logo_url, owner_user_id, created_at, updated_at)
     VALUES ('Buyerly', $1, 'B', '#F5A300', '', $2, now(), now()) RETURNING id, name`,
    [`buyerly-${userId}`, userId],
  );
  const [member] = await rows<{ id: number }>(
    tx,
    `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', now()) RETURNING id`,
    [workspace.id, userId],
  );
  await createDefaultTeam(tx, workspace.id, workspace.name, userId);
  await joinDefaultTeam(tx, workspace.id, { memberId: member.id, asOwner: true });
  await rows(tx, 'UPDATE users SET active_workspace_id = $1 WHERE id = $2 RETURNING id', [workspace.id, userId]);
  return workspace.id;
}
