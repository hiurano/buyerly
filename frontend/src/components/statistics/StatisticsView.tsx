import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Pause, Play, Search } from 'lucide-react';
import { ApiError, apiRequest } from '@/lib/api';
import type {
  AnalyticsHierarchyItem,
  AnalyticsHierarchyResponse,
  AnalyticsTimeseriesResponse,
  MetaAccount,
} from '@/lib/types';
import { Sparkline, TrendChart, type TrendPoint } from '@/components/statistics/TrendChart';
import { BudgetField } from '@/components/statistics/BudgetField';
import {
  deliveryHistoryEntry,
  describeEntities,
  reportBulkDelivery,
  setDeliveryForMany,
  setEntityBudget,
  setEntityDelivery,
  undoAction,
  type DeliveryStatus,
} from '@/lib/delivery';
import { pushHistory } from '@/lib/undoHistory';
import { toast } from '@/ui/toast';
import { EntityRowControls } from '@/components/campaigns/EntityRowCells';
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
  baselineFor,
  buildDiagnostics,
  changeBetween,
  decide,
  detectPrimaryResult,
  formatCount,
  type DecisionState,
  type DecisionVerdict,
  type EntityLevel,
  type PeriodChange,
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
  LINEAR_DATA_LIST,
  LinearDataListGroup,
  LinearDataListRow,
  LinearDataListToolbar,
  LinearDataMetricCell,
  linearDataNameColumn,
  LinearDataPrimaryCell,
  LinearDataTable,
} from '@/ui/LinearDataList';
import { LinearTabs } from '@/ui/LinearTabs';
import { SelectionDock } from '@/ui/SelectionDock';
import { SelectionCommandMenu } from '@/ui/SelectionCommandMenu';
import { useRowSelection, type SelectionAction } from '@/ui/useRowSelection';
import { Tooltip } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type StatisticsSort = 'name' | 'spend' | 'results' | 'cost' | 'change';
type Grouping = 'none' | 'decision' | 'delivery';
type Comparison = 'none' | 'previous';
type ResultPreference = 'auto' | ResultKind;

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * What this session sent to Meta for a row. The fact store is a snapshot that
 * catches up on its next sync, so the row shows the confirmed value from here
 * instead; the way back is Ctrl+Z.
 */
