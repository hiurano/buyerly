import { useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/api';
import type { MetaAccount, MetaConnection } from '@/lib/types';
import { pool } from '@/models/pool';
import { adAccountsQuery, connectionsQuery, membersQuery, teamsQuery } from '@/models/queries';
import { usePoolQuery } from '@/models/usePool';
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

const NO_ACCOUNTS: MetaAccount[] = [];
const NO_MEMBERS: AccountMember[] = [];
const NO_CONNECTIONS: MetaConnection[] = [];

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
  // Each from the pool: a page already visited draws them at once (#488). The page still
  // opens without teams, members or connections: no team column values, no "Connected by".
  const accountsRead = usePoolQuery(adAccountsQuery);
  const teamsRead = usePoolQuery(teamsQuery(workspace.id));
  const membersRead = usePoolQuery(membersQuery(workspace.id));
  const connectionsRead = usePoolQuery(connectionsQuery);
  const accounts = accountsRead.data ?? NO_ACCOUNTS;
  const teams = useMemo(
    () => (teamsRead.data ?? []).map((team): AccountTeam => ({ id: team.id, name: team.name, account_ids: team.account_ids })),
    [teamsRead.data],
  );
  const members: AccountMember[] = membersRead.data ?? NO_MEMBERS;
  const connections = connectionsRead.data ?? NO_CONNECTIONS;
  const waiting = (read: { data: unknown; error: string }) => read.data === undefined && !read.error;
  const state: AccountsLoadState = accountsRead.data === undefined && accountsRead.error
    ? 'error'
    : accountsRead.data === undefined || waiting(teamsRead) || waiting(membersRead) || waiting(connectionsRead)
      ? 'loading'
      : 'ready';
  const error = accountsRead.data === undefined ? accountsRead.error : '';

  /** Reads them again now, behind what is on screen. */
  const refresh = useCallback(async () => {
    await Promise.all([
      pool.fetch(adAccountsQuery),
      pool.fetch(teamsQuery(workspace.id)),
      pool.fetch(membersQuery(workspace.id)),
      pool.fetch(connectionsQuery),
    ]);
  }, [workspace.id]);

  /** Shown at once on every page holding this account, then written. */
  const patch = (accountId: string, change: Partial<MetaAccount>) => pool.patch<MetaAccount>('adAccount', accountId, change);

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
      pool.remove('adAccount', account.account_id);
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
