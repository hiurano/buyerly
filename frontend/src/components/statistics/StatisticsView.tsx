import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { ApiError, apiRequest } from '@/lib/api';
import type {
  AnalyticsHierarchyItem,
  AnalyticsHierarchyResponse,
  MetaAccount,
} from '@/lib/types';
import {
  eligibleMetaAccounts,
  formatMetricMoney,
  metaAccountLabel,
} from '@/components/campaigns/liveCampaigns';
import {
  LinearCheckIcon,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import {
  LinearDataListColumn,
  LinearDataListColumnHeader,
  LinearDataListRow,
  LinearDataListStack,
  LinearDataListToolbar,
  LinearDataListViewport,
} from '@/ui/LinearDataList';
import { LinearLabelPill } from '@/ui/LinearLabelPill';
import { LinearTabs } from '@/ui/LinearTabs';
import { Tooltip } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type EntityLevel = AnalyticsHierarchyResponse['level'];
type ReportingPeriod = AnalyticsHierarchyResponse['period'];
type StatisticsSort = 'name' | 'status' | 'spend' | 'leads' | 'cpl' | 'impressions' | 'clicks' | 'ctr';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

const PERIOD_OPTIONS: SelectOption<ReportingPeriod>[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_3d', label: 'Last 3 days' },
  { value: 'last_7d', label: 'Last 7 days' },
];

const LEVEL_LABELS: Record<EntityLevel, { singular: string; plural: string }> = {
  campaign: { singular: 'campaign', plural: 'campaigns' },
  adset: { singular: 'ad set', plural: 'ad sets' },
  ad: { singular: 'ad', plural: 'ads' },
};

const STATISTICS_COLUMNS: LinearDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(260px, 1fr)', sortable: true },
  { id: 'status', label: 'Delivery', width: '120px', sortable: true },
  { id: 'spend', label: 'Spend', width: '135px', align: 'right', sortable: true },
  { id: 'leads', label: 'Leads', width: '90px', align: 'right', sortable: true },
  { id: 'cpl', label: 'CPL', width: '120px', align: 'right', sortable: true },
  { id: 'impressions', label: 'Impressions', width: '110px', align: 'right', sortable: true },
  { id: 'clicks', label: 'Clicks', width: '90px', align: 'right', sortable: true },
  { id: 'ctr', label: 'CTR', width: '90px', align: 'right', sortable: true },
];

const TABLE_MIN_WIDTH = 1080;
const KNOWN_CURRENCY = /^[A-Z]{3}$/;

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—';
}

function formatFreshness(value: string | null): string {
  if (!value) return 'Freshness unavailable';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Freshness unavailable';
  return `Data as of ${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)}`;
}

function humanizeMetaStatus(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === 'UNKNOWN') return 'Unknown';
  if (normalized === 'ACTIVE') return 'Active';
  if (normalized === 'PAUSED' || normalized.endsWith('_PAUSED')) return 'Paused';
  return normalized
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusLabel(item: AnalyticsHierarchyItem): string {
  return humanizeMetaStatus(item.effective_status || item.status || 'UNKNOWN');
}

function statusDot(item: AnalyticsHierarchyItem): string {
  const normalized = (item.effective_status || item.status || '').trim().toUpperCase();
  if (normalized === 'ACTIVE') return 'var(--text-primary)';
  if (normalized === 'PAUSED' || normalized.endsWith('_PAUSED')) return 'var(--text-muted)';
  return 'var(--text-tertiary)';
}

const SummaryMetric: React.FC<{
  label: string;
  value: string;
  supporting: string;
}> = ({ label, value, supporting }) => (
  <article className="min-w-0 border-t border-[var(--color-border-primary)] p-4">
    <div className="text-[12px] font-medium text-[var(--text-muted)]">{label}</div>
    <div className="mt-2 font-mono text-[24px] font-medium leading-none tracking-[-0.03em] text-[var(--text-primary)] tabular-nums">
      {value}
    </div>
    <div className="mt-2 text-[12px] text-[var(--text-secondary)]">{supporting}</div>
  </article>
);

