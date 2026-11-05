import type { EntityManager } from 'typeorm';
import { rows } from '../../../database.ts';
import type { UserEntity } from '../../../entities/index.ts';
import { userWorkspaceMember, type ActingMember } from '../../../workspaces/access.ts';
import { isoUtc } from '../../../workspaces/sql.ts';
import { RouteError } from '../../errors.ts';

// Teams as api/routers/teams.py keeps them (Linear's Settings → Teams, #371):
// every member reads them, the owner, admins and a team's owners run them,
// a deleted team can be restored for TEAM_RESTORE_DAYS.

export const TEAM_RESTORE_DAYS = 30;
const TEAM_KEY_PATTERN = /^[A-Z][A-Z0-9]{0,6}$/;

export interface TeamRow {
  id: number;
  name: string;
  key: string;
  description: string | null;
  private: boolean;
  created_at: string;
  retired_at: string | null;
  deleted_at: string | null;
  restorable_until: string | null;
}

// TeamItem (api/schemas/teams.py).
export interface TeamItem {
  id: number;
  name: string;
  key: string;
  description: string;
  created_at: string;
  retired_at: string | null;
  deleted_at: string | null;
  restorable_until: string | null;
  member_user_ids: number[];
  owner_user_ids: number[];
  account_ids: number[];
  is_member: boolean;
  private: boolean;
}

export const TEAM_COLUMNS = `t.id, t.name, t.key, t.description, t.private,
  ${isoUtc('t.created_at')} AS created_at,
  ${isoUtc('t.retired_at')} AS retired_at,
  ${isoUtc('t.deleted_at')} AS deleted_at,
  ${isoUtc(`(t.deleted_at + interval '${TEAM_RESTORE_DAYS} days')`)} AS restorable_until`;

// Python's " ".join(value.split()): whitespace runs become one space.
export function cleanName(value: string): string {
  // \x1c-\x1f are whitespace to Python's str.split(), not to \s.
  // eslint-disable-next-line no-control-regex
  const name = value.split(/[\s\u001c-\u001f\u0085]+/u).filter(Boolean).join(' ');
  if (!name) throw new RouteError(400, "Team name can't be empty");
  return name;
}

export function cleanKey(value: string): string {
  const key = value.trim().toUpperCase();
  if (!key) throw new RouteError(400, "Team identifier can't be empty");
  if (!TEAM_KEY_PATTERN.test(key)) {
    throw new RouteError(400, 'Team identifier must be 1–7 letters or digits and start with a letter');
  }
  return key;
}

export async function workspaceRole(tx: EntityManager, user: UserEntity, workspaceId: number): Promise<ActingMember> {
  const found = await userWorkspaceMember(tx, user, { workspaceId });
  if (!found) throw new RouteError(404, 'Workspace not found');
  return found.member;
}

async function ownsTeam(tx: EntityManager, member: ActingMember, teamId: number): Promise<boolean> {
  if (member.id === null) return false;
  const found = await rows(tx, 'SELECT 1 FROM team_members WHERE team_id = $1 AND member_id = $2 AND is_owner IS TRUE LIMIT 1', [teamId, member.id]);
  return found.length > 0;
}

// Linear's team owners run their team; workspace owners and admins run every team.
export async function requireTeamManager(tx: EntityManager, member: ActingMember, teamId: number): Promise<void> {
  if (member.role === 'owner' || member.role === 'admin') return;
  if (await ownsTeam(tx, member, teamId)) return;
  throw new RouteError(403, 'Only team owners and workspace admins can manage this team');
}

export async function purgeExpired(tx: EntityManager, workspaceId: number): Promise<void> {
  await rows(
    tx,
    `DELETE FROM teams WHERE workspace_id = $1 AND deleted_at IS NOT NULL AND deleted_at < now() - interval '${TEAM_RESTORE_DAYS} days' RETURNING id`,
    [workspaceId],
  );
}

