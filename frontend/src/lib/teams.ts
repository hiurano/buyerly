import { useCallback, useEffect, useMemo } from 'react';
import { graphql } from '@/lib/graphql';
import { pool } from '@/models/pool';
import { teamsQuery } from '@/models/queries';
import { usePoolQuery } from '@/models/usePool';
import { usePageTeamKey } from '@/lib/pageScope';

/** One team as the `teams` query returns it (#371). */
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
  /** Linear's team owners; the workspace's owner and admins run every team besides. */
  owner_user_ids: number[];
  account_ids: number[];
  is_member: boolean;
  /** Linear's private team: only its members see it and its ad accounts. */
  private: boolean;
}

/** Linear's filter on Settings → Teams. */
export type TeamFilter = 'active' | 'retired' | 'deleted';
export const TEAM_FILTER_LABELS: Record<TeamFilter, string> = {
  active: 'Active',
  retired: 'Retired',
  deleted: 'Recently deleted',
};

export const TEAM_NAME_MAX = 48;
export const TEAM_KEY_MAX = 7;
export const TEAM_DESCRIPTION_MAX = 255;

const TEAM_PAYLOAD = '{ success lastSyncId team }';

async function teamMutation<T = TeamItem>(document: string, variables: Record<string, unknown>): Promise<T> {
  return (await graphql<{ team: T }>(document, variables)).team;
}

export const createTeam = (workspaceId: number, input: { name: string; key: string; private: boolean }) => teamMutation(
  `mutation TeamCreate($workspaceId: Int!, $input: JSON!) { teamCreate(workspaceId: $workspaceId, input: $input) ${TEAM_PAYLOAD} }`,
  { workspaceId, input },
);

export const updateTeam = (workspaceId: number, id: number, input: Partial<TeamItem>) => teamMutation(
  `mutation TeamUpdate($workspaceId: Int!, $id: Int!, $input: JSON!) { teamUpdate(workspaceId: $workspaceId, id: $id, input: $input) ${TEAM_PAYLOAD} }`,
  { workspaceId, id, input },
);

export const retireTeam = (workspaceId: number, id: number) => teamMutation(
  `mutation TeamRetire($workspaceId: Int!, $id: Int!) { teamRetire(workspaceId: $workspaceId, id: $id) ${TEAM_PAYLOAD} }`,
  { workspaceId, id },
);

export const restoreTeam = (workspaceId: number, id: number) => teamMutation(
  `mutation TeamRestore($workspaceId: Int!, $id: Int!) { teamRestore(workspaceId: $workspaceId, id: $id) ${TEAM_PAYLOAD} }`,
  { workspaceId, id },
);

export const deleteTeam = (workspaceId: number, id: number) => teamMutation<unknown>(
  `mutation TeamDelete($workspaceId: Int!, $id: Int!) { teamDelete(workspaceId: $workspaceId, id: $id) ${TEAM_PAYLOAD} }`,
  { workspaceId, id },
);

export const addTeamMembers = (workspaceId: number, teamId: number, userIds: number[]) => teamMutation<unknown>(
  `mutation TeamMembersAdd($workspaceId: Int!, $teamId: Int!, $input: JSON!) {
    teamMembersAdd(workspaceId: $workspaceId, teamId: $teamId, input: $input) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, input: { user_ids: userIds } },
);

export const removeTeamMember = (workspaceId: number, teamId: number, userId: number) => teamMutation<unknown>(
  `mutation TeamMemberRemove($workspaceId: Int!, $teamId: Int!, $userId: Int!) {
    teamMemberRemove(workspaceId: $workspaceId, teamId: $teamId, userId: $userId) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, userId },
);

/** Linear's "Make team owner" / "Remove team owner". */
export const setTeamOwner = (workspaceId: number, teamId: number, userId: number, isOwner: boolean) => teamMutation<unknown>(
  `mutation TeamMemberUpdate($workspaceId: Int!, $teamId: Int!, $userId: Int!, $input: JSON!) {
    teamMemberUpdate(workspaceId: $workspaceId, teamId: $teamId, userId: $userId, input: $input) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, userId, input: { is_owner: isOwner } },
);

export const addTeamAccounts = (workspaceId: number, teamId: number, accountIds: number[]) => teamMutation<unknown>(
  `mutation TeamAccountsAdd($workspaceId: Int!, $teamId: Int!, $input: JSON!) {
    teamAccountsAdd(workspaceId: $workspaceId, teamId: $teamId, input: $input) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, input: { account_ids: accountIds } },
);

