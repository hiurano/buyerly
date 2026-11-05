import type { EntityManager } from 'typeorm';
import type { ActingMember } from './access.ts';

// Which ad accounts a workspace member may see, as Linear's teams decide
// (core/account_access.py). Ad accounts take the place of Linear's issues:
// - an account on at least one public team, or on no team, is visible to
//   every member who is not a guest;
// - an account only on private teams is visible to the members of those
//   teams, whatever their workspace role;
// - a guest sees only the accounts of the teams they are on.

export interface AccountAccess {
  // No account is hidden; otherwise only the listed ones are visible.
  everything: boolean;
  pks: Set<number>;
  actIds: Set<string>;
}

export const EVERYTHING: AccountAccess = { everything: true, pks: new Set(), actIds: new Set() };

export function allowsAccount(access: AccountAccess, actId: string | null | undefined): boolean {
  return access.everything || (!!actId && access.actIds.has(actId));
}

export function allowsAccountPk(access: AccountAccess, pk: number | null | undefined): boolean {
  return access.everything || (pk != null && access.pks.has(pk));
}

// The accounts `member` sees in `workspaceId`; no membership row (a support
// session) sees everything.
export async function accountAccess(tx: EntityManager, member: ActingMember | null, workspaceId: number | null): Promise<AccountAccess> {
  if (workspaceId === null || member === null || member.id === null) return EVERYTHING;
  const guest = member.role === 'guest';
  const privateTeams = await tx.query<unknown[]>(
    'SELECT 1 FROM teams WHERE workspace_id = $1 AND deleted_at IS NULL AND private IS TRUE LIMIT 1',
    [workspaceId],
  );
  if (!guest && privateTeams.length === 0) return EVERYTHING;

  const mine = new Set((await tx.query<{ team_id: number }[]>(
    `SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE tm.member_id = $1 AND t.workspace_id = $2 AND t.deleted_at IS NULL`,
    [member.id, workspaceId],
  )).map((row) => row.team_id));
  const links = await tx.query<{ account_id: number; team_id: number; private: boolean | null }[]>(
    `SELECT ta.account_id, t.id AS team_id, t.private FROM team_accounts ta JOIN teams t ON t.id = ta.team_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL`,
    [workspaceId],
  );
  const teamsOf = new Map<number, { teamId: number; private: boolean }[]>();
  for (const link of links) {
    const teams = teamsOf.get(link.account_id) ?? [];
    teams.push({ teamId: link.team_id, private: !!link.private });
    teamsOf.set(link.account_id, teams);
  }
  const accounts = await tx.query<{ id: number; account_id: string }[]>(
    'SELECT id, account_id FROM accounts WHERE workspace_id = $1',
    [workspaceId],
  );
  const access: AccountAccess = { everything: false, pks: new Set(), actIds: new Set() };
  for (const account of accounts) {
    const teams = teamsOf.get(account.id) ?? [];
    const onMine = teams.some((team) => mine.has(team.teamId));
    const visible = guest ? onMine : teams.length === 0 || teams.some((team) => !team.private) || onMine;
    if (visible) {
      access.pks.add(account.id);
      access.actIds.add(account.account_id);
    }
  }
  return access;
}
