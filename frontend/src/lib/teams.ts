import { useCallback, useEffect, useMemo } from 'react';
import { graphql } from '@/lib/graphql';
import { pool } from '@/models/pool';
import { teamDocumentsQuery, teamsQuery } from '@/models/queries';
import { sync } from '@/models/sync';
import { transactions } from '@/models/transactions';
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

/**
 * A write to one team as a transaction (#508): every list of teams shows
 * `change` at once, and drops it again if the server refuses. Settles with
 * the team as the server holds it; the caller says why it failed.
 */
async function teamWrite<T = TeamItem>(
  teamId: number, label: string, document: string, variables: Record<string, unknown>,
  change: (team: TeamItem) => Partial<TeamItem>,
): Promise<T> {
  const team = pool.record<TeamItem>('team', teamId);
  const answer = await transactions.commit<{ team: T }>({
    label,
    mutation: document,
    variables,
    changes: team ? [{ kind: 'update', type: 'team', id: String(teamId), data: change(team) }] : [],
    quiet: true,
  });
  return answer.team;
}

export const updateTeam = (workspaceId: number, id: number, input: Partial<TeamItem>) => teamWrite(
  id, "Couldn't update the team",
  `mutation TeamUpdate($workspaceId: Int!, $id: Int!, $input: JSON!) { teamUpdate(workspaceId: $workspaceId, id: $id, input: $input) ${TEAM_PAYLOAD} }`,
  { workspaceId, id, input },
  () => input,
);

export const retireTeam = (workspaceId: number, id: number) => teamWrite(
  id, "Couldn't retire the team",
  `mutation TeamRetire($workspaceId: Int!, $id: Int!) { teamRetire(workspaceId: $workspaceId, id: $id) ${TEAM_PAYLOAD} }`,
  { workspaceId, id },
  () => ({ retired_at: new Date().toISOString() }),
);

export const restoreTeam = (workspaceId: number, id: number) => teamWrite(
  id, "Couldn't restore the team",
  `mutation TeamRestore($workspaceId: Int!, $id: Int!) { teamRestore(workspaceId: $workspaceId, id: $id) ${TEAM_PAYLOAD} }`,
  { workspaceId, id },
  () => ({ retired_at: null }),
);

export const deleteTeam = (workspaceId: number, id: number) => teamMutation<unknown>(
  `mutation TeamDelete($workspaceId: Int!, $id: Int!) { teamDelete(workspaceId: $workspaceId, id: $id) ${TEAM_PAYLOAD} }`,
  { workspaceId, id },
);

const without = (ids: number[], id: number) => ids.filter((item) => item !== id);

export const addTeamMembers = (workspaceId: number, teamId: number, userIds: number[]) => teamWrite<unknown>(
  teamId, "Couldn't add to the team",
  `mutation TeamMembersAdd($workspaceId: Int!, $teamId: Int!, $input: JSON!) {
    teamMembersAdd(workspaceId: $workspaceId, teamId: $teamId, input: $input) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, input: { user_ids: userIds } },
  (team) => {
    const added = userIds.filter((id) => !team.member_user_ids.includes(id));
    const me = sync.userId;
    return {
      member_user_ids: [...team.member_user_ids, ...added],
      ...(me !== null && added.includes(me) ? { is_member: true } : {}),
    };
  },
);

export const removeTeamMember = (workspaceId: number, teamId: number, userId: number) => teamWrite<unknown>(
  teamId, "Couldn't remove from the team",
  `mutation TeamMemberRemove($workspaceId: Int!, $teamId: Int!, $userId: Int!) {
    teamMemberRemove(workspaceId: $workspaceId, teamId: $teamId, userId: $userId) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, userId },
  (team) => ({
    member_user_ids: without(team.member_user_ids, userId),
    owner_user_ids: without(team.owner_user_ids, userId),
    ...(userId === sync.userId ? { is_member: false } : {}),
  }),
);

