import type { MetaAccount } from '@/lib/types';
import type { FilterFieldDefinition, FilterOption } from '@/components/filters/filterModel';
import { listViewDefaults, type SortDirection } from '@/ui/listView';

/**
 * The Ad accounts page (#388), modeled on Linear's Projects: a list of the
 * workspace's ad accounts and a page for each. Pure helpers only, so
 * scripts/check-accounts.cjs can run them without the app.
 */

/** A team as the page needs it: its name and the ad accounts (row ids) it holds. */
export interface AccountTeam {
  id: number;
  name: string;
  account_ids: number[];
}

/** Display options as they start, and as Reset brings them back. */
export const ACCOUNTS_VIEW_DEFAULTS = listViewDefaults({
  grouping: 'none',
  ordering: 'name',
  direction: 'asc',
  properties: {
    status: true,
    lead: true,
    spend: true,
    leads: true,
    rules: true,
  },
});

export const ACCOUNT_PROPERTY_LABELS: Record<string, string> = {
  status: 'Status',
  lead: 'Lead',
  spend: 'Spend today',
  leads: 'Leads/CPL today',
  rules: 'Rules',
};

export const ACCOUNT_GROUPING_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'status', label: 'Status' },
  { value: 'team', label: 'Team' },
  // Linear's Projects group by Lead: who runs which accounts, for the head of the group.
  { value: 'lead', label: 'Lead' },
];

/** A member who may lead an account, by the name the lists show. */
export interface AccountLeadOption {
  user_id: number;
  name: string;
}

const leadValue = (account: MetaAccount) => (account.lead_user_id == null ? 'none' : String(account.lead_user_id));

export const ACCOUNT_ORDERING_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'spend', label: 'Spend today' },
  { value: 'added', label: 'Added' },
];

/** The name Buyerly shows: the buyer's own name, else Meta's, else the ID. */
export function accountName(account: Pick<MetaAccount, 'custom_name' | 'name' | 'account_id'>): string {
  return account.custom_name?.trim() || account.name?.trim() || account.account_id;
}

/** Meta's account status, in the words Ads Manager uses. */
export interface AccountStatusInfo {
  key: string;
  label: string;
  color: string;
}

export const ACCOUNT_STATUSES: AccountStatusInfo[] = [
  { key: 'active', label: 'Active', color: '#4cb782' },
  { key: 'unsettled', label: 'Unsettled', color: '#f2994a' },
  { key: 'grace', label: 'Grace period', color: '#f2994a' },
  { key: 'settlement', label: 'Pending settlement', color: '#f2994a' },
  { key: 'review', label: 'In review', color: '#f2c94c' },
  { key: 'disabled', label: 'Disabled', color: '#eb5757' },
  { key: 'closing', label: 'Pending closure', color: '#8a8f98' },
  { key: 'closed', label: 'Closed', color: '#8a8f98' },
  { key: 'unknown', label: 'Unknown', color: '#8a8f98' },
];

const STATUS_BY_CODE: Record<number, string> = {
  1: 'active', 2: 'disabled', 3: 'unsettled', 7: 'review', 8: 'settlement', 9: 'grace', 100: 'closing', 101: 'closed',
};

export function accountStatus(account: Pick<MetaAccount, 'account_status'>): AccountStatusInfo {
  const key = STATUS_BY_CODE[account.account_status ?? 0] ?? 'unknown';
  return ACCOUNT_STATUSES.find((status) => status.key === key) ?? ACCOUNT_STATUSES[ACCOUNT_STATUSES.length - 1];
}

/**
 * Why Buyerly can't read the account right now, or null when the connection
 * is fine. Shown as an icon beside the name only when there is a problem.
 */
export function connectionProblem(account: Pick<MetaAccount, 'health' | 'status_label'>): string | null {
  const health = account.health;
  if (account.status_label === 'Meta connection required') {
    return 'The Meta connection was removed. Reconnect to read and change this account again.';
  }
  if (!health || (health.status !== 'degraded' && health.status !== 'critical')) return null;
  const message = health.last_error_message?.trim();
  if (message) return message;
  if (health.cause === 'user') return 'Meta refused access. Reconnect the account to restore it.';
  if (health.cause === 'meta') return 'Meta is not answering for this account right now.';
  return health.status === 'critical' ? 'Buyerly has not been able to sync this account.' : 'The last syncs of this account failed.';
}

/** Rules attached to the account, and whether its automation runs. */
export function accountRulesSummary(account: Pick<MetaAccount, 'active_rules' | 'rules_enabled'>): { count: number; on: boolean } {
  return { count: account.active_rules?.length ?? 0, on: Boolean(account.rules_enabled) };
}

export function teamsOf(account: Pick<MetaAccount, 'id'>, teams: AccountTeam[]): AccountTeam[] {
  return account.id === undefined ? [] : teams.filter((team) => team.account_ids.includes(account.id as number));
}

/** The direction a column or ordering sorts in first: names A→Z, money and dates largest and newest first. */
export const naturalAccountDirection = (ordering: string): SortDirection =>
  (ordering === 'name' || ordering === 'status' ? 'asc' : 'desc');

const statusRank = (account: MetaAccount) => ACCOUNT_STATUSES.findIndex((status) => status.key === accountStatus(account).key);

