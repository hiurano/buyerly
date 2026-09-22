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
  CHILD_LEVEL,
  DECISION_ORDER,
  DECISION_PRESENTATION,
  RESULT_DEFINITIONS,
  buildDiagnostics,
  decide,
  detectPrimaryResult,
  formatCount,
  type DecisionState,
  type DecisionVerdict,
  type EntityLevel,
  type ReportingPeriod,
  type ResultKind,
} from '@/components/statistics/statisticsModel';
import {
  LinearCheckIcon,
  LinearFilterIcon,
  LinearSlidersIcon,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { DataState } from '@/ui/DataState';
import {
  LinearDataListColumn,
  LinearDataListColumnHeader,
  LinearDataListGroupHeader,
  LinearDataListRow,
  LinearDataListStack,
  LinearDataListToolbar,
  LinearDataListViewport,
} from '@/ui/LinearDataList';
import { LinearTabs } from '@/ui/LinearTabs';
import { Tooltip } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type StatisticsSort = 'name' | 'spend' | 'results' | 'cost';
type Grouping = 'none' | 'decision' | 'delivery';
type ResultPreference = 'auto' | ResultKind;

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** One ancestor on the in-place drill-down path. */
interface DrillStep {
  id: string;
  name: string;
  level: EntityLevel;
}

const PERIOD_OPTIONS: SelectOption<ReportingPeriod>[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_3d', label: 'Last 3 days' },
  { value: 'last_7d', label: 'Last 7 days' },
];

const GROUPING_OPTIONS: SelectOption<Grouping>[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'decision', label: 'Decision status' },
  { value: 'delivery', label: 'Delivery status' },
];

const RESULT_OPTIONS: SelectOption<ResultPreference>[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'leads', label: 'Leads' },
  { value: 'registrations', label: 'Registrations' },
  { value: 'purchases', label: 'Purchases' },
];

const LEVEL_LABELS: Record<EntityLevel, { singular: string; plural: string }> = {
  campaign: { singular: 'campaign', plural: 'campaigns' },
  adset: { singular: 'ad set', plural: 'ad sets' },
  ad: { singular: 'ad', plural: 'ads' },
};

const TABLE_MIN_WIDTH = 940;
const KNOWN_CURRENCY = /^[A-Z]{3}$/;
/** Periods whose spend can be read against a single day of budget. */
const SINGLE_DAY_PERIODS: ReportingPeriod[] = ['today', 'yesterday'];

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
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

function isDelivering(item: AnalyticsHierarchyItem): boolean {
  return (item.effective_status || item.status || '').trim().toUpperCase() === 'ACTIVE';
}

function statusDot(item: AnalyticsHierarchyItem): string {
  const normalized = (item.effective_status || item.status || '').trim().toUpperCase();
  if (normalized === 'ACTIVE') return 'var(--text-primary)';
  if (normalized === 'PAUSED' || normalized.endsWith('_PAUSED')) return 'var(--text-muted)';
  return 'var(--text-tertiary)';
}

/** A written verdict with a repeating color, never a color on its own. */
const DecisionNote: React.FC<{ verdict: DecisionVerdict; className?: string }> = ({
  verdict,
  className = '',
}) => (
  <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: DECISION_PRESENTATION[verdict.state].dotColor }}
    />
    <span className={`truncate ${DECISION_PRESENTATION[verdict.state].textClass}`}>{verdict.label}</span>
  </span>
);

const MetricCard: React.FC<{
  label: string;
  value: string;
  supporting: string;
  /** The primary decision KPI carries a stronger border than its neighbours. */
  emphasis?: boolean;
  verdict?: DecisionVerdict;
  footnote?: string;
}> = ({ label, value, supporting, emphasis = false, verdict, footnote }) => (
  <article
    className={`flex min-h-[var(--statistics-metric-height)] min-w-0 flex-col rounded-[var(--control-border-radius)] border bg-[var(--card-bg)] p-4 shadow-[var(--canvas-shadow)] ${
      emphasis ? 'border-[var(--statistics-primary-card-border)]' : 'border-[var(--card-border)]'
    }`}
  >
    <div className="text-[12px] font-medium text-[var(--text-muted)]">{label}</div>
    <div className="mt-2.5 break-words text-[length:var(--statistics-metric-mobile-font-size)] font-medium leading-none tracking-[-0.03em] text-[var(--text-primary)] tabular-nums sm:text-[length:var(--statistics-metric-font-size)]">
      {value.replace(/\u00a0/g, ' ')}
    </div>
    <div className="mt-2 text-[12px] text-[var(--text-secondary)]">{supporting}</div>
    {verdict && <DecisionNote verdict={verdict} className="mt-auto pt-2 text-[12px]" />}
    {!verdict && footnote && <div className="mt-auto pt-2 text-[12px] text-[var(--text-muted)]">{footnote}</div>}
  </article>
);