/** Linear's "Make team owner" / "Remove team owner". */
export const setTeamOwner = (workspaceId: number, teamId: number, userId: number, isOwner: boolean) => teamWrite<unknown>(
  teamId, "Couldn't change the team owner",
  `mutation TeamMemberUpdate($workspaceId: Int!, $teamId: Int!, $userId: Int!, $input: JSON!) {
    teamMemberUpdate(workspaceId: $workspaceId, teamId: $teamId, userId: $userId, input: $input) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, userId, input: { is_owner: isOwner } },
  (team) => ({ owner_user_ids: isOwner ? [...without(team.owner_user_ids, userId), userId] : without(team.owner_user_ids, userId) }),
);

export const addTeamAccounts = (workspaceId: number, teamId: number, accountIds: number[]) => teamWrite<unknown>(
  teamId, "Couldn't add the ad accounts",
  `mutation TeamAccountsAdd($workspaceId: Int!, $teamId: Int!, $input: JSON!) {
    teamAccountsAdd(workspaceId: $workspaceId, teamId: $teamId, input: $input) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, input: { account_ids: accountIds } },
  (team) => ({ account_ids: [...team.account_ids, ...accountIds.filter((id) => !team.account_ids.includes(id))] }),
);

export const removeTeamAccount = (workspaceId: number, teamId: number, accountId: number) => teamWrite<unknown>(
  teamId, "Couldn't remove the ad account",
  `mutation TeamAccountRemove($workspaceId: Int!, $teamId: Int!, $accountId: Int!) {
    teamAccountRemove(workspaceId: $workspaceId, teamId: $teamId, accountId: $accountId) ${TEAM_PAYLOAD}
  }`,
  { workspaceId, teamId, accountId },
  (team) => ({ account_ids: without(team.account_ids, accountId) }),
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

let standIns = 0;

/**
 * A new document: first in its team's list at once, as the server made it
 * once it answers (#508); the caller opens it by its real id.
 */
export async function createTeamDocument(workspaceId: number, teamId: number, input: { title: string; content: string }): Promise<TeamDocument> {
  const now = new Date().toISOString();
  const standIn: TeamDocument = {
    id: -(standIns += 1), team_id: teamId, ...input,
    created_by_user_id: sync.userId, updated_by_user_id: sync.userId, created_at: now, updated_at: now,
  };
  const answer = await transactions.commit<{ teamDocument: TeamDocument }>({
    label: "Couldn't create the document",
    mutation: `mutation TeamDocumentCreate($workspaceId: Int!, $teamId: Int!, $input: JSON!) {
      teamDocumentCreate(workspaceId: $workspaceId, teamId: $teamId, input: $input) ${DOCUMENT_PAYLOAD}
    }`,
    variables: { workspaceId, teamId, input },
    changes: [{
      kind: 'insert', type: 'teamDocument', id: String(standIn.id), record: { ...standIn },
      list: teamDocumentsQuery(workspaceId, teamId).key, first: true,
    }],
    created: 'teamDocument',
    quiet: true,
  });
  return answer.teamDocument;
}

/** A document's title or text: on every page showing it at once, then written. */
export async function updateTeamDocument(
  workspaceId: number, teamId: number, id: number, input: Partial<Pick<TeamDocument, 'title' | 'content'>>,
): Promise<TeamDocument> {
  const answer = await transactions.commit<{ teamDocument: TeamDocument }>({
    label: "Couldn't save the document",
    mutation: `mutation TeamDocumentUpdate($workspaceId: Int!, $teamId: Int!, $id: Int!, $input: JSON!) {
      teamDocumentUpdate(workspaceId: $workspaceId, teamId: $teamId, id: $id, input: $input) ${DOCUMENT_PAYLOAD}
    }`,
    variables: { workspaceId, teamId, id, input },
    changes: [{ kind: 'update', type: 'teamDocument', id: String(id), data: { ...input, updated_at: new Date().toISOString() } }],
    quiet: true,
  });
  return answer.teamDocument;
}

/** Gone from its team's list at once; back if the server refuses. */
export async function deleteTeamDocument(workspaceId: number, teamId: number, id: number): Promise<TeamDocument> {
  const answer = await transactions.commit<{ teamDocument: TeamDocument }>({
    label: "Couldn't delete the document",
    mutation: `mutation TeamDocumentDelete($workspaceId: Int!, $teamId: Int!, $id: Int!) {
      teamDocumentDelete(workspaceId: $workspaceId, teamId: $teamId, id: $id) ${DOCUMENT_PAYLOAD}
    }`,
    variables: { workspaceId, teamId, id },
    changes: [{ kind: 'delete', type: 'teamDocument', id: String(id) }],
    quiet: true,
  });
  return answer.teamDocument;
}

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
