import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Search,
} from 'lucide-react';
import {
  LinearCheckIcon,
  LinearFilterIcon,
  LinearSidebarLeftToggleIcon,
  LinearSlidersIcon,
} from '@/icons/LinearIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import { LinearToggle } from '@/ui/LinearToggle';
import {
  LinearDataListColumnHeader,
  LinearDataListColumn,
  LinearDataListGroupHeader,
  LinearDataListRow,
  LinearDataListStack,
  LinearDataListToolbar,
  LinearDataListViewport,
} from '@/ui/LinearDataList';
import { LinearTabs } from '@/ui/LinearTabs';
import { useAppStore } from '@/store/useAppStore';

type DecisionState = 'action' | 'watch' | 'on-target' | 'learning';

interface SelectOption {
  value: string;
  label: string;
}

interface CampaignMetric {
  id: string;
  name: string;
  account: string;
  status: 'Active' | 'Paused';
  spend: number;
  budget: number;
  results: number;
  cpl: number | null;
  cplTarget: number;
  roas: number | null;
  roasTarget: number;
  change: number | null;
  state: DecisionState;
  stateLabel: string;
}

interface CampaignGroup {
  state: DecisionState;
  label: string;
  description: string;
}

const SCOPE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'scaling', label: 'Scaling' },
  { value: 'tests', label: 'Tests' },
  { value: 'retargeting', label: 'Retargeting' },
];