const StatisticsRow: React.FC<{
  item: AnalyticsHierarchyItem;
  compact: boolean;
}> = ({ item, compact }) => (
  <LinearDataListRow
    layout="grid"
    columns={STATISTICS_COLUMNS}
    height={compact ? 44 : 52}
    className="text-left"
    style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}
  >
    <div className="min-w-0">
      <div className="truncate text-[14px] font-medium text-[var(--text-primary)]">{item.entity_name}</div>
      <div className="mt-0.5 truncate font-mono text-[12px] text-[var(--text-muted)]">Meta ID {item.entity_id}</div>
    </div>

    <div className="min-w-0">
      <LinearLabelPill label={statusLabel(item)} dotColor={statusDot(item)} />
    </div>

    <div className="text-right font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
      {formatMetricMoney(item.spend, item.currency)}
    </div>
    <div className="text-right font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
      {formatCount(item.leads)}
    </div>
    <div className="text-right font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
      {formatMetricMoney(item.cost_per_lead, item.currency)}
    </div>
    <div className="text-right font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
      {formatCount(item.impressions)}
    </div>
    <div className="text-right font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
      {formatCount(item.clicks)}
    </div>
    <div className="text-right font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
      {formatPercent(item.ctr)}
    </div>
  </LinearDataListRow>
);

