import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';

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
  account_ids: number[];
  is_member: boolean;
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

export function useTeams(workspaceId: number, filter: TeamFilter | 'all' = 'all') {
  const [teams, setTeams] = useState<TeamItem[] | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await apiRequest<TeamItem[]>(teamsPath(workspaceId, `?status=${filter}`));
      setTeams(next);
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