interface StatisticsRowProps {
  item: AnalyticsHierarchyItem;
  columns: LinearDataListColumn[];
  compact: boolean;
  resultKind: ResultKind;
  verdict: DecisionVerdict;
  /** Denominator caption for the spend cell, already resolved to real data. */
  pace: { label: string; ratio: number | null };
  childLabel: string | null;
  onDrill: () => void;
  expanded: boolean;
  onToggleDiagnostics: () => void;
}

const StatisticsRow: React.FC<StatisticsRowProps> = ({
  item,
  columns,
  compact,
  resultKind,
  verdict,
  pace,
  childLabel,
  onDrill,
  expanded,
  onToggleDiagnostics,
}) => {
  const definition = RESULT_DEFINITIONS[resultKind];
  const diagnosticsId = `statistics-diagnostics-${item.entity_id}`;

  return (
    <div className="min-w-0">
      <LinearDataListRow
        layout="grid"
        columns={columns}
        height={compact ? 48 : 56}
        className="text-left"
        style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}
      >
        <div className="sticky left-0 z-[1] min-w-0 bg-[var(--bg-canvas)] transition-colors group-hover/row:bg-[var(--item-hover-bg)]">
          {childLabel ? (
            <button
              type="button"
              onClick={onDrill}
              className="block w-full truncate rounded-[var(--control-border-radius)] text-left text-[14px] font-medium text-[var(--text-primary)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
              aria-label={`Show ${childLabel} in ${item.entity_name}`}
            >
              {item.entity_name}
            </button>
          ) : (
            <div className="truncate text-[14px] font-medium text-[var(--text-primary)]">{item.entity_name}</div>
          )}
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: statusDot(item) }}
            />
            <span className="shrink-0">{statusLabel(item)}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate font-mono">Meta ID {item.entity_id}</span>
          </div>
        </div>

        <div className="min-w-0 text-right">
          <div className="text-[14px] text-[var(--text-primary)] tabular-nums">
            {formatMetricMoney(item.spend, item.currency)}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {pace.ratio !== null && (
              <span
                aria-hidden="true"
                className="h-[var(--statistics-pace-track-height)] w-[var(--statistics-pace-track-width)] overflow-hidden rounded-full bg-[var(--statistics-pace-track)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--statistics-pace-fill)]"
                  style={{ width: `${Math.min(Math.max(pace.ratio, 0), 1) * 100}%` }}
                />
              </span>
            )}
            <span className="truncate text-[12px] text-[var(--text-muted)] tabular-nums">{pace.label}</span>
          </div>
        </div>

        <div className="text-right text-[14px] text-[var(--text-primary)] tabular-nums">
          {formatCount(definition.count(item))}
        </div>

        <div className="min-w-0 text-right">
          <div className="text-[14px] font-medium text-[var(--text-primary)] tabular-nums">
            {formatMetricMoney(definition.cost(item), item.currency)}
          </div>
          {!verdict.quiet && <DecisionNote verdict={verdict} className="mt-1 justify-end text-[12px]" />}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onToggleDiagnostics}
            aria-expanded={expanded}
            aria-controls={diagnosticsId}
            aria-label={`${expanded ? 'Hide' : 'Show'} diagnostics for ${item.entity_name}`}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--control-border-radius)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
          >
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="transition-transform"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
            />
          </button>
        </div>
      </LinearDataListRow>

      {expanded && (
        <div
          id={diagnosticsId}
          className="mt-1 rounded-[var(--control-border-radius)] bg-[var(--statistics-diagnostics-bg)] p-3"
          style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}
        >
          <p className="text-[12px] text-[var(--text-secondary)]">{verdict.detail}</p>
          <div className="mt-3 grid gap-x-6 gap-y-4 md:grid-cols-3">
            {buildDiagnostics(item, resultKind).map((section) => (
              <section key={section.id} className="min-w-0">
                <h4 className="text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  {section.title}
                </h4>
                <dl className="mt-2 flex flex-col gap-1.5">
                  {section.entries.map((entry) => (
                    <div key={entry.label} className="flex items-baseline justify-between gap-3">
                      <dt className="min-w-0 truncate text-[12px] text-[var(--text-tertiary)]">{entry.label}</dt>
                      <dd className="shrink-0 text-[12px] text-[var(--text-primary)] tabular-nums">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [trail, setTrail] = useState<DrillStep[]>([]);
  const [period, setPeriod] = useState<ReportingPeriod>('last_7d');
  const [hierarchy, setHierarchy] = useState<AnalyticsHierarchyResponse | null>(null);
  const [hierarchyState, setHierarchyState] = useState<LoadState>('idle');
  const [hierarchyError, setHierarchyError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [grouping, setGrouping] = useState<Grouping>('none');
  const [resultPreference, setResultPreference] = useState<ResultPreference>('auto');
  const [sortKey, setSortKey] = useState<StatisticsSort>('spend');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const parent = trail.length > 0 ? trail[trail.length - 1] : null;
  const queryLevel: EntityLevel = parent ? (CHILD_LEVEL[parent.level] ?? level) : level;
  const parentId = parent ? parent.id : selectedAccountId;

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
    setExpandedRowId(null);
    if (!parentId) {
      setHierarchyState('idle');
      return undefined;
    }

    setHierarchyState('loading');
    void apiRequest<AnalyticsHierarchyResponse>(
      `/api/analytics/hierarchy?parent_id=${encodeURIComponent(parentId)}`
      + `&level=${queryLevel}&period=${period}`,
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
  }, [parentId, period, queryLevel, reloadKey]);

  const selectedAccount = accounts.find((account) => account.account_id === selectedAccountId) ?? null;
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Last 7 days';
  const levelLabel = LEVEL_LABELS[queryLevel];
  const childLevel = CHILD_LEVEL[queryLevel] ?? null;
  const childLabel = childLevel ? LEVEL_LABELS[childLevel].plural : null;
  /** What the rows in view are a share of: the ad account, or the entity drilled into. */
  const parentScope = parent ? LEVEL_LABELS[parent.level].singular : 'account';
  const items = useMemo(() => hierarchy?.items ?? [], [hierarchy]);

  /** The conversion event this ad account declares it is buying, if any. */
  const declaredResultKind: ResultKind | null = (
    selectedAccount?.primary_result === 'leads'
    || selectedAccount?.primary_result === 'registrations'
    || selectedAccount?.primary_result === 'purchases'
  ) ? selectedAccount.primary_result : null;

  const detectedResultKind = useMemo(() => detectPrimaryResult(items), [items]);
  const resultKind: ResultKind = resultPreference === 'auto'
    ? (declaredResultKind ?? detectedResultKind)
    : resultPreference;
  const resultDefinition = RESULT_DEFINITIONS[resultKind];

  // The stored target names the event it applies to, so it is used only while
  // that event is the one on screen. Anything else is reported without a verdict.
  const costTarget: number | null = declaredResultKind && resultKind === declaredResultKind
    ? selectedAccount?.target_cost_per_result ?? null
    : null;

  const summary = useMemo(() => {
    const spend = items.reduce((total, item) => total + item.spend, 0);
    const results = items.reduce((total, item) => total + resultDefinition.count(item), 0);
    const delivering = items.filter(isDelivering).length;
    const dailyBudget = items
      .filter(isDelivering)
      .reduce((total, item) => total + (item.daily_budget > 0 ? item.daily_budget : 0), 0);
    const currencies = new Set(
      items
        .map((item) => item.currency.trim().toUpperCase())
        .filter((currency) => KNOWN_CURRENCY.test(currency)),
    );
    const allRowsHaveKnownCurrency = items.every((item) => KNOWN_CURRENCY.test(item.currency.trim().toUpperCase()));
    const currency = currencies.size === 1 && allRowsHaveKnownCurrency ? [...currencies][0] : null;
    const costPerResult = currency && results > 0 ? spend / results : null;
    return {
      spendValue: spend,
      spend: currency ? formatMetricMoney(spend, currency) : '—',
      results,
      delivering,
      paused: items.length - delivering,
      dailyBudget: currency && dailyBudget > 0 ? formatMetricMoney(dailyBudget, currency) : null,
      costPerResult: costPerResult === null ? '—' : formatMetricMoney(costPerResult, currency as string),
      verdict: decide(results, costPerResult, costTarget),
      currencyAvailable: currency !== null,
    };
  }, [costTarget, items, resultDefinition]);

  /** Why the overview carries no verdict, stated for the current selection. */
  const explainMissingTarget = (verdict: DecisionVerdict): DecisionVerdict => {
    if (!verdict.quiet || !declaredResultKind || resultKind === declaredResultKind) return verdict;
    const declared = RESULT_DEFINITIONS[declaredResultKind].noun;
    return {
      ...verdict,
      label: `Target set for ${declared}`,
      detail: `This ad account's cost target applies to ${declared}, not to the result shown here.`,
    };
  };

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
      if (sortKey === 'results') {
        return (resultDefinition.count(left) - resultDefinition.count(right)) * direction;
      }
      if (sortKey === 'cost') {
        return optionalMetric(resultDefinition.cost(left), resultDefinition.cost(right));
      }
      return (left.spend - right.spend) * direction;
    });
  }, [items, query, resultDefinition, sortDirection, sortKey]);

  const columns: LinearDataListColumn[] = useMemo(() => [
    { id: 'name', label: LEVEL_LABELS[queryLevel].singular.replace(/^./, (c) => c.toUpperCase()), width: 'minmax(240px, 1fr)', sortable: true },
    { id: 'spend', label: 'Spend', width: '230px', align: 'right', sortable: true },
    { id: 'results', label: resultDefinition.label, width: '110px', align: 'right', sortable: true },
    { id: 'cost', label: resultDefinition.costLabel, width: '200px', align: 'right', sortable: true },
    { id: 'diagnostics', label: '', width: '40px', align: 'right' },
  ], [queryLevel, resultDefinition]);

  /**
   * A row's spend is read against its own daily budget only for single-day
   * periods, where that denominator is real. Otherwise it is reported as a
   * share of the spend currently in view.
   */
  const paceFor = useCallback((item: AnalyticsHierarchyItem) => {
    if (SINGLE_DAY_PERIODS.includes(period) && item.daily_budget > 0) {
      const ratio = item.spend / item.daily_budget;
      return { ratio, label: `${Math.round(ratio * 100)}% of daily budget` };
    }
    if (summary.spendValue > 0) {
      const ratio = item.spend / summary.spendValue;
      return { ratio, label: `${Math.round(ratio * 100)}% of ${parentScope} spend` };
    }
    return { ratio: null, label: 'No spend recorded' };
  }, [parentScope, period, summary.spendValue]);

  const verdictFor = useCallback((item: AnalyticsHierarchyItem) => (
    decide(resultDefinition.count(item), resultDefinition.cost(item), costTarget)
  ), [costTarget, resultDefinition]);

  const selectAccount = (accountId: string) => {
    if (accountId === selectedAccountId) return;
    requestGenerationRef.current += 1;
    setTrail([]);
    setSelectedAccountId(accountId);
  };

  const selectLevel = (nextLevel: EntityLevel) => {
    setTrail([]);
    setLevel(nextLevel);
  };

  const drillInto = (item: AnalyticsHierarchyItem) => {
    if (!childLevel) return;
    setQuery('');
    setTrail((current) => [...current, { id: item.entity_id, name: item.entity_name, level: queryLevel }]);
  };

  const renderRow = (item: AnalyticsHierarchyItem) => (
    <StatisticsRow
      key={item.entity_id}
      item={item}
      columns={columns}
      compact={density === 'compact'}
      resultKind={resultKind}
      verdict={verdictFor(item)}
      pace={paceFor(item)}
      childLabel={childLabel}
      onDrill={() => drillInto(item)}
      expanded={expandedRowId === item.entity_id}
      onToggleDiagnostics={() => setExpandedRowId((current) => (
        current === item.entity_id ? null : item.entity_id
      ))}
    />
  );

  const renderGroups = () => {
    if (grouping === 'decision') {
      return DECISION_ORDER.map((state: DecisionState) => {
        const groupItems = visibleItems.filter((item) => verdictFor(item).state === state);
        if (groupItems.length === 0) return null;
        const presentation = DECISION_PRESENTATION[state];
        return (
          <div key={state} style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}>
            <LinearDataListGroupHeader
              title={presentation.title}
              count={groupItems.length}
              dotColor={presentation.dotColor}
              description={presentation.description}
            />
            <LinearDataListStack>{groupItems.map(renderRow)}</LinearDataListStack>
          </div>
        );
      });
    }
    if (grouping === 'delivery') {
      const statuses = [...new Set(visibleItems.map(statusLabel))].sort();
      return statuses.map((status) => {
        const groupItems = visibleItems.filter((item) => statusLabel(item) === status);
        return (
          <div key={status} style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}>
            <LinearDataListGroupHeader
              title={status}
              count={groupItems.length}
              dotColor={statusDot(groupItems[0])}
              description={`Meta delivery status ${status.toLowerCase()}`}
            />
            <LinearDataListStack>{groupItems.map(renderRow)}</LinearDataListStack>
          </div>
        );
      });
    }
    return visibleItems.map(renderRow);
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
            columns={columns}
            minWidth={TABLE_MIN_WIDTH}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(columnId) => {
              if (columnId === 'diagnostics') return;
              if (sortKey === columnId) {
                setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
              } else {
                setSortKey(columnId as StatisticsSort);
                setSortDirection(columnId === 'name' || columnId === 'cost' ? 'asc' : 'desc');
              }
            }}
          />
          <LinearDataListStack>{renderGroups()}</LinearDataListStack>
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
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <Tooltip content="Filter statistics" side="bottom" sideOffset={6}>
              <DropdownMenuTrigger asChild>
                <Button className="!h-11 !w-11 !rounded-[var(--control-border-radius)] !border-transparent !p-0 sm:!h-9 sm:!w-9" aria-label="Filter statistics" disabled={accounts.length === 0}>
                  <LinearFilterIcon size={14} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="!w-[var(--statistics-filter-width)] !max-w-[calc(100vw-24px)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto">
              <DropdownMenuLabel>Ad account</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={selectedAccountId ?? ''} onValueChange={selectAccount}>
                {accounts.map((account) => (
                  <DropdownMenuRadioItem key={account.account_id} value={account.account_id}>
                    <span className="min-w-0 truncate">{metaAccountLabel(account)}</span>
                    {selectedAccountId === account.account_id && <LinearCheckIcon size={13} className="shrink-0" aria-hidden="true" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Reporting period</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={period} onValueChange={(value) => setPeriod(value as ReportingPeriod)}>
                {PERIOD_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {period === option.value && <LinearCheckIcon size={13} aria-hidden="true" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <Tooltip content="Display options" side="bottom" sideOffset={6}>
              <DropdownMenuTrigger asChild>
                <Button className="!h-11 !w-11 !rounded-[var(--control-border-radius)] !border-transparent !p-0 sm:!h-9 sm:!w-9" aria-label="Display options">
                  <LinearSlidersIcon size={14} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="!w-[var(--statistics-filter-width)] !max-w-[calc(100vw-24px)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto">
              <DropdownMenuLabel>Primary result</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={resultPreference} onValueChange={(value) => setResultPreference(value as ResultPreference)}>
                {RESULT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {resultPreference === option.value && <LinearCheckIcon size={13} aria-hidden="true" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Grouping</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={grouping} onValueChange={(value) => setGrouping(value as Grouping)}>
                {GROUPING_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {grouping === option.value && <LinearCheckIcon size={13} aria-hidden="true" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Row density</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={(value) => setDensity(value as typeof density)}>
                {([
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ] as const).map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {density === option.value && <LinearCheckIcon size={13} aria-hidden="true" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        <main className="flex min-h-full min-w-0 w-full flex-col gap-3">
          {accounts.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-[12px] text-[var(--text-muted)]">
              <span className="min-w-0 break-words text-[var(--text-secondary)]">
                {selectedAccount ? metaAccountLabel(selectedAccount) : 'Select an account'} · {periodLabel}
                {selectedAccount?.timezone_name ? ` · Reporting timezone ${selectedAccount.timezone_name}` : ''}
              </span>
              <span role="status">
                {hierarchyState === 'loading'
                  ? 'Loading stored Meta data…'
                  : hierarchy?.source === 'analytics_fact_store'
                    ? `Stored Meta data · ${formatFreshness(hierarchy.data_as_of)}`
                    : 'Stored Meta data unavailable'}
              </span>
            </div>
          )}

          {accounts.length > 0 && period === 'today' && (
            <div className="min-w-0 px-2 text-[12px] text-[var(--text-secondary)]" role="status">
              Today is still open: conversions reported for it are provisional and can keep arriving.
            </div>
          )}

          {hierarchyState === 'ready' && items.length > 0 && (
            <section className="min-w-0 rounded-[var(--canvas-border-radius)] bg-[var(--bg-sidebar)] p-2" aria-labelledby="statistics-overview-heading">
              <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-2 py-2">
                <h2 id="statistics-overview-heading" className="text-[14px] font-medium text-[var(--text-primary)]">Overview</h2>
                <span className="text-[12px] text-[var(--text-muted)]">{periodLabel} · {formatCount(items.length)} {levelLabel.plural}</span>
              </div>
              {!summary.currencyAvailable && (
                <div className="border-t border-[var(--color-border-primary)] px-4 py-2 text-[13px] text-[var(--text-secondary)]" role="status">
                  Monetary totals are unavailable because the result has an unknown or inconsistent currency. Row-level supported values remain visible.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <MetricCard
                  label="Spend"
                  value={summary.spend}
                  supporting={`${periodLabel} total`}
                  footnote={summary.dailyBudget ? `${summary.dailyBudget} daily budget delivering` : 'Daily budget unavailable'}
                />
                <MetricCard
                  label={resultDefinition.costLabel}
                  value={summary.costPerResult}
                  supporting="Primary decision metric"
                  emphasis
                  verdict={explainMissingTarget(summary.verdict)}
                />
                <MetricCard
                  label={resultDefinition.label}
                  value={formatCount(summary.results)}
                  supporting={`Meta ${resultDefinition.noun} actions`}
                  footnote={resultPreference !== 'auto'
                    ? 'Chosen in display options'
                    : declaredResultKind
                      ? 'Declared for this ad account in settings'
                      : 'Detected from the highest conversion volume'}
                />
                <MetricCard
                  label="Delivery"
                  value={`${formatCount(summary.delivering)} of ${formatCount(items.length)}`}
                  supporting={`${levelLabel.plural} delivering now`}
                  footnote={`${formatCount(summary.paused)} not delivering in this period`}
                />
              </div>
            </section>
          )}

          <section className="flex min-h-52 min-w-0 flex-1 flex-col overflow-hidden">
            <LinearDataListToolbar className="!h-auto min-h-11 flex-wrap gap-x-4 gap-y-2 py-1">
              <LinearTabs
                tabs={([
                  { id: 'campaign', label: 'Campaigns' },
                  { id: 'adset', label: 'Ad sets' },
                  { id: 'ad', label: 'Ads' },
                ] as const).map((tab) => ({
                  ...tab,
                  count: hierarchyState === 'ready' && trail.length === 0 && tab.id === level
                    ? hierarchy?.total
                    : undefined,
                }))}
                activeTabId={level}
                onChange={(id) => selectLevel(id as EntityLevel)}
                aria-label="Statistics entity level"
              />

              <label className="relative w-full sm:w-[220px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={`Search ${levelLabel.plural}`}
                  placeholder={`Search ${levelLabel.plural}…`}
                  className="w-full !border-transparent !bg-transparent !pl-9 hover:!bg-[var(--item-hover-bg)] focus:!border-[var(--focus-ring-color)]"
                />
              </label>
            </LinearDataListToolbar>

            {trail.length > 0 && (
              <nav aria-label="Statistics drill-down" className="flex min-w-0 flex-wrap items-center gap-1 px-2 pb-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => setTrail([])}
                  className="rounded-[var(--control-border-radius)] px-1.5 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
                >
                  {LEVEL_LABELS[level].plural.replace(/^./, (character) => character.toUpperCase())}
                </button>
                {trail.map((step, index) => {
                  const isLast = index === trail.length - 1;
                  return (
                    <React.Fragment key={step.id}>
                      <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                      {isLast ? (
                        <span aria-current="page" className="min-w-0 truncate px-1.5 py-0.5 text-[var(--text-primary)]">{step.name}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTrail((current) => current.slice(0, index + 1))}
                          className="min-w-0 truncate rounded-[var(--control-border-radius)] px-1.5 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
                        >
                          {step.name}
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            )}

            {renderData()}
          </section>
        </main>
      </div>
    </div>
  );
};