export const StatisticsView: React.FC = () => {
  const {
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    setActiveTab,
  } = useAppStore();
  const requestGenerationRef = useRef(0);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [accountsState, setAccountsState] = useState<LoadState>('loading');
  const [accountsError, setAccountsError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [level, setLevel] = useState<EntityLevel>('campaign');
  const [period, setPeriod] = useState<ReportingPeriod>('last_7d');
  const [hierarchy, setHierarchy] = useState<AnalyticsHierarchyResponse | null>(null);
  const [hierarchyState, setHierarchyState] = useState<LoadState>('idle');
  const [hierarchyError, setHierarchyError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [sortKey, setSortKey] = useState<StatisticsSort>('spend');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const refreshAccounts = useCallback(async () => {
    setAccountsState('loading');
    setAccountsError('');
    try {
      const response = await apiRequest<MetaAccount[]>('/api/accounts');
      const eligibleAccounts = eligibleMetaAccounts(response);
      setAccounts(eligibleAccounts);
      setSelectedAccountId((current) => {
        if (current && eligibleAccounts.some((account) => account.account_id === current)) return current;
        return eligibleAccounts[0]?.account_id ?? null;
      });
      setAccountsState('ready');
    } catch (error) {
      setAccountsError(requestErrorMessage(error));
      setAccountsState('error');
    }
  }, []);

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    setHierarchy(null);
    setHierarchyError('');
    if (!selectedAccountId) {
      setHierarchyState('idle');
      return undefined;
    }

    setHierarchyState('loading');
    void apiRequest<AnalyticsHierarchyResponse>(
      `/api/analytics/hierarchy?parent_id=${encodeURIComponent(selectedAccountId)}`
      + `&level=${level}&period=${period}`,
    )
      .then((response) => {
        if (generation !== requestGenerationRef.current) return;
        setHierarchy(response);
        setHierarchyState('ready');
      })
      .catch((error) => {
        if (generation !== requestGenerationRef.current) return;
        setHierarchyError(requestErrorMessage(error));
        setHierarchyState('error');
      });

    return () => {
      requestGenerationRef.current += 1;
    };
  }, [level, period, reloadKey, selectedAccountId]);

  const selectedAccount = accounts.find((account) => account.account_id === selectedAccountId) ?? null;
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Last 7 days';
  const levelLabel = LEVEL_LABELS[level];
  const items = hierarchy?.items ?? [];

  const summary = useMemo(() => {
    const spend = items.reduce((total, item) => total + item.spend, 0);
    const leads = items.reduce((total, item) => total + item.leads, 0);
    const impressions = items.reduce((total, item) => total + item.impressions, 0);
    const clicks = items.reduce((total, item) => total + item.clicks, 0);
    const currencies = new Set(
      items
        .map((item) => item.currency.trim().toUpperCase())
        .filter((currency) => KNOWN_CURRENCY.test(currency)),
    );
    const allRowsHaveKnownCurrency = items.every((item) => KNOWN_CURRENCY.test(item.currency.trim().toUpperCase()));
    const currency = currencies.size === 1 && allRowsHaveKnownCurrency ? [...currencies][0] : null;
    return {
      spend: currency ? formatMetricMoney(spend, currency) : '—',
      leads,
      impressions,
      clicks,
      cpl: currency && leads > 0 ? formatMetricMoney(spend / leads, currency) : '—',
      ctr: impressions > 0 ? formatPercent((clicks / impressions) * 100) : '—',
      currencyAvailable: currency !== null,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matching = normalizedQuery
      ? items.filter((item) => (
        `${item.entity_name} ${item.entity_id} ${statusLabel(item)}`.toLowerCase().includes(normalizedQuery)
      ))
      : items;
    const direction = sortDirection === 'asc' ? 1 : -1;
    const optionalMetric = (left: number | null, right: number | null) => {
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * direction;
    };
    return [...matching].sort((left, right) => {
      if (sortKey === 'name') return left.entity_name.localeCompare(right.entity_name) * direction;
      if (sortKey === 'status') return statusLabel(left).localeCompare(statusLabel(right)) * direction;
      if (sortKey === 'leads') return (left.leads - right.leads) * direction;
      if (sortKey === 'cpl') return optionalMetric(left.cost_per_lead, right.cost_per_lead);
      if (sortKey === 'impressions') return (left.impressions - right.impressions) * direction;
      if (sortKey === 'clicks') return (left.clicks - right.clicks) * direction;
      if (sortKey === 'ctr') return (left.ctr - right.ctr) * direction;
      return (left.spend - right.spend) * direction;
    });
  }, [items, query, sortDirection, sortKey]);

  const selectAccount = (accountId: string) => {
    if (accountId === selectedAccountId) return;
    requestGenerationRef.current += 1;
    setSelectedAccountId(accountId);
  };

  const renderData = () => {
    if (accountsState === 'loading') {
      return <DataState title="Loading ad accounts…" detail="Reading imported Meta accounts from this workspace." />;
    }
    if (accountsState === 'error') {
      return (
        <DataState
          title="Couldn't load ad accounts"
          detail={accountsError}
          role="alert"
          actionLabel="Retry"
          onAction={() => void refreshAccounts()}
        />
      );
    }
    if (accounts.length === 0) {
      return (
        <DataState
          title="Connect an ad account"
          detail="Import a Meta ad account in Ads Manager before viewing real Statistics data."
          actionLabel="Open Ads Manager"
          onAction={() => setActiveTab('campaigns')}
        />
      );
    }
    if (hierarchyState === 'loading' || hierarchyState === 'idle') {
      return (
        <DataState
          title={`Loading ${levelLabel.plural}…`}
          detail={`Reading ${periodLabel.toLowerCase()} metrics from the Analytics Fact Store.`}
        />
      );
    }
    if (hierarchyState === 'error') {
      return (
        <DataState
          title="Couldn't load Statistics"
          detail={hierarchyError}
          role="alert"
          actionLabel="Retry"
          onAction={() => setReloadKey((value) => value + 1)}
        />
      );
    }
    if (items.length === 0) {
      return (
        <DataState
          title={`No ${levelLabel.plural} in this ad account`}
          detail={`Meta returned no ${levelLabel.singular} inventory for ${periodLabel.toLowerCase()}. Zero-activity entities remain visible when they exist.`}
          actionLabel="Retry"
          onAction={() => setReloadKey((value) => value + 1)}
        />
      );
    }
    if (visibleItems.length === 0) {
      return (
        <DataState
          title={`No matching ${levelLabel.plural}`}
          detail="Try another name, Meta ID or delivery status."
          actionLabel="Clear search"
          onAction={() => setQuery('')}
        />
      );
    }

    return (
      <LinearDataListViewport horizontal>
        <div style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}>
          <LinearDataListColumnHeader
            columns={STATISTICS_COLUMNS}
            minWidth={TABLE_MIN_WIDTH}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(columnId) => {
              if (sortKey === columnId) {
                setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
              } else {
                setSortKey(columnId as StatisticsSort);
                setSortDirection(columnId === 'name' || columnId === 'status' || columnId === 'cpl' ? 'asc' : 'desc');
              }
            }}
          />
          <LinearDataListStack>
            {visibleItems.map((item) => (
              <StatisticsRow key={item.entity_id} item={item} compact={density === 'compact'} />
            ))}
          </LinearDataListStack>
        </div>
      </LinearDataListViewport>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border-primary)] px-[14px]">
        <div className="flex min-w-0 items-center gap-2">
          {isSidebarCollapsed && (
            <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
              <button type="button" onClick={toggleSidebarCollapsed} className="linear-icon-btn" aria-label="Open sidebar">
                <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          <h1 className="truncate text-[14px] font-medium tracking-[-0.01em] text-[var(--text-primary)]">Statistics</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <main className="flex min-h-full w-full flex-col gap-3">
          {accounts.length > 0 && (
            <section className="flex flex-wrap items-center gap-2 rounded-[var(--canvas-border-radius)] bg-[var(--bg-sidebar)] p-2" aria-label="Statistics controls">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-9 max-w-full gap-2 text-[14px]"
                    aria-label="Select ad account"
                  >
                    <span className="truncate">{selectedAccount ? metaAccountLabel(selectedAccount) : 'Select an account'}</span>
                    <ChevronRight size={13} className="shrink-0" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-w-[calc(100vw-24px)]">
                  <DropdownMenuLabel>Ad account</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={selectedAccountId ?? ''} onValueChange={selectAccount}>
                    {accounts.map((account) => (
                      <DropdownMenuRadioItem key={account.account_id} value={account.account_id}>
                        <span className="truncate">{metaAccountLabel(account)}</span>
                        {selectedAccountId === account.account_id && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-9 gap-2 text-[14px]"
                    aria-label="Select reporting period"
                  >
                    <span>{periodLabel}</span>
                    <ChevronRight size={13} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Reporting period</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={period} onValueChange={(value) => setPeriod(value as ReportingPeriod)}>
                    {PERIOD_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <span>{option.label}</span>
                        {period === option.value && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <label className="flex h-9 min-w-0 flex-1 basis-[220px] items-center gap-2 rounded-[var(--control-border-radius)] px-3 text-[var(--text-muted)] transition-colors focus-within:bg-[var(--item-hover-bg)] focus-within:ring-1 focus-within:ring-[var(--focus-ring-color)] hover:bg-[var(--item-hover-bg)]">
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={`Search ${levelLabel.plural}`}
                  placeholder={`Search ${levelLabel.plural}…`}
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </label>

              <div className="ml-auto px-2 text-[12px] text-[var(--text-muted)]" role="status">
                {hierarchyState === 'loading'
                  ? 'Loading stored Meta data…'
                  : hierarchy?.source === 'analytics_fact_store'
                    ? `Stored Meta data · ${formatFreshness(hierarchy.data_as_of)}`
                    : 'Stored Meta data unavailable'}
              </div>
            </section>
          )}

          {hierarchyState === 'ready' && items.length > 0 && (
            <section className="overflow-hidden rounded-[var(--canvas-border-radius)] border border-[var(--color-border-primary)] bg-[var(--card-bg)]" aria-labelledby="statistics-overview-heading">
              <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-4 py-2">
                <h2 id="statistics-overview-heading" className="text-[14px] font-medium text-[var(--text-primary)]">Overview</h2>
                <span className="text-[12px] text-[var(--text-muted)]">{periodLabel} · {formatCount(items.length)} {levelLabel.plural}</span>
              </div>
              {!summary.currencyAvailable && (
                <div className="border-t border-[var(--color-border-primary)] px-4 py-2 text-[13px] text-[var(--text-secondary)]" role="status">
                  Monetary totals are unavailable because the result has an unknown or inconsistent currency. Row-level supported values remain visible.
                </div>
              )}
              <div className="grid grid-cols-2 xl:grid-cols-4">
                <SummaryMetric label="Spend" value={summary.spend} supporting={`${periodLabel} total`} />
                <SummaryMetric label="Leads" value={formatCount(summary.leads)} supporting="Meta lead actions" />
                <SummaryMetric label="Cost per lead" value={summary.cpl} supporting="Spend ÷ lead actions" />
                <SummaryMetric label="CTR" value={summary.ctr} supporting={`${formatCount(summary.clicks)} clicks · ${formatCount(summary.impressions)} impressions`} />
              </div>
            </section>
          )}

          <section className="flex min-h-52 flex-1 flex-col overflow-hidden rounded-[var(--canvas-border-radius)] bg-[var(--bg-sidebar)]">
            <LinearDataListToolbar>
              <LinearTabs
                tabs={([
                  { id: 'campaign', label: 'Campaigns' },
                  { id: 'adset', label: 'Ad sets' },
                  { id: 'ad', label: 'Ads' },
                ] as const).map((tab) => ({
                  ...tab,
                  count: hierarchyState === 'ready' && tab.id === level ? hierarchy?.total : undefined,
                }))}
                activeTabId={level}
                onChange={(id) => setLevel(id as EntityLevel)}
                aria-label="Statistics entity level"
              />

              <Button
                className="h-9 text-[14px]"
                onClick={() => setDensity((current) => current === 'comfortable' ? 'compact' : 'comfortable')}
                aria-label={`Use ${density === 'comfortable' ? 'compact' : 'comfortable'} row density`}
              >
                {density === 'comfortable' ? 'Comfortable' : 'Compact'}
              </Button>
            </LinearDataListToolbar>
            {renderData()}
          </section>
        </main>
      </div>
    </div>
  );
};
