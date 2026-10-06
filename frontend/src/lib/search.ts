import { apiRequest } from './api';

/** What GET /api/search finds; the search page promises nothing else. */
export type SearchKind = 'campaign' | 'adset' | 'ad' | 'rule' | 'account';
/** The Status filter: Meta's delivery and a rule's run state in three words. */
export type SearchStatus = 'active' | 'paused' | 'other';
export type SearchOrder = 'relevance' | 'updated';

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
  /**
   * A rule's last change, an ad account's addition, and for a campaign, ad set
   * or ad the first day Buyerly synced it: Meta's own dates are not stored.
   */
  updated_at: string | null;
}

export interface SearchResponse {
  query: string;
  limit: number;
  /** One list: best match first, or newest first for `order=updated`. */
  results: SearchResult[];
  /** Kinds with more matches than `limit`. */
  truncated: SearchKind[];
}

/** Results per kind; the list scrolls, as Linear's search does. */
export const SEARCH_LIMIT = 20;

export type SearchTab = 'all' | SearchKind;

/**
 * The page's tabs in the server's order, each with its own prompt in the
 * field, as Linear's Projects tab asks for a project.
 */
export const SEARCH_TABS: { id: SearchTab; label: string; noun: string; placeholder: string }[] = [
  { id: 'all', label: 'All', noun: 'Result', placeholder: 'Search campaigns, ad sets, ads, rules and ad accounts…' },
  { id: 'campaign', label: 'Campaigns', noun: 'Campaign', placeholder: 'Search campaigns by name or ID…' },
  { id: 'adset', label: 'Ad sets', noun: 'Ad set', placeholder: 'Search ad sets by name or ID…' },
  { id: 'ad', label: 'Ads', noun: 'Ad', placeholder: 'Search ads by name or ID…' },
  { id: 'rule', label: 'Rules', noun: 'Rule', placeholder: 'Search rules by name…' },
  { id: 'account', label: 'Ad accounts', noun: 'Ad account', placeholder: 'Search ad accounts by name or ID…' },
];

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  campaign: 'Campaign',
  adset: 'Ad set',
  ad: 'Ad',
  rule: 'Rule',
  account: 'Ad account',
};

export const SEARCH_STATUS_LABELS: Record<SearchStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  other: 'Other',
};

/** Everything the search page keeps in its address, so a search is a shareable link. */
export interface SearchParams {
  query: string;
  tab: SearchTab;
  statuses: SearchStatus[];
  accounts: string[];
  order: SearchOrder;
  includeDeleted: boolean;
}

const TAB_IDS = new Set<string>(SEARCH_TABS.map((tab) => tab.id));
const STATUS_IDS = new Set<string>(Object.keys(SEARCH_STATUS_LABELS));

/** The address's search, as Linear writes it: `?q=…&type=campaign&includeDeleted=true`. */
export function parseSearchParams(search: string): SearchParams {
  const params = new URLSearchParams(search);
  const type = params.get('type') ?? 'all';
  const list = (key: string) => (params.get(key) ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return {
    query: (params.get('q') ?? '').trim(),
    tab: TAB_IDS.has(type) ? (type as SearchTab) : 'all',
    statuses: list('status').filter((value): value is SearchStatus => STATUS_IDS.has(value)),
    accounts: list('account'),
    order: params.get('order') === 'updated' ? 'updated' : 'relevance',
    includeDeleted: params.get('includeDeleted') === 'true',
  };
}

export function searchPagePath(workspace: string, params: SearchParams): string {
  const query = new URLSearchParams();
  if (params.query) query.set('q', params.query);
  if (params.tab !== 'all') query.set('type', params.tab);
  if (params.statuses.length > 0) query.set('status', params.statuses.join(','));
  if (params.accounts.length > 0) query.set('account', params.accounts.join(','));
  if (params.order !== 'relevance') query.set('order', params.order);
  if (params.includeDeleted) query.set('includeDeleted', 'true');
  const text = query.toString();
  return `/${workspace}/search${text ? `?${text}` : ''}`;
}

/** The browser tab's title, as Linear's "Search: set". */
export function searchPageTitle(search: string): string {
  const { query } = parseSearchParams(search);
  return query ? `Search: ${query}` : 'Search';
}

/** Searches the workspace in the address; the request carries its slug. */
export function searchWorkspace(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const query = new URLSearchParams({ q: params.query, limit: String(SEARCH_LIMIT) });
  if (params.tab !== 'all') query.set('kind', params.tab);
  params.statuses.forEach((status) => query.append('status', status));
  params.accounts.forEach((account) => query.append('account', account));
  if (params.order !== 'relevance') query.set('order', params.order);
  if (params.includeDeleted) query.set('include_deleted', 'true');
  return apiRequest<SearchResponse>(`/api/search?${query.toString()}`, { signal });
}

/** Which filters a tab offers: Linear's Projects tab has none of the issue filters. */
export function searchFiltersFor(tab: SearchTab): { status: boolean; account: boolean } {
  return { status: tab !== 'account', account: tab !== 'rule' };
}

/** Meta's effective status, or a rule's run state, in the Status filter's words. */
export function searchStatusOf(result: SearchResult): SearchStatus | null {
  if (result.kind === 'account' || !result.status) return null;
  const status = result.status.toUpperCase();
  if (status === 'ACTIVE') return 'active';
  if (status === 'PAUSED' || status.endsWith('_PAUSED')) return 'paused';
  return 'other';
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

/** Recent searches kept per member and workspace, newest first, as Linear lists them. */
const RECENT_SEARCHES_LIMIT = 8;
const recentSearchesKey = (scope: string) => `buyerly-recent-searches:${scope}`;

export function readRecentSearches(scope: string | null): string[] {
  if (!scope) return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(recentSearchesKey(scope)) ?? '[]');
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberSearch(scope: string | null, query: string): string[] {
  const recent = [query, ...readRecentSearches(scope).filter((value) => value !== query)].slice(0, RECENT_SEARCHES_LIMIT);
  if (scope) {
    try {
      window.localStorage.setItem(recentSearchesKey(scope), JSON.stringify(recent));
    } catch {
      // A browser without storage still searches; it just forgets.
    }
  }
  return recent;
}

export function clearRecentSearches(scope: string | null): void {
  if (!scope) return;
  try {
    window.localStorage.removeItem(recentSearchesKey(scope));
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** Where the second Esc on the search page goes back to; set when search opens. */
let searchReturnPath: string | null = null;

export function rememberSearchReturnPath(path: string): void {
  searchReturnPath = path;
}

export function takeSearchReturnPath(): string | null {
  const path = searchReturnPath;
  searchReturnPath = null;
  return path;
}