const PERIOD_OPTIONS: SelectOption[] = [
  { value: 'today', label: 'Today' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
];

const COMPARE_OPTIONS: SelectOption[] = [
  { value: 'previous', label: 'Previous period' },
  { value: 'baseline', label: '28-day baseline' },
  { value: 'none', label: 'No comparison' },
];

const CAMPAIGN_GROUPS: CampaignGroup[] = [
  { state: 'action', label: 'Needs attention', description: 'Outside target with meaningful spend' },
  { state: 'watch', label: 'Monitoring', description: 'Close to the decision threshold' },
  { state: 'on-target', label: 'On target', description: 'Healthy performance' },
  { state: 'learning', label: 'Learning', description: 'Not enough data to evaluate' },
];

const STATISTICS_COLUMNS: LinearDataListColumn[] = [
  { id: 'name', label: 'Campaign', width: 'minmax(260px, 1fr)', headerInset: 40, sortable: true },
  { id: 'spend', label: 'Spend / budget', width: '150px', align: 'right', sortable: true },
  { id: 'results', label: 'Qualified leads', width: '105px', align: 'right', sortable: true },
  { id: 'cpl', label: 'CPL', width: '145px', align: 'right', sortable: true },
  { id: 'roas', label: 'ROAS', width: '125px', align: 'right', sortable: true },
  { id: 'change', label: 'Change', width: '100px', align: 'right', sortable: true },
];

const CAMPAIGNS: CampaignMetric[] = [
  {
    id: 'creative-test',
    name: 'Creative Test — Batch 08',
    account: 'Main Leadgen · US',
    status: 'Active',
    spend: 2880,
    budget: 3000,
    results: 48,
    cpl: 60,
    cplTarget: 45,
    roas: 1.84,
    roasTarget: 2.5,
    change: 24,
    state: 'action',
    stateLabel: 'CPL 33% above target',
  },
  {
    id: 'lookalike',
    name: 'Lookalike — Qualified leads',
    account: 'Growth Account · CA',
    status: 'Active',
    spend: 1460,
    budget: 2400,
    results: 29,
    cpl: 50.34,
    cplTarget: 45,
    roas: 2.31,
    roasTarget: 2.5,
    change: 9,
    state: 'watch',
    stateLabel: 'CPL 12% above target',
  },
  {
    id: 'prospecting-broad',
    name: 'Prospecting — Broad',
    account: 'Main Leadgen · US',
    status: 'Active',
    spend: 9420,
    budget: 10000,
    results: 232,
    cpl: 40.6,
    cplTarget: 45,
    roas: 3.08,
    roasTarget: 2.5,
    change: -6,
    state: 'on-target',
    stateLabel: 'CPL 10% below target',
  },
  {
    id: 'retargeting',
    name: 'Retargeting — 30 days',
    account: 'Main Leadgen · US',
    status: 'Active',
    spend: 1710,
    budget: 2000,
    results: 61,
    cpl: 28.03,
    cplTarget: 45,
    roas: 4.12,
    roasTarget: 2.5,
    change: -4,
    state: 'on-target',
    stateLabel: 'CPL 38% below target',
  },
  {
    id: 'new-offer',
    name: 'New Offer — Validation',
    account: 'Tests · UK',
    status: 'Active',
    spend: 318,
    budget: 1200,
    results: 4,
    cpl: null,
    cplTarget: 45,
    roas: null,
    roasTarget: 2.5,
    change: null,
    state: 'learning',
    stateLabel: '4 of 15 results required',
  },
];

const STATE_STYLES: Record<DecisionState, { dotColor: string; text: string }> = {
  action: { dotColor: 'rgb(244, 63, 94)', text: 'text-rose-400' },
  watch: { dotColor: 'rgb(251, 191, 36)', text: 'text-amber-400' },
  'on-target': { dotColor: 'rgb(16, 185, 129)', text: 'text-emerald-400' },
  learning: { dotColor: 'rgb(107, 114, 128)', text: 'text-[var(--text-muted)]' },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const MetricSummary: React.FC<{
  label: string;
  value: string;
  supporting: string;
  trend: string;
  tone?: 'positive' | 'neutral';
  progress?: number;
}> = ({ label, value, supporting, trend, tone = 'neutral', progress }) => (
  <article className="flex min-h-[136px] min-w-0 flex-col rounded-[8px] border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--canvas-shadow)] transition-colors hover:bg-[var(--item-hover-bg)]">
    <div className="text-[12px] font-medium text-[var(--text-muted)]">{label}</div>
    <div className="mt-2.5 flex items-end gap-2.5">
      <span className="font-mono text-[26px] font-medium leading-none tracking-[-0.035em] text-[var(--text-primary)] tabular-nums">{value}</span>
      <span className={`pb-0.5 text-[11px] ${tone === 'positive' ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>{trend}</span>
    </div>
    <div className="mt-2.5 text-[12px] text-[var(--text-secondary)]">{supporting}</div>
    {progress !== undefined && (
      <div className="mt-auto h-1 overflow-hidden rounded-full bg-[var(--bg-sidebar)]">
        <div className="h-full rounded-full bg-[var(--text-tertiary)]" style={{ width: `${progress}%` }} />
      </div>
    )}
  </article>
);

const LiveMetricCard: React.FC<{
  label: string;
  value: string;
  supporting: string;
  status?: string;
  progress?: number;
}> = ({ label, value, supporting, status, progress }) => (
  <article className="flex min-h-[112px] min-w-0 flex-col rounded-[8px] border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--canvas-shadow)] transition-colors hover:bg-[var(--item-hover-bg)]">
    <div className="text-[12px] font-medium text-[var(--text-muted)]">{label}</div>
    <div className="mt-2.5 flex items-end gap-2.5">
      <span className="font-mono text-[22px] font-medium leading-none tracking-[-0.03em] text-[var(--text-primary)] tabular-nums">{value}</span>
      {status && <span className="pb-0.5 text-[11px] text-emerald-400">{status}</span>}
    </div>
    <div className="mt-2.5 text-[11px] text-[var(--text-secondary)]">{supporting}</div>
    {progress !== undefined && (
      <div className="mt-auto h-1 overflow-hidden rounded-full bg-[var(--bg-sidebar)]">
        <div className="h-full rounded-full bg-emerald-500/75" style={{ width: `${progress}%` }} />
      </div>
    )}
  </article>
);

const CampaignRow: React.FC<{ campaign: CampaignMetric; compact: boolean }> = ({ campaign, compact }) => {
  const state = STATE_STYLES[campaign.state];
  const pace = Math.min((campaign.spend / campaign.budget) * 100, 100);
  const [isActive, setIsActive] = useState(campaign.status === 'Active');
  const cplDelta = campaign.cpl === null ? null : ((campaign.cpl - campaign.cplTarget) / campaign.cplTarget) * 100;
  const roasDelta = campaign.roas === null ? null : ((campaign.roas - campaign.roasTarget) / campaign.roasTarget) * 100;

  return (
    <LinearDataListRow
      layout="grid"
      columns={STATISTICS_COLUMNS}
      height={compact ? 38 : 44}
      className="min-w-[940px] text-left"
    >
        <div className="sticky left-0 z-[1] flex min-w-0 items-center gap-3 bg-[var(--bg-canvas)] transition-colors group-hover/row:bg-[var(--item-hover-bg)]">
          <LinearToggle
            checked={isActive}
            onChange={setIsActive}
            tooltipContent={isActive ? 'Pause campaign' : 'Resume campaign'}
          />
          <div className="min-w-0">
            <div className={`truncate text-[13px] font-medium ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>{campaign.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{campaign.account}</div>
          </div>
        </div>

        <div className="min-w-0 text-right">
          <div className="font-mono text-[12px] text-[var(--text-primary)] tabular-nums">
            {formatCurrency(campaign.spend)} <span className="text-[var(--text-muted)]">/ {formatCurrency(campaign.budget)}</span>
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <div className="h-1 w-[54px] overflow-hidden rounded-full bg-[var(--bg-sidebar)]">
              <div className="h-full rounded-full bg-[var(--text-tertiary)]" style={{ width: `${pace}%` }} />
            </div>
            <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">{Math.round(pace)}% paced</span>
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono text-[12px] text-[var(--text-primary)] tabular-nums">{campaign.results}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">leads</div>
        </div>

        <div className="min-w-0 text-right">
          <div className={`font-mono text-[12px] font-medium tabular-nums ${campaign.cpl === null ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
            {campaign.cpl === null ? 'Not ready' : `$${campaign.cpl.toFixed(2)}`}
          </div>
          <div className={`mt-0.5 truncate text-[11px] ${state.text}`}>
            {cplDelta === null ? campaign.stateLabel : `${Math.abs(cplDelta).toFixed(0)}% ${cplDelta > 0 ? 'above' : 'below'} $${campaign.cplTarget.toFixed(0)} target`}
          </div>
        </div>

        <div className="min-w-0 text-right">
          <div className={`font-mono text-[12px] font-medium tabular-nums ${campaign.roas === null ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
            {campaign.roas === null ? 'Not ready' : `${campaign.roas.toFixed(2)}×`}
          </div>
          <div className={`mt-0.5 truncate text-[11px] ${roasDelta === null ? 'text-[var(--text-muted)]' : roasDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {roasDelta === null ? 'Waiting for revenue' : `${Math.abs(roasDelta).toFixed(0)}% ${roasDelta >= 0 ? 'above' : 'below'} ${campaign.roasTarget.toFixed(2)}× target`}
          </div>
        </div>

        <div className="text-right">
          {campaign.change === null ? (
            <span className="text-[11px] text-[var(--text-muted)]">—</span>
          ) : (
            <span className={`inline-flex items-center gap-0.5 font-mono text-[11px] font-medium tabular-nums ${campaign.change > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {campaign.change > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {Math.abs(campaign.change)}%
            </span>
          )}
          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">vs previous</div>
        </div>
    </LinearDataListRow>
  );
};

export const StatisticsView: React.FC = () => {
  const { isSidebarCollapsed, toggleSidebarCollapsed } = useAppStore();
  const [scope, setScope] = useState('all');
  const [period, setPeriod] = useState('7d');
  const [compare, setCompare] = useState('previous');
  const [grouping, setGrouping] = useState('decision');
  const [density, setDensity] = useState('comfortable');
  const [query, setQuery] = useState('');
  const [statisticsTab, setStatisticsTab] = useState('campaigns');
  const [statisticsSort, setStatisticsSort] = useState<'name' | 'spend' | 'results' | 'cpl' | 'roas' | 'change'>('spend');
  const [statisticsSortDirection, setStatisticsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [collapsedStatisticsGroups, setCollapsedStatisticsGroups] = useState<DecisionState[]>([]);

  const scopeLabel = SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? 'All accounts';
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '7 days';
  const compareLabel = COMPARE_OPTIONS.find((option) => option.value === compare)?.label ?? 'Previous period';
  const filterActive = scope !== 'all' || period !== '7d' || compare !== 'previous';
  const displayActive = grouping !== 'decision' || density !== 'comfortable';

  const visibleCampaigns = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matching = normalized
      ? CAMPAIGNS.filter((campaign) => `${campaign.name} ${campaign.account}`.toLowerCase().includes(normalized))
      : CAMPAIGNS;
    const directionFactor = statisticsSortDirection === 'asc' ? 1 : -1;
    return [...matching].sort((a, b) => {
      if (statisticsSort === 'name') return a.name.localeCompare(b.name) * directionFactor;
      if (statisticsSort === 'results') return (a.results - b.results) * directionFactor;
      if (statisticsSort === 'cpl') {
        if (a.cpl === null) return 1;
        if (b.cpl === null) return -1;
        return (a.cpl - b.cpl) * directionFactor;
      }
      if (statisticsSort === 'roas') {
        if (a.roas === null) return 1;
        if (b.roas === null) return -1;
        return (a.roas - b.roas) * directionFactor;
      }
      if (statisticsSort === 'change') {
        if (a.change === null) return 1;
        if (b.change === null) return -1;
        return (a.change - b.change) * directionFactor;
      }
      return (a.spend - b.spend) * directionFactor;
    });
  }, [query, statisticsSort, statisticsSortDirection]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent select-none">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border-primary)] px-[14px]">
        <div className="flex min-w-0 items-center gap-2">
          {isSidebarCollapsed && (
            <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
              <button type="button" onClick={toggleSidebarCollapsed} className="linear-icon-btn" aria-label="Open sidebar">
                <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--text-primary)]">Statistics</span>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-[6px]">
          <DropdownMenu>
            <Tooltip content="Add filter" shortcut="F" side="bottom" sideOffset={6}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="linear-icon-btn relative" aria-label="Add filter">
                  <LinearFilterIcon size={14} />
                  {filterActive && <span className="absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full bg-[var(--accent-color,#5e6ad2)] ring-2 ring-[var(--card-bg)]" />}
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" style={{ width: '248px' }}>
              <DropdownMenuLabel>Filter statistics</DropdownMenuLabel>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span>Accounts</span>
                  <span className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">{scopeLabel}<ChevronRight size={12} /></span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
                    {SCOPE_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <span>{option.label}</span>
                        {scope === option.value && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span>Period</span>
                  <span className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">{periodLabel}<ChevronRight size={12} /></span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={period} onValueChange={setPeriod}>
                    {PERIOD_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <span>{option.label}</span>
                        {period === option.value && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span>Comparison</span>
                  <span className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">{compareLabel}<ChevronRight size={12} /></span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={compare} onValueChange={setCompare}>
                    {COMPARE_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <span>{option.label}</span>
                        {compare === option.value && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {filterActive && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { setScope('all'); setPeriod('7d'); setCompare('previous'); }}>
                    <span>Reset filters</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <Tooltip content="Display options" shortcut="D" side="bottom" sideOffset={6}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="linear-icon-btn relative" aria-label="Display options">
                  <LinearSlidersIcon size={14} />
                  {displayActive && <span className="absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full bg-[var(--accent-color,#5e6ad2)] ring-2 ring-[var(--card-bg)]" />}
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" style={{ width: '250px' }}>
              <DropdownMenuLabel>Grouping</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={grouping} onValueChange={setGrouping}>
                {[
                  { value: 'decision', label: 'Decision status' },
                  { value: 'account', label: 'Account' },
                  { value: 'none', label: 'No grouping' },
                ].map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {grouping === option.value && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Density</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                {[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ].map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                    {density === option.value && <LinearCheckIcon size={13} className="text-[var(--text-primary)]" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <main className="min-h-full w-full">
          <section className="rounded-[10px] bg-[var(--bg-sidebar)] p-2">
            <div className="flex h-9 items-center justify-between px-2">
              <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Overview</h2>
              <span className="text-[11px] text-[var(--text-muted)]">Updated 2 min ago</span>
            </div>

            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <MetricSummary label="Spend" value="$38,240" trend="+2% vs pace" supporting="$41,100 planned · 93% delivered" progress={93} />
              <MetricSummary label="Cost per lead" value="$41.20" trend="8.4% below target" supporting="Target $45.00 · primary decision KPI" tone="positive" />
              <MetricSummary label="Qualified leads" value="928" trend="+7.8%" supporting="vs previous period" tone="positive" />
              <MetricSummary label="ROAS" value="2.76×" trend="10.4% above target" supporting="Target 2.50×" tone="positive" />
            </div>
          </section>

          <section className="mt-3 rounded-[10px] bg-[var(--bg-sidebar)] p-2">
            <div className="flex h-9 items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Live today</h2>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">Updated 2 min ago</span>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <LiveMetricCard label="Spend today" value="$6,420" supporting="$13,950 daily plan" />
              <LiveMetricCard label="Daily pacing" value="46%" status="On track" supporting="Expected pace 44%" progress={46} />
              <LiveMetricCard label="Campaigns delivering" value="7" status="Healthy" supporting="No delivery issues detected" />
            </div>
          </section>

          <section className="mt-3">
            <LinearDataListToolbar>
              <LinearTabs
                tabs={[
                  { id: 'campaigns', label: 'Campaigns' },
                  { id: 'adsets', label: 'Ad sets' },
                  { id: 'ads', label: 'Ads' },
                ]}
                activeTabId={statisticsTab}
                onChange={setStatisticsTab}
              />

              <div className="flex items-center">
                <label className="flex h-8 w-[220px] items-center gap-2 rounded-[6px] border border-transparent px-2.5 text-[var(--text-muted)] transition-colors focus-within:border-[var(--color-border-secondary)] focus-within:bg-[var(--bg-sidebar)] hover:bg-[var(--item-hover-bg)]">
                  <Search size={13} aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search campaigns…"
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </label>
              </div>
            </LinearDataListToolbar>

            <LinearDataListViewport horizontal>
              <div className="min-w-[940px]">
                <LinearDataListColumnHeader
                  columns={STATISTICS_COLUMNS}
                  minWidth={940}
                  sortKey={statisticsSort}
                  sortDirection={statisticsSortDirection}
                  onSort={(columnId) => {
                    if (statisticsSort === columnId) {
                      setStatisticsSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
                    } else {
                      setStatisticsSort(columnId as typeof statisticsSort);
                      setStatisticsSortDirection(columnId === 'name' || columnId === 'cpl' ? 'asc' : 'desc');
                    }
                  }}
                />

                <LinearDataListStack className="mt-0.5">
                  {CAMPAIGN_GROUPS.map((group) => {
                    const groupCampaigns = visibleCampaigns.filter((campaign) => campaign.state === group.state);
                    if (!groupCampaigns.length) return null;
                    const state = STATE_STYLES[group.state];
                    const isCollapsed = collapsedStatisticsGroups.includes(group.state);

                    return (
                      <div key={group.state}>
                        <LinearDataListGroupHeader
                          title={group.label}
                          count={groupCampaigns.length}
                          dotColor={state.dotColor}
                          description={group.description}
                          isCollapsed={isCollapsed}
                          onToggleCollapse={() => setCollapsedStatisticsGroups((current) =>
                            current.includes(group.state)
                              ? current.filter((stateName) => stateName !== group.state)
                              : [...current, group.state]
                          )}
                        />

                        {!isCollapsed && (
                          <LinearDataListStack>
                            {groupCampaigns.map((campaign) => (
                              <CampaignRow key={campaign.id} campaign={campaign} compact={density === 'compact'} />
                            ))}
                          </LinearDataListStack>
                        )}
                      </div>
                    );
                  })}
                </LinearDataListStack>
              </div>

              {!visibleCampaigns.length && (
                <div className="flex h-36 flex-col items-center justify-center text-center">
                  <Search size={16} className="text-[var(--text-muted)]" />
                  <div className="mt-2 text-[12px] font-medium text-[var(--text-secondary)]">No campaigns found</div>
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">Try another name or account</div>
                </div>
              )}
            </LinearDataListViewport>
          </section>
        </main>
      </div>
    </div>
  );
};
