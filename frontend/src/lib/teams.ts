import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAppStore } from '@/store/useAppStore';

/** One team as GET /api/workspaces/{id}/teams returns it (#371). */
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

export const teamsPath = (workspaceId: number, suffix = '') => `/api/workspaces/${workspaceId}/teams${suffix}`;

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
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

const teamReads = new Map<string, Promise<TeamItem[]>>();

/**
 * One read of a workspace's teams shared by everyone asking at once: the
 * sidebar, the page title and the page itself all ask on a page switch (#489).
 */
export function readTeams(workspaceId: number, status: 'all' | 'deleted' = 'all'): Promise<TeamItem[]> {
  const path = teamsPath(workspaceId, `?status=${status}`);
  let read = teamReads.get(path);
  if (!read) {
    read = apiRequest<TeamItem[]>(path).finally(() => teamReads.delete(path));
    teamReads.set(path, read);
  }
  return read;
}

export function useTeams(workspaceId: number, filter: TeamFilter | 'all' = 'all') {
  const [teams, setTeams] = useState<TeamItem[] | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    // Active and retired are the API's own filters of `all`, in the same order, so they share its read.
    const read = readTeams(workspaceId, filter === 'deleted' ? 'deleted' : 'all').then((teams) => teams.filter((team) => (
      filter === 'active' ? !team.retired_at : filter === 'retired' ? Boolean(team.retired_at) : true
    )));
    try {
      setTeams(await read);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Please try again.');
    }
  }, [filter, workspaceId]);

  useEffect(() => {
    setTeams(null);
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, [refresh]);

  return { teams, error, refresh };
}

/** "1 member", "3 members"; "1 ad account", "2 ad accounts". */
export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The team whose pages are on screen (/team/<KEY>/…), as Linear's team Issues
 * and Projects: `team` is null on the workspace's own pages; `missing` when the
 * address names no team of this workspace.
 */
export function useActiveTeam(workspaceId: number) {
  const key = useAppStore((state) => state.activeTeamKey);
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

export const teamDocumentsPath = (workspaceId: number, teamId: number, documentId?: number) =>
  teamsPath(workspaceId, `/${teamId}/documents${documentId !== undefined ? `/${documentId}` : ''}`);

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
