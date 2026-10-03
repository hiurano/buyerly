import { apiRequest } from './api';

/** What GET /api/search finds; the command menu promises nothing else. */
export type SearchKind = 'campaign' | 'adset' | 'ad' | 'rule' | 'account';

export interface SearchResult {
  kind: SearchKind;
  /** Meta ID, or the rule id for a rule. */
  id: string;
  name: string;
  /** The ad account Ads Manager opens the result in; empty for a rule. */
  account_id: string;
  account_name: string;
  /** The campaign of an ad set, the ad set of an ad. */
  parent_name: string;
  /** Meta's effective status, or active / paused / needs_review for a rule. */
  status: string;
}

export interface SearchResponse {
  query: string;
  limit: number;
  results: SearchResult[];
  /** Kinds with more matches than `limit`. */
  truncated: SearchKind[];
}

/** Results per kind: enough to recognise the one meant, few enough to read. */
export const SEARCH_LIMIT = 5;

/** The order the server returns kinds in, with the names their screens use. */
export const SEARCH_KINDS: { kind: SearchKind; heading: string }[] = [
  { kind: 'campaign', heading: 'Campaigns' },
  { kind: 'adset', heading: 'Ad sets' },
  { kind: 'ad', heading: 'Ads' },
  { kind: 'rule', heading: 'Rules' },
  { kind: 'account', heading: 'Ad accounts' },
];

/** Searches the workspace in the address; the request carries its slug. */
export function searchWorkspace(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  return apiRequest<SearchResponse>(
    `/api/search?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`,
    { signal },
  );
}

const ADS_MANAGER_ENTITIES = { campaign: 'campaigns', adset: 'adsets', ad: 'ads' } as const;

/**
 * Where a result opens: an ad account in Ads Manager, an entity on its own row
 * in Ads Manager, a rule on its row in Rules. The canonical record addresses
 * from docs/INFORMATION_ARCHITECTURE.md, so a result is also a shareable link.
 */
export function searchResultPath(workspace: string, result: SearchResult): string {
  const account = `?account=${encodeURIComponent(result.account_id)}`;
  if (result.kind === 'rule') return `/${workspace}/rules/${encodeURIComponent(result.id)}`;
  if (result.kind === 'account') return `/${workspace}/ads-manager/campaigns${account}`;
  return `/${workspace}/ads-manager/${ADS_MANAGER_ENTITIES[result.kind]}/${encodeURIComponent(result.id)}${account}`;
}