// A team of the workspace: a live one, or with `deleted` one in Recently deleted, or with `any` either.
export async function loadTeam(
  tx: EntityManager,
  workspaceId: number,
  teamId: number,
  state: 'live' | 'deleted' | 'any' = 'live',
): Promise<TeamRow> {
  const condition = state === 'any' ? '' : state === 'deleted' ? 'AND t.deleted_at IS NOT NULL' : 'AND t.deleted_at IS NULL';
  const [team] = await rows<TeamRow>(tx, `SELECT ${TEAM_COLUMNS} FROM teams t WHERE t.id = $1 AND t.workspace_id = $2 ${condition}`, [teamId, workspaceId]);
  if (!team) throw new RouteError(404, 'Team not found');
  return team;
}

// Linear's own messages for a name or identifier another team already uses.
export async function ensureUnique(tx: EntityManager, workspaceId: number, name: string, key: string, excludeId: number | null = null): Promise<void> {
  const base = 'SELECT 1 FROM teams WHERE workspace_id = $1 AND deleted_at IS NULL AND ($3::int IS NULL OR id <> $3)';
  if ((await rows(tx, `${base} AND lower(name) = $2 LIMIT 1`, [workspaceId, name.toLowerCase(), excludeId])).length) {
    throw new RouteError(409, 'A team with this name already exists');
  }
  if ((await rows(tx, `${base} AND upper(key) = $2 LIMIT 1`, [workspaceId, key, excludeId])).length) {
    throw new RouteError(409, 'A team with this identifier already exists');
  }
}

export async function teamItems(tx: EntityManager, teams: TeamRow[], user: UserEntity): Promise<TeamItem[]> {
  const ids = teams.map((team) => team.id);
  const members = new Map<number, number[]>(ids.map((id) => [id, []]));
  const owners = new Map<number, number[]>(ids.map((id) => [id, []]));
  const accounts = new Map<number, number[]>(ids.map((id) => [id, []]));
  if (ids.length) {
    const memberRows = await rows<{ team_id: number; user_id: number; is_owner: boolean }>(
      tx,
      `SELECT tm.team_id, wm.user_id, tm.is_owner FROM team_members tm
         JOIN workspace_members wm ON wm.id = tm.member_id
        WHERE tm.team_id = ANY($1) ORDER BY tm.joined_at ASC, tm.id ASC`,
      [ids],
    );
    for (const row of memberRows) {
      members.get(row.team_id)!.push(row.user_id);
      if (row.is_owner) owners.get(row.team_id)!.push(row.user_id);
    }
    const accountRows = await rows<{ team_id: number; account_id: number }>(
      tx,
      'SELECT team_id, account_id FROM team_accounts WHERE team_id = ANY($1) ORDER BY created_at ASC, id ASC',
      [ids],
    );
    for (const row of accountRows) accounts.get(row.team_id)!.push(row.account_id);
  }
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    key: team.key,
    description: team.description || '',
    created_at: team.created_at,
    retired_at: team.retired_at,
    deleted_at: team.deleted_at,
    restorable_until: team.restorable_until,
    member_user_ids: members.get(team.id)!,
    owner_user_ids: owners.get(team.id)!,
    account_ids: accounts.get(team.id)!,
    is_member: members.get(team.id)!.includes(user.id),
    private: Boolean(team.private),
  }));
}

export async function teamItem(tx: EntityManager, teamId: number, workspaceId: number, user: UserEntity): Promise<TeamItem> {
  const team = await loadTeam(tx, workspaceId, teamId, 'any');
  return (await teamItems(tx, [team], user))[0];
}

// A team's documents are read and written by everyone but guests for a public
// team, and by its members for a private one; a guest works only in the teams they're on.
export async function requireTeamContent(tx: EntityManager, member: ActingMember, team: TeamRow): Promise<void> {
  if (!team.private && member.role !== 'guest') return;
  const onTeam = member.id !== null
    && (await rows(tx, 'SELECT 1 FROM team_members WHERE team_id = $1 AND member_id = $2 LIMIT 1', [team.id, member.id])).length > 0;
  if (!onTeam) throw new RouteError(404, 'Team not found');
}

// TeamDocumentItem (api/schemas/teams.py).
export const DOCUMENT_COLUMNS = `id, team_id, coalesce(title, '') AS title, coalesce(content, '') AS content,
  created_by_user_id, updated_by_user_id,
  ${isoUtc('created_at')} AS created_at, ${isoUtc('updated_at')} AS updated_at`;

export interface TeamDocumentItem {
  id: number;
  team_id: number;
  title: string;
  content: string;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}
