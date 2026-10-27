import { useCallback, useMemo } from 'react';
import type { MetaAccount, MetaConnection } from '@/lib/types';
import { pool } from '@/models/pool';
import { transactions } from '@/models/transactions';
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

  /** A change of the account's own fields: on every page holding it at once, then written as a transaction (#508). */
  const write = (account: MetaAccount, label: string, change: Partial<MetaAccount>, mutation: string, variables: Record<string, unknown>) => (
    transactions.commit({
      label,
      mutation,
      variables,
      changes: [{ kind: 'update', type: 'adAccount', id: account.account_id, data: change }],
    }).then(() => true, () => false)
  );

  const saveProfile = async (account: MetaAccount, change: { custom_name?: string; note?: string }) => {
    const next = {
      custom_name: change.custom_name ?? account.custom_name ?? '',
      note: change.note ?? account.note ?? '',
    };
    if (next.custom_name === (account.custom_name ?? '') && next.note === (account.note ?? '')) return;
    await write(
      account, "Couldn't save the change", next,
      'mutation AccountUpdate($accountId: String!, $input: JSON!) { accountUpdate(accountId: $accountId, input: $input) { success lastSyncId } }',
      { accountId: account.account_id, input: next },
    );
  };

  /** Linear's project Lead: shown at once, put back if the server refuses. */
  const saveLead = async (account: MetaAccount, leadUserId: number | null) => {
    if ((account.lead_user_id ?? null) === leadUserId) return;
    await write(
      account, "Couldn't change the lead", { lead_user_id: leadUserId },
      'mutation AccountLeadUpdate($accountId: String!, $input: JSON!) { accountLeadUpdate(accountId: $accountId, input: $input) { success lastSyncId } }',
      { accountId: account.account_id, input: { lead_user_id: leadUserId } },
    );
  };

  const toggleAutomation = async (account: MetaAccount) => {
    const enabled = !account.rules_enabled;
    await write(
      account, `Couldn't turn automation ${enabled ? 'on' : 'off'}`, { rules_enabled: enabled },
      'mutation AccountRulesToggle($accountId: String!) { accountRulesToggle(accountId: $accountId) { success lastSyncId } }',
      { accountId: account.account_id },
    );
  };

  /** Gone from every list at once; back if the server refuses. */
  const remove = async (account: MetaAccount): Promise<boolean> => {
    const removed = await transactions.commit({
      label: `Couldn't remove ${accountName(account)}`,
      mutation: 'mutation AccountDelete($accountId: String!) { accountDelete(accountId: $accountId) { success lastSyncId } }',
      variables: { accountId: account.account_id },
      changes: [{ kind: 'delete', type: 'adAccount', id: account.account_id }],
    }).then(() => true, () => false);
    if (removed) toast.show({ tone: 'success', title: 'Removed', message: `${accountName(account)} from the workspace.` });
    return removed;
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
