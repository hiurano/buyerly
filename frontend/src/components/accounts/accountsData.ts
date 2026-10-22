import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { MetaAccount, MetaConnection } from '@/lib/types';
import { teamsPath, type TeamItem } from '@/lib/teams';
import { useAppStore } from '@/store/useAppStore';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { useListView } from '@/ui/useListView';
import { toast } from '@/ui/toast';
import { ACCOUNTS_VIEW_DEFAULTS, accountName, type AccountTeam } from './accountsModel';

/** The Ad accounts list's view, saved per member on the server (#385). */
export const useAccountsView = () => useListView('accounts', ACCOUNTS_VIEW_DEFAULTS);

export interface AccountMember {
  user_id: number;
  full_name: string;
  username: string;
  avatar_url: string;
}

export type AccountsLoadState = 'loading' | 'ready' | 'error';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

/**
 * The workspace's ad accounts with what their list and page show beside
 * them: teams, the members who connected them and the Meta connections.
 * Changes are written to the API and shown on the row at once; a failure
 * puts the row back and says so in a toast, as Linear does.
 */
export function useWorkspaceAccounts() {
  const { workspace } = useWorkspaceSession();
  // Adding, reconnecting and removing ad accounts is the workspace's; a guest only works on the accounts
  // of their teams, which are all they see, as Linear's guests act inside their teams.
  const canEdit = workspace.role !== 'guest';
  const canAct = true;
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [teams, setTeams] = useState<AccountTeam[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [state, setState] = useState<AccountsLoadState>('loading');
  const [error, setError] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    const inScope = useAppStore.getState().captureScope();
    if (!quiet) setState('loading');
    try {
      const [nextAccounts, nextTeams, nextMembers, nextConnections] = await Promise.all([
        apiRequest<MetaAccount[]>('/api/accounts'),
        // The page still opens without them: no team column values, no "Connected by".
        apiRequest<TeamItem[]>(teamsPath(workspace.id, '?status=all')).catch(() => [] as TeamItem[]),
        apiRequest<AccountMember[]>(`/api/workspaces/${workspace.id}/members`).catch(() => [] as AccountMember[]),
        apiRequest<MetaConnection[]>('/api/meta/connections').catch(() => [] as MetaConnection[]),
      ]);
      if (!inScope()) return;
      setAccounts(nextAccounts);
      setTeams(nextTeams.map((team) => ({ id: team.id, name: team.name, account_ids: team.account_ids })));
      setMembers(nextMembers);
      setConnections(nextConnections);
      setError('');
      setState('ready');
    } catch (loadError) {
      if (!inScope()) return;
      setError(errorText(loadError));
      setState('error');
    }
  }, [workspace.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = (accountId: string, change: Partial<MetaAccount>) =>
    setAccounts((current) => current.map((account) => (account.account_id === accountId ? { ...account, ...change } : account)));

  const saveProfile = async (account: MetaAccount, change: { custom_name?: string; note?: string }) => {
    const next = {
      custom_name: change.custom_name ?? account.custom_name ?? '',
      note: change.note ?? account.note ?? '',
    };
    if (next.custom_name === (account.custom_name ?? '') && next.note === (account.note ?? '')) return;
    patch(account.account_id, next);
    try {
      await apiRequest(`/api/accounts/${encodeURIComponent(account.account_id)}/profile`, {
        method: 'PATCH',
        body: JSON.stringify(next),
      });
    } catch (saveError) {
      patch(account.account_id, { custom_name: account.custom_name, note: account.note });
      toast.error("Couldn't save the change", errorText(saveError));
    }
  };

  /** Linear's project Lead: shown at once, put back if the server refuses. */
  const saveLead = async (account: MetaAccount, leadUserId: number | null) => {
    if ((account.lead_user_id ?? null) === leadUserId) return;
    patch(account.account_id, { lead_user_id: leadUserId });
    try {
      await apiRequest(`/api/accounts/${encodeURIComponent(account.account_id)}/lead`, {
        method: 'PATCH',
        body: JSON.stringify({ lead_user_id: leadUserId }),
      });
    } catch (saveError) {
      patch(account.account_id, { lead_user_id: account.lead_user_id ?? null });
      toast.error("Couldn't change the lead", errorText(saveError));
    }
  };

  const toggleAutomation = async (account: MetaAccount) => {
    const enabled = !account.rules_enabled;
    patch(account.account_id, { rules_enabled: enabled });
    try {
      const result = await apiRequest<{ rules_enabled: boolean }>(
        `/api/accounts/${encodeURIComponent(account.account_id)}/toggle-rules`,
        { method: 'POST' },
      );
      patch(account.account_id, { rules_enabled: result.rules_enabled });
    } catch (toggleError) {
      patch(account.account_id, { rules_enabled: account.rules_enabled });
      toast.error(`Couldn't turn automation ${enabled ? 'on' : 'off'}`, errorText(toggleError));
    }
  };

  const remove = async (account: MetaAccount): Promise<boolean> => {
    try {
      await apiRequest(`/api/accounts/${encodeURIComponent(account.account_id)}`, { method: 'DELETE' });
      setAccounts((current) => current.filter((item) => item.account_id !== account.account_id));
      toast.show({ tone: 'success', title: 'Removed', message: `${accountName(account)} from the workspace.` });
      return true;
    } catch (removeError) {
      toast.error(`Couldn't remove ${accountName(account)}`, errorText(removeError));
      return false;
    }
  };

  return {
    accounts, teams, members, connections, state, error, canEdit, canAct,
    refresh, saveProfile, saveLead, toggleAutomation, remove,
  };
}

export type WorkspaceAccounts = ReturnType<typeof useWorkspaceAccounts>;

/** Copies an account ID and says so, as Linear's "Copy ID". */
export async function copyAccountId(accountId: string) {
  try {
    await navigator.clipboard.writeText(accountId);
    toast.show({ tone: 'success', title: 'Account ID copied to clipboard' });
  } catch {
    toast.error("Couldn't copy the ID", accountId);
  }
}