export function sortAccounts(accounts: MetaAccount[], ordering: string, direction: SortDirection): MetaAccount[] {
  const factor = direction === 'asc' ? 1 : -1;
  const byName = (a: MetaAccount, b: MetaAccount) =>
    accountName(a).localeCompare(accountName(b), undefined, { sensitivity: 'base', numeric: true });
  const spend = (account: MetaAccount) => account.today_metrics?.spend ?? null;
  const compare = (a: MetaAccount, b: MetaAccount): number => {
    if (ordering === 'status') return statusRank(a) - statusRank(b);
    if (ordering === 'spend') return (spend(a) ?? 0) - (spend(b) ?? 0);
    if (ordering === 'added') return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    return byName(a, b);
  };
  return [...accounts].sort((a, b) => {
    // Accounts without a figure yet go last in either direction.
    if (ordering === 'spend' && (spend(a) === null) !== (spend(b) === null)) return spend(a) === null ? 1 : -1;
    return compare(a, b) * factor || byName(a, b);
  });
}

export interface AccountListGroup {
  id: string;
  label: string;
  dotColor: string;
  rows: MetaAccount[];
}

/** Every group the grouping has, empty ones included: Group ordering and Show empty groups pick from these. */
export function accountGroupsFor(
  grouping: string,
  accounts: MetaAccount[],
  teams: AccountTeam[],
  leads: AccountLeadOption[] = [],
): AccountListGroup[] {
  if (grouping === 'lead') {
    return [
      ...leads.map((lead) => ({
        id: `lead-${lead.user_id}`,
        label: lead.name,
        dotColor: 'rgb(148, 163, 184)',
        rows: accounts.filter((account) => account.lead_user_id === lead.user_id),
      })),
      {
        id: 'lead-none',
        label: 'No lead',
        dotColor: 'rgb(115, 118, 124)',
        rows: accounts.filter((account) => account.lead_user_id == null || !leads.some((lead) => lead.user_id === account.lead_user_id)),
      },
    ];
  }
  if (grouping === 'status') {
    return ACCOUNT_STATUSES.map((status) => ({
      id: `status-${status.key}`,
      label: status.label,
      dotColor: status.color,
      rows: accounts.filter((account) => accountStatus(account).key === status.key),
    }));
  }
  if (grouping === 'team') {
    return [
      ...teams.map((team) => ({
        id: `team-${team.id}`,
        label: team.name,
        dotColor: 'rgb(148, 163, 184)',
        rows: accounts.filter((account) => account.id !== undefined && team.account_ids.includes(account.id)),
      })),
      {
        id: 'team-none',
        label: 'No team',
        dotColor: 'rgb(115, 118, 124)',
        rows: accounts.filter((account) => teamsOf(account, teams).length === 0),
      },
    ];
  }
  return [];
}

const enumOperators = ['is', 'is_not'] as const;

const counted = (options: FilterOption[], accounts: MetaAccount[], values: (account: MetaAccount) => string[]) =>
  options.map((option) => ({ ...option, count: accounts.filter((account) => values(account).includes(option.value)).length }));

const teamValues = (account: MetaAccount, teams: AccountTeam[]) => {
  const own = teamsOf(account, teams).map((team) => String(team.id));
  return own.length ? own : ['none'];
};

/** Filter: Status, Team, Automation on/off, Name or ID. */
export function createAccountFilterFields(
  accounts: MetaAccount[],
  teams: AccountTeam[],
  leads: AccountLeadOption[] = [],
): FilterFieldDefinition<MetaAccount>[] {
  const statuses = ACCOUNT_STATUSES.filter((status) => accounts.some((account) => accountStatus(account).key === status.key));
  return [
    {
      id: 'status', label: 'Status', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'statuses',
      options: counted(statuses.map((status) => ({ value: status.key, label: status.label, color: status.color, icon: 'dot' as const })), accounts, (account) => [accountStatus(account).key]),
      getValue: (account) => accountStatus(account).key,
    },
    {
      id: 'team', label: 'Team', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'teams',
      options: counted([
        ...teams.map((team) => ({ value: String(team.id), label: team.name })),
        { value: 'none', label: 'No team' },
      ], accounts, (account) => teamValues(account, teams)),
      getValue: (account) => teamValues(account, teams),
    },
    {
      id: 'lead', label: 'Lead', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'leads',
      options: counted([
        ...leads.map((lead) => ({ value: String(lead.user_id), label: lead.name })),
        { value: 'none', label: 'No lead' },
      ], accounts, (account) => [leadValue(account)]),
      getValue: (account) => leadValue(account),
    },
    {
      id: 'automation', label: 'Automation', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'values',
      options: counted([
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ], accounts, (account) => [account.rules_enabled ? 'on' : 'off']),
      getValue: (account) => (account.rules_enabled ? 'on' : 'off'),
    },
    {
      id: 'name', label: 'Name or ID', section: 'filters', type: 'text',
      operators: ['contains', 'not_contains'], defaultOperator: 'contains',
      placeholder: 'Name or act_…', keywords: ['id', 'title', 'search'],
      getValue: (account) => `${accountName(account)} ${account.name} ${account.account_id}`,
    },
  ];
}

/** "Oct 3, 2026" from the API's "YYYY-MM-DD HH:MM", without shifting it into another zone. */
export function formatAddedDate(value: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return '—';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** The account's page: /{workspace}/accounts/{act_id}. */
export const accountPagePath = (workspace: string, accountId: string) =>
  `/${workspace}/accounts/${encodeURIComponent(accountId)}`;

/**
 * Campaigns filtered to this account, as Linear's project opens its issues:
 * Campaigns turns `?account=` into "Ad account is …" on every level. Not a
 * `?filter=` of its own: Ad accounts, still on screen for the first frame,
 * would read it as its own filter and drop it.
 */
export const accountAdsManagerPath = (workspace: string, accountId: string) =>
  `/${workspace}/ads-manager/campaigns?account=${encodeURIComponent(accountId)}`;