interface RowAction {
  busy?: boolean;
  status?: DeliveryStatus;
  dailyBudget?: number;
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

const COMPARISON_OPTIONS: SelectOption<Comparison>[] = [
  { value: 'none', label: 'No comparison' },
  { value: 'previous', label: 'Previous period' },
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

const CHANGE_GLYPH: Record<PeriodChange['direction'], string> = {
  up: '↑',
  down: '↓',
  flat: '→',
  unknown: '·',
};

const ChangeNote: React.FC<{ change: PeriodChange; className?: string }> = ({
  change,
  className = '',
}) => (
  <span className={`inline-flex min-w-0 items-center gap-1 text-[var(--text-secondary)] ${className}`}>
    <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">{CHANGE_GLYPH[change.direction]}</span>
    <span className="truncate tabular-nums">{change.label}</span>
  </span>
);

const MetricCard: React.FC<{
  label: string;
  value: string;
  supporting: string;
  /** The primary decision KPI carries a stronger border than its neighbours. */
  emphasis?: boolean;
  verdict?: DecisionVerdict;
  change?: PeriodChange;
  trend?: React.ReactNode;
  footnote?: string;
}> = ({ label, value, supporting, emphasis = false, verdict, change, trend, footnote }) => (
  <article
    className={`flex min-h-[var(--statistics-metric-height)] min-w-0 flex-col rounded-[var(--control-border-radius)] border bg-[var(--card-bg)] p-4 shadow-[var(--canvas-shadow)] ${
      emphasis ? 'border-[var(--statistics-primary-card-border)]' : 'border-[var(--card-border)]'
    }`}
  >
    <div className="text-[12px] font-medium text-[var(--text-muted)]">{label}</div>
    <div className="mt-2.5 flex min-w-0 items-end justify-between gap-3">
      <span className="min-w-0 break-words text-[length:var(--statistics-metric-mobile-font-size)] font-medium leading-none tracking-[-0.03em] text-[var(--text-primary)] tabular-nums sm:text-[length:var(--statistics-metric-font-size)]">
        {value.replace(/\u00a0/g, ' ')}
      </span>
      {/* The glyph yields to the number: on a narrow card there is no room for both. */}
      {trend && <span className="hidden shrink-0 sm:block">{trend}</span>}
    </div>
    <div className="mt-2 text-[12px] text-[var(--text-secondary)]">{supporting}</div>
    {change && <ChangeNote change={change} className="mt-1.5 text-[12px]" />}
    {verdict && <DecisionNote verdict={verdict} className="mt-auto pt-2 text-[12px]" />}
    {!verdict && footnote && <div className="mt-auto pt-2 text-[12px] text-[var(--text-muted)]">{footnote}</div>}
  </article>
);

interface StatisticsRowProps {
  item: AnalyticsHierarchyItem;
  columns: LinearDataListColumn[];
  /** Movement of the cost per result against the baseline, when there is one. */
  change: PeriodChange | null;
  compact: boolean;
  resultKind: ResultKind;
  verdict: DecisionVerdict;
  /** Denominator caption for the spend cell, already resolved to real data. */
  pace: { label: string; ratio: number | null };
  childLabel: string | null;
  onDrill: () => void;
  expanded: boolean;
  onToggleDiagnostics: () => void;
  /** Absent when the account cannot be acted on, which hides the controls. */
  action: RowAction | undefined;
  onSetDelivery: ((status: DeliveryStatus) => void) | null;
  onSetBudget: ((dailyBudget: number) => void) | null;
  /** Whether the row is part of the bulk selection. */
  selected: boolean;
  onToggleSelected: () => void;
}

const StatisticsRow: React.FC<StatisticsRowProps> = ({
  item,
  columns,
  change,
  compact,
  resultKind,
  verdict,
  pace,
  childLabel,
  onDrill,
  expanded,
  onToggleDiagnostics,
  action,
  onSetDelivery,
  onSetBudget,
  selected,
  onToggleSelected,
}) => {
  const definition = RESULT_DEFINITIONS[resultKind];
  const diagnosticsId = `statistics-diagnostics-${item.entity_id}`;
  const noun = LEVEL_LABELS[item.entity_level].singular;
  // What this session wrote wins over the snapshot.
  const liveStatus: DeliveryStatus = action?.status
    ?? (item.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED');
  const liveBudget = action?.dailyBudget ?? item.daily_budget;
  const budgetEditable = Boolean(onSetBudget) && liveBudget > 0;

  return (
    <div className="min-w-0" data-row-slot>
      <LinearDataListRow
        data-row-id={item.entity_id}
        selected={selected}
        layout="grid"
        columns={columns}
        height={compact ? LINEAR_DATA_LIST.rowHeight : LINEAR_DATA_LIST.rowHeightComfortable}
        className="text-left"
      >
        <LinearDataPrimaryCell
          sticky
          leading={(
            <EntityRowControls
              noun={noun}
              status={item.status === 'ACTIVE' ? 'active' : 'paused'}
              statusLabel={statusLabel(item)}
              delivery={onSetDelivery ? {
                status: liveStatus === 'ACTIVE' ? 'active' : 'paused',
                busy: Boolean(action?.busy),
                onChange: (next) => onSetDelivery(next ? 'ACTIVE' : 'PAUSED'),
              } : undefined}
              showStatus
              selectable
              selected={selected}
              onToggleSelected={onToggleSelected}
            />
          )}
          title={childLabel ? (
            <button
              type="button"
              onClick={onDrill}
              className="block max-w-full truncate rounded-[var(--control-border-radius)] text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
              aria-label={`Show ${childLabel} in ${item.entity_name}`}
            >
              {item.entity_name}
            </button>
          ) : item.entity_name}
          dimmed={liveStatus !== 'ACTIVE'}
          hint={`${item.entity_name} · ${item.entity_id}`}
        />

        <LinearDataMetricCell
          value={formatMetricMoney(item.spend, item.currency)}
          caption={(
            <>
              {pace.ratio !== null && (
                <span
                  aria-hidden="true"
                  className="h-[var(--statistics-pace-track-height)] w-[var(--statistics-pace-track-width)] shrink-0 overflow-hidden rounded-full bg-[var(--statistics-pace-track)]"
                >
                  <span
                    className="block h-full rounded-full bg-[var(--statistics-pace-fill)]"
                    style={{ width: `${Math.min(Math.max(pace.ratio, 0), 1) * 100}%` }}
                  />
                </span>
              )}
              <span className="truncate">{pace.label}</span>
            </>
          )}
        />

        <LinearDataMetricCell value={formatCount(definition.count(item))} />

        <LinearDataMetricCell
          emphasis
          value={formatMetricMoney(definition.cost(item), item.currency)}
          caption={!verdict.quiet && <DecisionNote verdict={verdict} />}
        />

        {change && (
          <LinearDataMetricCell
            value={<ChangeNote change={change} className="justify-end" />}
            caption="vs previous"
          />
        )}

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
        >
          <p className="text-[12px] text-[var(--text-secondary)]">{verdict.detail}</p>
          {onSetBudget && liveBudget > 0 && (
            <div className="mt-3 border-t border-[var(--color-border-primary)] pt-3">
              <BudgetField
                current={liveBudget}
                currency={item.currency}
                entityNoun={noun}
                busy={Boolean(action?.busy)}
                onSave={onSetBudget}
                formatMoney={(value) => formatMetricMoney(value, item.currency)}
              />
            </div>
          )}

          <div className="mt-3 grid gap-x-6 gap-y-4 md:grid-cols-3">
            {buildDiagnostics(item, resultKind).map((section) => ({
              ...section,
              // The editable field above already states the budget; repeating
              // the stored one beside it reads as a failed save.
              entries: budgetEditable
                ? section.entries.filter((entry) => entry.label !== 'Daily budget')
                : section.entries,
            })).map((section) => (
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
  const [comparison, setComparison] = useState<Comparison>('previous');
  const [hierarchy, setHierarchy] = useState<AnalyticsHierarchyResponse | null>(null);
  const [hierarchyState, setHierarchyState] = useState<LoadState>('idle');
  const [hierarchyError, setHierarchyError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('compact');
  const [grouping, setGrouping] = useState<Grouping>('none');
  const [resultPreference, setResultPreference] = useState<ResultPreference>('auto');
  const [sortKey, setSortKey] = useState<StatisticsSort>('spend');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [trend, setTrend] = useState<AnalyticsTimeseriesResponse | null>(null);
  const [trendOpen, setTrendOpen] = useState(false);
  const [rowActions, setRowActions] = useState<Record<string, RowAction>>({});
  // Rows picked for a bulk action.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
      + `&level=${queryLevel}&period=${period}&compare=${comparison}`,
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
  }, [comparison, parentId, period, queryLevel, reloadKey]);

  // The trend window is fixed at two weeks and does not follow the reporting
  // period: its job is to say whether a movement lasted, not to restate it.
  useEffect(() => {
    setTrend(null);
    if (!parentId) return undefined;
    let current = true;
    void apiRequest<AnalyticsTimeseriesResponse>(
      `/api/analytics/timeseries?parent_id=${encodeURIComponent(parentId)}`
      + `&level=${queryLevel}&days=14`,
    )
      .then((response) => {
        if (current) setTrend(response);
      })
      .catch(() => {
        // A missing trend is not worth an error state: the numbers above it
        // are unaffected, and the card simply renders without its glyph.
        if (current) setTrend(null);
      });
    return () => {
      current = false;
    };
  }, [parentId, queryLevel, reloadKey]);

  const selectedAccount = accounts.find((account) => account.account_id === selectedAccountId) ?? null;
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Last 7 days';
  const levelLabel = LEVEL_LABELS[queryLevel];
  const childLevel = CHILD_LEVEL[queryLevel] ?? null;
  const childLabel = childLevel ? LEVEL_LABELS[childLevel].plural : null;
  /** What the rows in view are a share of: the ad account, or the entity drilled into. */
  const parentScope = parent ? LEVEL_LABELS[parent.level].singular : 'account';
  const items = useMemo(() => hierarchy?.items ?? [], [hierarchy]);
  const comparisonMeta = hierarchy?.comparison;
  const comparisonAvailable = comparisonMeta?.available ?? false;

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
    // The baseline covers the same rows: an entity that ran only in the earlier
    // window is history, and contributes nothing to either side.
    const hasBaseline = items.some((item) => item.previous);
    const previousSpend = items.reduce((total, item) => total + (item.previous?.spend ?? 0), 0);
    const previousResults = items.reduce(
      (total, item) => total + (item.previous ? resultDefinition.count(item.previous) : 0),
      0,
    );
    const previousCostPerResult = hasBaseline && currency && previousResults > 0
      ? previousSpend / previousResults
      : null;
    return {
      spendValue: spend,
      spendChange: changeBetween(spend, hasBaseline ? previousSpend : null),
      resultsChange: changeBetween(results, hasBaseline ? previousResults : null),
      costChange: changeBetween(costPerResult, previousCostPerResult),
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

  const trendPoints: TrendPoint[] = useMemo(() => (
    (trend?.points ?? []).map((point) => ({
      date: point.date,
      hasData: point.has_data,
      value: point.has_data ? resultDefinition.cost(point) : null,
    }))
  ), [resultDefinition, trend]);

  const trendCurrency = trend?.currency || '';
  const trendReadable = trendPoints.filter((point) => point.hasData && point.value !== null);
  // Two readable points is the minimum that can show a direction at all, and a
  // mixed-currency window cannot be put on one money axis.
  const trendUsable = trendReadable.length >= 2 && trendCurrency !== '';

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
      if (sortKey === 'change') {
        const movement = (item: AnalyticsHierarchyItem) => {
          const current = resultDefinition.cost(item);
          const baseline = baselineFor(item.previous, resultKind).cost;
          if (current === null || baseline === null || baseline === 0) return null;
          return (current - baseline) / baseline;
        };
        return optionalMetric(movement(left), movement(right));
      }
      return (left.spend - right.spend) * direction;
    });
  }, [items, query, resultDefinition, resultKind, sortDirection, sortKey]);

  const columns: LinearDataListColumn[] = useMemo(() => [
    linearDataNameColumn({ width: 'minmax(260px, 1fr)' }),
    { id: 'spend', label: 'Spend', width: '180px', align: 'right', sortable: true },
    { id: 'results', label: resultDefinition.label, width: '100px', align: 'right', sortable: true },
    { id: 'cost', label: resultDefinition.costLabel, width: '140px', align: 'right', sortable: true },
    ...(comparisonAvailable
      ? [{ id: 'change', label: 'Change', width: '120px', align: 'right' as const, sortable: true }]
      : []),
    { id: 'diagnostics', label: '', width: '40px', align: 'right' },
  ], [comparisonAvailable, queryLevel, resultDefinition]);

  /** Movement of the decision metric, which is what the Change column reports. */
  const changeFor = useCallback((item: AnalyticsHierarchyItem): PeriodChange | null => {
    if (!comparisonAvailable) return null;
    return changeBetween(resultDefinition.cost(item), baselineFor(item.previous, resultKind).cost);
  }, [comparisonAvailable, resultDefinition, resultKind]);

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
    setRowActions({});
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

  const patchAction = useCallback((entityId: string, patch: RowAction | null) => {
    setRowActions((current) => {
      if (patch === null) {
        const { [entityId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [entityId]: { ...current[entityId], ...patch } };
    });
  }, []);

  const actionErrorMessage = (error: unknown): string => (
    error instanceof ApiError || error instanceof Error
      ? error.message
      : 'The action could not be confirmed. Check Meta before retrying.'
  );

  /** Shows delivery this session wrote on the given rows. */
  const showDelivery = useCallback((entityIds: string[], status: DeliveryStatus) => {
    entityIds.forEach((entityId) => patchAction(entityId, { busy: false, status }));
  }, [patchAction]);

  /** One row's toggle: the row shows the result, Ctrl+Z takes it back, only a failure speaks. */
  const runDelivery = useCallback(async (item: AnalyticsHierarchyItem, status: DeliveryStatus) => {
    if (!selectedAccountId) return;
    const accountId = selectedAccountId;
    const verb = status === 'ACTIVE' ? 'resume' : 'pause';
    const inWorkspace = useAppStore.getState().captureScope();
    const generation = requestGenerationRef.current;
    const onAccount = () => inWorkspace() && generation === requestGenerationRef.current;
    patchAction(item.entity_id, { busy: true });
    try {
      const result = await setEntityDelivery(item.entity_level, item.entity_id, accountId, status);
      if (!inWorkspace()) return;
      if (onAccount()) showDelivery([item.entity_id], result.status);
      if (result.changed && result.audit_event_id) {
        pushHistory(deliveryHistoryEntry({
          label: `${verb} ${item.entity_name}`,
          accountId,
          targets: [{ level: item.entity_level, entityId: item.entity_id }],
          status,
          auditEventIds: [result.audit_event_id],
          onStatus: (ids, status) => { if (onAccount()) showDelivery(ids, status); },
        }));
      }
    } catch (error) {
      if (!inWorkspace()) return;
      if (onAccount()) patchAction(item.entity_id, { busy: false });
      toast.show({ tone: 'error', title: `Couldn't ${verb}`, message: item.entity_name, description: actionErrorMessage(error) });
    }
  }, [patchAction, selectedAccountId, showDelivery]);

  /** A budget edit, reversible through the audit row it wrote. */
  const runBudget = useCallback(async (item: AnalyticsHierarchyItem, dailyBudget: number) => {
    if (!selectedAccountId) return;
    const accountId = selectedAccountId;
    const inWorkspace = useAppStore.getState().captureScope();
    const generation = requestGenerationRef.current;
    const onAccount = () => inWorkspace() && generation === requestGenerationRef.current;
    patchAction(item.entity_id, { busy: true });
    try {
      const result = await setEntityBudget(item.entity_level, item.entity_id, accountId, dailyBudget);
      if (!inWorkspace()) return;
      if (onAccount()) patchAction(item.entity_id, { busy: false, dailyBudget: result.daily_budget });
      const previousBudget = result.previous_daily_budget;
      if (result.changed && result.audit_event_id && previousBudget !== undefined) {
        let reversible = result.audit_event_id;
        pushHistory({
          label: `set the daily budget of ${item.entity_name} to ${formatMetricMoney(result.daily_budget, item.currency)}`,
          undo: async () => {
            if (!inWorkspace()) return;
            await undoAction(reversible);
            if (!onAccount()) return;
            patchAction(item.entity_id, { dailyBudget: previousBudget });
          },
          redo: async () => {
            if (!inWorkspace()) return;
            const again = await setEntityBudget(item.entity_level, item.entity_id, accountId, result.daily_budget);
            if (!again.audit_event_id) throw new Error('Meta did not record the change, so it cannot be undone again.');
            reversible = again.audit_event_id;
            if (onAccount()) patchAction(item.entity_id, { dailyBudget: again.daily_budget });
          },
        });
      }
    } catch (error) {
      if (!inWorkspace()) return;
      if (onAccount()) patchAction(item.entity_id, { busy: false });
      toast.show({
        tone: 'error',
        title: "Couldn't change the budget",
        message: `of ${item.entity_name}`,
        description: actionErrorMessage(error),
      });
    }
  }, [patchAction, selectedAccountId]);

  // A selection belongs to one account, level, drill-down and period.
  useEffect(() => {
    setSelectedIds([]);
  }, [selectedAccountId, queryLevel, parentId, period]);

  /** Pauses or resumes every selected row that can be acted on; only what failed is reported. */
  const runBulkDelivery = async (status: DeliveryStatus) => {
    if (!selectedAccountId) return;
    const accountId = selectedAccountId;
    const inWorkspace = useAppStore.getState().captureScope();
    const generation = requestGenerationRef.current;
    const onAccount = () => inWorkspace() && generation === requestGenerationRef.current;
    const selected = items.filter((item) => selectedIds.includes(item.entity_id));
    // The same rows that show a live toggle: delivery Meta lets us change.
    const eligible = selected.filter((item) => ['ACTIVE', 'PAUSED'].includes(item.status));
    eligible.forEach((item) => patchAction(item.entity_id, { busy: true }));
    const outcome = await setDeliveryForMany(
      eligible.map((item) => ({ level: item.entity_level, entityId: item.entity_id })),
      accountId,
      status,
      inWorkspace,
    );
    if (!inWorkspace()) return;
    const confirmed = new Set([...outcome.changed.map((entry) => entry.entityId), ...outcome.unchanged]);
    if (onAccount()) eligible.forEach((item) => patchAction(item.entity_id, confirmed.has(item.entity_id)
      ? { busy: false, status }
      : { busy: false }));
    const changed = eligible.filter((item) => outcome.changed.some((entry) => entry.entityId === item.entity_id));
    if (changed.length > 0) {
      pushHistory(deliveryHistoryEntry({
        label: `${status === 'ACTIVE' ? 'resume' : 'pause'} ${describeEntities(changed.map((item) => item.entity_name), levelLabel)}`,
        accountId,
        targets: changed.map((item) => ({ level: item.entity_level, entityId: item.entity_id })),
        status,
        auditEventIds: outcome.changed.flatMap((entry) => (entry.auditEventId ? [entry.auditEventId] : [])),
        onStatus: (ids, status) => { if (onAccount()) showDelivery(ids, status); },
      }));
    }
    reportBulkDelivery(outcome, status, levelLabel, selected.length - eligible.length);
  };

  const selectionActions: SelectionAction[] = [
    { id: 'pause', label: 'Pause delivery', shortcut: 'p', icon: <Pause size={14} />, run: () => void runBulkDelivery('PAUSED') },
    { id: 'resume', label: 'Resume delivery', shortcut: 'r', icon: <Play size={14} />, run: () => void runBulkDelivery('ACTIVE') },
  ];
  const visibleRowIds = useMemo(() => visibleItems.map((item) => item.entity_id), [visibleItems]);
  const selection = useRowSelection({
    selectedIds,
    visibleIds: visibleRowIds,
    setSelection: setSelectedIds,
    actions: selectionActions,
    enabled: hierarchyState === 'ready' && Boolean(selectedAccountId),
  });

  const renderRow = (item: AnalyticsHierarchyItem) => (
    <StatisticsRow
      key={item.entity_id}
      item={item}
      columns={columns}
      change={changeFor(item)}
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
      action={rowActions[item.entity_id]}
      onSetDelivery={selectedAccountId && ['ACTIVE', 'PAUSED'].includes(item.status) ? (status) => void runDelivery(item, status) : null}
      // An ad carries no budget of its own, so the field is never offered there.
      onSetBudget={selectedAccountId && item.entity_level !== 'ad'
        ? (dailyBudget) => void runBudget(item, dailyBudget)
        : null}
      selected={selectedIds.includes(item.entity_id)}
      onToggleSelected={() => selection.toggle(item.entity_id)}
    />
  );

  const renderGroups = () => {
    if (grouping === 'decision') {
      return DECISION_ORDER.map((state: DecisionState) => {
        const groupItems = visibleItems.filter((item) => verdictFor(item).state === state);
        if (groupItems.length === 0) return null;
        const presentation = DECISION_PRESENTATION[state];
        return (
          <LinearDataListGroup
            key={state}
            title={presentation.title}
            count={groupItems.length}
            dotColor={presentation.dotColor}
            description={presentation.description}
          >
            {groupItems.map(renderRow)}
          </LinearDataListGroup>
        );
      });
    }
    if (grouping === 'delivery') {
      const statuses = [...new Set(visibleItems.map(statusLabel))].sort();
      return statuses.map((status) => {
        const groupItems = visibleItems.filter((item) => statusLabel(item) === status);
        return (
          <LinearDataListGroup
            key={status}
            title={status}
            count={groupItems.length}
            dotColor={statusDot(groupItems[0])}
            description={`Meta delivery status ${status.toLowerCase()}`}
          >
            {groupItems.map(renderRow)}
          </LinearDataListGroup>
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
      <LinearDataTable
        columns={columns}
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
      >
        {renderGroups()}
      </LinearDataTable>
    );
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-transparent">
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
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Compare with</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={comparison} onValueChange={(value) => setComparison(value as Comparison)}>
                {COMPARISON_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {comparison === option.value && <LinearCheckIcon size={13} aria-hidden="true" />}
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

          {accounts.length > 0 && comparisonMeta?.requested && !comparisonMeta.available && comparisonMeta.reason && (
            <div className="min-w-0 px-2 text-[12px] text-[var(--text-secondary)]" role="status">
              Comparison unavailable. {comparisonMeta.reason}
            </div>
          )}

          {accounts.length > 0 && comparisonAvailable && comparisonMeta?.current_includes_open_day && (
            <div className="min-w-0 px-2 text-[12px] text-[var(--text-secondary)]" role="status">
              The reported window still contains today, so every change keeps moving until the day closes.
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
                  change={comparisonAvailable ? summary.spendChange : undefined}
                  footnote={summary.dailyBudget ? `${summary.dailyBudget} daily budget delivering` : 'Daily budget unavailable'}
                />
                <MetricCard
                  label={resultDefinition.costLabel}
                  value={summary.costPerResult}
                  supporting="Primary decision metric"
                  emphasis
                  trend={trendUsable ? (
                    <Sparkline points={trendPoints} label={resultDefinition.costLabel} />
                  ) : undefined}
                  change={comparisonAvailable ? summary.costChange : undefined}
                  verdict={explainMissingTarget(summary.verdict)}
                />
                <MetricCard
                  label={resultDefinition.label}
                  value={formatCount(summary.results)}
                  supporting={`Meta ${resultDefinition.noun} actions`}
                  change={comparisonAvailable ? summary.resultsChange : undefined}
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

              {trendUsable && (
                <div className="mt-2 min-w-0 rounded-[var(--control-border-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
                  <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
                      {resultDefinition.costLabel} per day
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-[var(--text-muted)]">
                        Last {formatCount(trendPoints.length)} days · {trend?.timezone}
                      </span>
                      <Button
                        size="compact"
                        aria-expanded={trendOpen}
                        aria-controls="statistics-trend-chart"
                        onClick={() => setTrendOpen((open) => !open)}
                      >
                        {trendOpen ? 'Hide trend' : 'Show trend'}
                      </Button>
                    </div>
                  </div>
                  {trendOpen && (
                    <div id="statistics-trend-chart" className="mt-2">
                      <TrendChart
                        points={trendPoints}
                        label={resultDefinition.costLabel}
                        formatValue={(value) => formatMetricMoney(value, trendCurrency)}
                        target={costTarget}
                        openDay={trend?.open_day ?? ''}
                      />
                      <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                        The last point is today and still moving. A day the fact store never
                        received is a gap, not a day without spend.
                      </p>
                    </div>
                  )}
                </div>
              )}
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
      <SelectionDock count={selection.count} onOpenActions={() => selection.setMenuOpen(true)} onClear={selection.clear} />
      <SelectionCommandMenu
        open={selection.menuOpen}
        onOpenChange={selection.setMenuOpen}
        scopeLabel={`${selection.count} ${selection.count === 1 ? levelLabel.singular : levelLabel.plural}`}
        actions={selectionActions}
      />
    </div>
  );
};