export const removeTeamAccount = (workspaceId: number, teamId: number, accountId: number) => teamMutation<unknown>(
  `mutation TeamAccountRemove($workspaceId: Int!, $teamId: Int!, $accountId: Int!) {
    teamAccountRemove(workspaceId: $workspaceId, teamId: $teamId, accountId: $accountId) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, accountId },
);

/**
 * Linear fills the identifier from the name as it is typed: its first three
 * letters or digits, upper-cased ("Media buying" → "MED").
 */
export function suggestTeamKey(name: string): string {
  const letters = name.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return letters.replace(/^[0-9]+/, '').slice(0, 3);
}

/** The identifier as the field keeps it: letters and digits only, upper-cased, at most seven. */
export const cleanTeamKey = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, TEAM_KEY_MAX);

const CHANGED_EVENT = 'buyerly:teams-changed';

/** Tells every open list of teams (the Teams page, "Your teams") to read them again. */
export function notifyTeamsChanged(): void {
  pool.invalidate('teams:');
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * A workspace's teams from the pool: one read shared by everyone asking at
 * once (the sidebar, the page title and the page itself, #489), and none at
 * all while the held teams are current (#488).
 */
export function readTeams(workspaceId: number, status: 'all' | 'deleted' = 'all'): Promise<TeamItem[]> {
  return pool.read(teamsQuery(workspaceId, status));
}

const keepTeam = (filter: TeamFilter | 'all') => (team: TeamItem) => (
  filter === 'active' ? !team.retired_at : filter === 'retired' ? Boolean(team.retired_at) : true
);

export function useTeams(workspaceId: number, filter: TeamFilter | 'all' = 'all') {
  // Active and retired are the API's own filters of `all`, in the same order, so they share its read.
  const query = teamsQuery(workspaceId, filter === 'deleted' ? 'deleted' : 'all');
  const { data, error } = usePoolQuery(query);
  const teams = useMemo(() => (data ? data.filter(keepTeam(filter)) : null), [data, filter]);

  const refresh = useCallback(async () => {
    await pool.fetch(teamsQuery(workspaceId, filter === 'deleted' ? 'deleted' : 'all'));
  }, [filter, workspaceId]);

  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, [refresh]);

  return { teams, error: teams ? '' : error, refresh };
}

/** "1 member", "3 members"; "1 ad account", "2 ad accounts". */
export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The team whose pages are on screen (/team/<KEY>/…), as Linear's team Issues
 * and Projects: `team` is null on the workspace's own pages; `missing` when the
 * address names no team of this workspace.
 */
export function useActiveTeam(workspaceId: number) {
  // The page's own team: the one it was opened for, while the next page gets ready (#490).
  const key = usePageTeamKey();
  const { teams, error } = useTeams(workspaceId, 'all');
  const team = key && teams ? teams.find((item) => item.key === key) ?? null : null;
  return {
    key,
    team,
    loading: Boolean(key) && teams === null && !error,
    missing: Boolean(key) && (teams !== null || Boolean(error)) && team === null,
  };
}

/** Ad accounts of a team, by Meta id ("act_…"): the accounts its pages show. */
export function teamAccountIds(team: TeamItem, accounts: { id?: number; account_id: string }[]): Set<string> {
  return new Set(accounts.filter((account) => account.id !== undefined && team.account_ids.includes(account.id)).map((account) => account.account_id));
}

/** A document on a team's Home (Linear's team Documents). */
export interface TeamDocument {
  id: number;
  team_id: number;
  title: string;
  content: string;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_PAYLOAD = '{ success lastSyncId teamDocument }';

async function documentMutation(document: string, variables: Record<string, unknown>): Promise<TeamDocument> {
  return (await graphql<{ teamDocument: TeamDocument }>(document, variables)).teamDocument;
}

export const createTeamDocument = (workspaceId: number, teamId: number, input: { title: string; content: string }) => documentMutation(
  `mutation TeamDocumentCreate($workspaceId: Int!, $teamId: Int!, $input: JSON!) {
    teamDocumentCreate(workspaceId: $workspaceId, teamId: $teamId, input: $input) ${DOCUMENT_PAYLOAD}
  }`,
  { workspaceId, teamId, input },
);

export const updateTeamDocument = (workspaceId: number, teamId: number, id: number, input: Partial<Pick<TeamDocument, 'title' | 'content'>>) => documentMutation(
  `mutation TeamDocumentUpdate($workspaceId: Int!, $teamId: Int!, $id: Int!, $input: JSON!) {
    teamDocumentUpdate(workspaceId: $workspaceId, teamId: $teamId, id: $id, input: $input) ${DOCUMENT_PAYLOAD}
  }`,
  { workspaceId, teamId, id, input },
);

export const deleteTeamDocument = (workspaceId: number, teamId: number, id: number) => documentMutation(
  `mutation TeamDocumentDelete($workspaceId: Int!, $teamId: Int!, $id: Int!) {
    teamDocumentDelete(workspaceId: $workspaceId, teamId: $teamId, id: $id) ${DOCUMENT_PAYLOAD}
  }`,
  { workspaceId, teamId, id },
);

/** A document's name in lists and headers; Linear shows "Untitled" for one without a title. */
export const documentTitle = (document: Pick<TeamDocument, 'title'>) => document.title.trim() || 'Untitled';

/**
 * Who runs a team, as in Linear: its team owners, and the workspace's owner and
 * admins for every team. Guests never do.
 */
export function canManageTeam(team: Pick<TeamItem, 'owner_user_ids'>, workspaceRole: string, userId: number | null | undefined): boolean {
  if (workspaceRole === 'owner' || workspaceRole === 'admin') return true;
  if (workspaceRole === 'guest' || userId == null) return false;
  return (team.owner_user_ids ?? []).includes(userId);
}
