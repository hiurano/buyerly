import { apiRequest } from '@/lib/api';
import type { AnalyticsAccountsHierarchyResponse, MetaAccount, MetaConnection } from '@/lib/types';
import type { MemberItem } from '@/components/preferences/MemberDialogs';
import { fetchRuleLabels, fetchRulePresets, type RuleLabelPayload, type RulePresetPayload } from '@/lib/rules';
import type { TeamDocument, TeamItem } from '@/lib/teams';
import type { ListQuery } from './pool';

/**
 * The pool's queries, one per list the pages read (#488). The pool holds one
 * workspace at a time, so the workspace's id in a key only guards a late reader.
 */

export const teamsQuery = (workspaceId: number, status: 'all' | 'deleted' = 'all'): ListQuery<TeamItem> => ({
  kind: 'list',
  key: `teams:${workspaceId}:${status}`,
  type: 'team',
  load: () => apiRequest<TeamItem[]>(`/api/workspaces/${workspaceId}/teams?status=${status}`),
  id: (team) => team.id,
});

export const membersQuery = (workspaceId: number): ListQuery<MemberItem> => ({
  kind: 'list',
  key: `members:${workspaceId}`,
  type: 'member',
  load: () => apiRequest<MemberItem[]>(`/api/workspaces/${workspaceId}/members`),
  id: (member) => member.user_id,
});

export const adAccountsQuery: ListQuery<MetaAccount> = {
  kind: 'list',
  key: 'adAccounts',
  type: 'adAccount',
  load: () => apiRequest<MetaAccount[]>('/api/accounts'),
  id: (account) => account.account_id,
};

/** Meta connections; a failure reads as none, as the pages showed it before. */
export const connectionsQuery: ListQuery<MetaConnection> = {
  kind: 'list',
  key: 'connections',
  type: 'connection',
  load: () => apiRequest<MetaConnection[]>('/api/meta/connections').catch(() => []),
  id: (connection) => connection.id,
};

export const presetsQuery: ListQuery<RulePresetPayload> = {
  kind: 'list',
  key: 'presets',
  type: 'preset',
  load: () => fetchRulePresets(),
  id: (preset) => preset.id,
};

export const ruleLabelsQuery: ListQuery<RuleLabelPayload> = {
  kind: 'list',
  key: 'ruleLabels',
  type: 'ruleLabel',
  load: () => fetchRuleLabels(),
  id: (label) => label.id,
};

export const teamDocumentsQuery = (workspaceId: number, teamId: number): ListQuery<TeamDocument> => ({
  kind: 'list',
  key: `teamDocuments:${workspaceId}:${teamId}`,
  type: 'teamDocument',
  load: () => apiRequest<TeamDocument[]>(`/api/workspaces/${workspaceId}/teams/${teamId}/documents`),
  id: (document) => document.id,
});

/** One ad account's three levels for one period, as the pool holds it. */
export type AccountHierarchyRows = AnalyticsAccountsHierarchyResponse['accounts'][number] & { period: string };

/** Every ad account's rows for a period in one request (#489); each account's rows are their own record. */
export const hierarchyQuery = (period: string): ListQuery<AccountHierarchyRows> => ({
  kind: 'list',
  key: `hierarchy:${period}`,
  type: 'accountHierarchy',
  load: async () => {
    const response = await apiRequest<AnalyticsAccountsHierarchyResponse>(`/api/analytics/hierarchy/accounts?period=${period}`);
    return response.accounts.map((rows) => ({ ...rows, period }));
  },
  id: (rows) => `${rows.account_id}:${rows.period}`,
});

/**
 * Delivery written to Meta, on every period's rows that hold these entities,
 * so each Ads Manager view shows it before the stored snapshot catches up.
 */
export function withDelivery(rows: AccountHierarchyRows, entityIds: ReadonlySet<string>, status: string): AccountHierarchyRows {
  const levels = ['campaigns', 'adsets', 'ads'] as const;
  if (!levels.some((level) => rows[level].some((item) => entityIds.has(item.entity_id) && item.status !== status))) return rows;
  const next = { ...rows };
  for (const level of levels) {
    next[level] = rows[level].map((item) => (entityIds.has(item.entity_id) ? { ...item, status, effective_status: status } : item));
  }
  return next;
}
