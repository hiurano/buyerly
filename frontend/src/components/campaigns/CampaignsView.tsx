import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { BuyerlyRowContextMenu, type RowMenuEntry } from '@/ui/BuyerlyRowMenu';
import {
  deliveryHistoryEntry,
  describeEntities,
  reportBulkDelivery,
  setDeliveryForMany,
  setEntityDelivery,
  type DeliveryControl,
  type DeliveryStatus,
  type EntityLevel,
} from '@/lib/delivery';
import { pushHistory } from '@/lib/undoHistory';
import { toast } from '@/ui/toast';
import { ApiError, apiRequest } from '@/lib/api';
import type {
  AnalyticsAccountsHierarchyResponse,
  MetaAccount,
  MetaConnection,
} from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { ViewTitle } from '@/components/teams/ViewTitle';
import { favoritePath } from '@/lib/favorites';
import { pathForTab, useAddress } from '@/lib/routing';
import { useActiveTeam } from '@/lib/teams';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import type { AdsManagerEntity } from '@/store/useAppStore';
import { CampaignRow } from './CampaignRow';
import { AdSetRow } from './AdSetRow';
import { AdRow } from './AdRow';
import { DisplayOptionsPopover } from './DisplayOptionsPopover';
import { MetaConnectionDialog } from './MetaConnectionDialog';
import { DataState } from '@/ui/DataState';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlyTabs } from '@/ui/BuyerlyTabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import {
  BuyerlyDataListGroup,
  BuyerlyDataListToolbar,
  BuyerlyDataTable,
} from '@/ui/BuyerlyDataList';
import {
  ActiveFilterFormula,
  FilteredEmptyState,
  BuyerlyFilterButton,
  BuyerlyFilterMenu,
} from '@/components/filters/BuyerlyFilter';
import type { FilterMenuMode } from '@/components/filters/BuyerlyFilter';
import { adAccountName, createLiveFields, filterView, groupView } from './campaignViewModel';
import { useCampaignViewFilters } from './useCampaignViewFilters';
import {
  adsManagerActiveGrouping,
  adsManagerActiveRows,
  adsManagerGroupingField,
  adsManagerOrderings,
  naturalAdsManagerDirection,
  useAdsManagerView,
} from './adsManagerViewModel';
import { ADS_MANAGER_PERIODS, metricsFor, periodFromSearch, type AdsManagerMetrics, type AdsManagerPeriod } from './adsManagerMetrics';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { arrangeBoardColumns, arrangeGroups, sortByColumn, toggleHiddenGroup } from '@/ui/listView';
import { BuyerlyBoard, type BoardLane } from '@/ui/BuyerlyBoard';
import { useLayoutShortcut } from '@/ui/useLayoutShortcut';
import { AdsManagerCard, type CardChip } from './AdsManagerCard';
import { DisplayOptionsChangedDot } from '@/ui/BuyerlyDisplayOptions';
import { DetailsPaneLayout, DetailsPaneToggle } from '@/ui/DetailsPane';
import { DetailsFacets, type DetailsFacetTab } from '@/ui/DetailsFacets';
import type { FilterOption } from '@/components/filters/filterModel';
import { SelectionDock } from '@/ui/SelectionDock';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { SelectionCommandMenu } from '@/ui/SelectionCommandMenu';
import { BuyerlyBoltIcon, BuyerlyClipboardIcon, BuyerlyCopyIdIcon, BuyerlyCopyTitleIcon, BuyerlyCopyUrlIcon } from '@/icons/BuyerlyIcons';
import { RuleSelectorPopover } from './RuleSelectorPopover';
import { openCommandMenu } from '@/components/command/CommandMenu';
import { takeRecordActions } from '@/components/command/OpenPalette';
import { useRowSelection, type SelectionAction } from '@/ui/useRowSelection';
import { useRevealRow } from '@/ui/useRevealRow';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';
import {
  BuyerlyProjectIcon,
  BuyerlySlidersIcon,
  BuyerlyStatusCircleIcon,
} from '@/icons/BuyerlyIcons';
import { getAdsManagerColumns } from './tableColumns';
import {
  eligibleMetaAccounts,
  formatMetric,
  hierarchyAdSetToRow,
  hierarchyAdToRow,
  hierarchyCampaignToRow,
} from './liveCampaigns';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type CampaignRowItem = ReturnType<typeof hierarchyCampaignToRow>;
type AdSetRowItem = ReturnType<typeof hierarchyAdSetToRow>;
type AdRowItem = ReturnType<typeof hierarchyAdToRow>;

/** One ad account's three levels for the period, or why they could not be read. */
interface AccountHierarchy {
  account: MetaAccount;
  campaigns: CampaignRowItem[];
  adSets: AdSetRowItem[];
  ads: AdRowItem[];
  error?: string;
}

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

type HierarchyRows = Map<string, AnalyticsAccountsHierarchyResponse['accounts'][number]>;

/**
 * Every ad account you can see in one request, started with `/api/accounts`
 * rather than after it, so the page waits for the slower of the two (#489).
 */
async function fetchHierarchyRows(period: AdsManagerPeriod): Promise<HierarchyRows | { error: string }> {
  try {
    const response = await apiRequest<AnalyticsAccountsHierarchyResponse>(`/api/analytics/hierarchy/accounts?period=${period}`);
    return new Map(response.accounts.map((rows) => [rows.account_id, rows]));
  } catch (error) {
    return { error: requestErrorMessage(error) };
  }
}

/** The accounts on screen from those rows; one the server left out keeps its own error and never hides the others. */
function accountHierarchies(accounts: MetaAccount[], rowsOf: HierarchyRows): AccountHierarchy[] {
  return accounts.map((account) => {
    const rows = rowsOf.get(account.account_id);
    if (!rows) return { account, campaigns: [], adSets: [], ads: [], error: 'This ad account is not available to you.' };
    const accountName = adAccountName(account);
    const named = <T,>(row: T) => ({ ...row, accountId: account.account_id, accountName });
    const campaigns = rows.campaigns.map((item) => named(hierarchyCampaignToRow(item)));
    const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const adSets = rows.adsets.map((item) => named(hierarchyAdSetToRow(item, campaignNames)));
    const adSetsById = new Map(adSets.map((adSet) => [adSet.id, adSet]));
    return { account, campaigns, adSets, ads: rows.ads.map((item) => named(hierarchyAdToRow(item, adSetsById))) };
  });
}

/**
 * An old link's `?account=` on a level, from before every account was on
 * screen at once, becomes Linear's filter: Ad account is that account, on
 * every level. A link to one record keeps it; the record is found anyway.
 */
function accountLinkToFilter() {
  const url = new URL(window.location.href);
  const accountId = url.searchParams.get('account');
  // The view can mount for a moment on another page's address (Search's own `?account=`) before the route settles.
  if (!accountId || !/\/(ads-manager|my-campaigns)\//.test(url.pathname)) return;
  url.searchParams.delete('account');
  if (!url.searchParams.has('filter')) {
    const clause = [{ fieldId: 'account', operator: 'is', values: [accountId] }];
    url.searchParams.set('filter', JSON.stringify({ campaigns: clause, adsets: clause, ads: clause }));
  }
  window.history.replaceState(window.history.state, '', url);
}

const entityLevels: Record<AdsManagerEntity, EntityLevel> = {
  campaigns: 'campaign',
  adsets: 'adset',
  ads: 'ad',
};

const entityLabels: Record<AdsManagerEntity, { plural: string; singular: string }> = {
  campaigns: { plural: 'campaigns', singular: 'campaign' },
  adsets: { plural: 'ad sets', singular: 'ad set' },
  ads: { plural: 'ads', singular: 'ad' },
};

interface CampaignsViewProps {
  /** My campaigns: only the ad accounts you lead, as Linear's My issues (/my-campaigns/<level>). */
  mine?: boolean;
  /** The entity the address names (`/ads-manager/{level}/{id}`): a search result, a shared link. */
  reveal?: { entity: AdsManagerEntity; id: string };
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
}

/**
 * The details pane's quick filters: real delivery state, the parent campaign
 * of ad sets and ads (#389), then the rules on each row (#367).
 */
const detailsTabs = (entity: AdsManagerEntity) => (
  entity === 'campaigns' ? ['status', 'account', 'rule'] : ['status', 'account', 'campaign', 'rule']
);

/** How this platform's tooltips and dialogs write undo. */
const UNDO_SHORTCUT = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl+Z';

/** A phone keeps the name and Spend side by side; the other figures scroll (#389). */
const PHONE_TABLE_QUERY = '(max-width: 640px)';

function facetIcon(fieldId: string, option: FilterOption): React.ReactNode {
  if (fieldId === 'rule') {
    return <BuyerlyBoltIcon size={14} style={{ color: option.value === 'no-rule' ? 'var(--text-muted)' : option.color }} />;
  }
  if (fieldId === 'account') return <BuyerlyProjectIcon size={14} className="text-[var(--text-tertiary)]" />;
  if (fieldId === 'campaign') return <span className="details-facets-dot" style={{ backgroundColor: 'var(--text-tertiary)' }} />;
  if (option.value === 'active' || option.value === 'paused') return <BuyerlyStatusCircleIcon status={option.value} size={14} />;
  return <span className="details-facets-dot" style={{ backgroundColor: option.color }} />;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({ mine = false, reveal, navigationKey }) => {
  const {
    campaignFilterTab,
    setCampaignFilterTab,
    isDisplayOptionsOpen,
    toggleDisplayOptions,
    setIsDisplayOptionsOpen,
    clearCampaignSelection,
    selectedCampaignIds,
    setCampaignSelection,
    toggleCampaignSelection,
    loadRuleAttachments,
    attachmentsLoadState,
  } = useAppStore();

  // Before the filters read the address on this navigation: React renders
  // again at once with the address rewritten.
  const [accountLinkRead, setAccountLinkRead] = useState<number | null>(null);
  if (accountLinkRead !== navigationKey) {
    setAccountLinkRead(navigationKey);
    if (!reveal) accountLinkToFilter();
  }

  const requestGenerationRef = useRef(0);
  const { pathname } = useAddress();
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Each level's own view, saved per member on the server (#385).
  const { view, update: updateView, displayChanged } = useAdsManagerView(campaignFilterTab, mine);
  const toggleLayout = useCallback(
    () => updateView({ layout: view.layout === 'list' ? 'board' : 'list' }),
    [updateView, view.layout],
  );
  useLayoutShortcut(toggleLayout);
  const displayOrdering = view.ordering;
  const displayProperties = view.properties;
  const sortDirection = view.direction;
  const [allMetaAccounts, setAllMetaAccounts] = useState<MetaAccount[]>([]);
  // Every ad account at once, as Linear's team Issues lists every project's issues:
  // a team's only its own, My campaigns only those you lead.
  const { workspace, user } = useWorkspaceSession();
  const teamScope = useActiveTeam(workspace.id);
  const activeTeam = mine ? { key: null, team: null, missing: false, loading: false } : teamScope;
  const metaAccounts = useMemo(() => {
    if (mine) return allMetaAccounts.filter((account) => account.lead_user_id != null && account.lead_user_id === user.id);
    if (!activeTeam.key) return allMetaAccounts;
    const team = activeTeam.team;
    return team ? allMetaAccounts.filter((account) => account.id !== undefined && team.account_ids.includes(account.id)) : [];
  }, [mine, user.id, activeTeam.key, activeTeam.team, allMetaAccounts]);
  const accountIds = useMemo(() => metaAccounts.map((account) => account.account_id), [metaAccounts]);
  const accountIdsKey = accountIds.join(',');
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([]);
  const [accountsState, setAccountsState] = useState<LoadState>('loading');
  const [accountsError, setAccountsError] = useState('');
  // The reporting window, in the address (`?period=`) so a link and a reload keep it (#389).
  const [period, setPeriodState] = useState<AdsManagerPeriod>(() => periodFromSearch(window.location.search));
  useEffect(() => {
    setPeriodState(periodFromSearch(window.location.search));
  }, [navigationKey]);
  const setPeriod = (next: AdsManagerPeriod) => {
    if (next === period) return;
    requestGenerationRef.current += 1;
    setHierarchyState('loading');
    setPeriodState(next);
    const url = new URL(window.location.href);
    if (next === 'today') url.searchParams.delete('period');
    else url.searchParams.set('period', next);
    window.history.replaceState(window.history.state, '', url);
  };
  const periodLabel = ADS_MANAGER_PERIODS.find((option) => option.value === period)?.label ?? 'Today';
  const { filters: adsManagerFilters, updateFilters: setAdsManagerFilters, quick: savedQuick, setQuick } = useCampaignViewFilters(
    `${pathname}:${campaignFilterTab}`,
    navigationKey,
    mine,
  );
  // Only a quick filter the pane can show applies, so none is ever left on unseen.
  const quick = savedQuick && detailsTabs(campaignFilterTab).includes(savedQuick.fieldId) ? savedQuick : null;
  const [campaigns, setCampaigns] = useState<CampaignRowItem[]>([]);
  const [adSets, setAdSets] = useState<AdSetRowItem[]>([]);
  const [ads, setAds] = useState<AdRowItem[]>([]);
  const [hierarchyState, setHierarchyState] = useState<LoadState>('loading');
  const [hierarchyError, setHierarchyError] = useState('');
  // Accounts that could not be read while the others could: named above the list.
  const [failedAccounts, setFailedAccounts] = useState<{ account: MetaAccount; error: string }[]>([]);
  // Delivery this session wrote to Meta, shown on the row over the stored
  // snapshot, which only catches up on its next sync.
  const [deliveryActions, setDeliveryActions] = useState<Record<string, { busy: boolean; status?: 'active' | 'paused' }>>({});
  const [hierarchyReloadKey, setHierarchyReloadKey] = useState(0);
  // A card dropped on Active or Paused, waiting for the member to confirm the write to Meta.
  const [pendingMove, setPendingMove] = useState<{
    level: EntityLevel; entityId: string; accountId: string; name: string; next: boolean;
  } | null>(null);
  // The selection's "Apply rule…": one picker over every selected row.
  const [isBulkRulePickerOpen, setIsBulkRulePickerOpen] = useState(false);
  const [ruleMenuTargets, setRuleMenuTargets] = useState<string[] | null>(null);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [returnedConnectionId, setReturnedConnectionId] = useState<number | null>(
    Number(new URLSearchParams(window.location.search).get('meta_connection')) || null,
  );

  const refreshMetaAccounts = useCallback(async () => {
    const inScope = useAppStore.getState().captureScope();
    setAccountsState('loading');
    setAccountsError('');
    try {
      const [accounts, connections] = await Promise.all([
        apiRequest<MetaAccount[]>('/api/accounts'),
        apiRequest<MetaConnection[]>('/api/meta/connections').catch(() => []),
      ]);
      if (!inScope()) return;
      const eligibleAccounts = eligibleMetaAccounts(accounts);
      setAllMetaAccounts(eligibleAccounts);
      setMetaConnections(connections);
      setAccountsState('ready');
    } catch (error) {
      if (!inScope()) return;
      setAccountsError(requestErrorMessage(error));
      setAccountsState('error');
    }
  }, []);

  useEffect(() => {
    void refreshMetaAccounts();
  }, [refreshMetaAccounts]);

  // Rules attach per ad account, read from the accounts just loaded rather than a second `/api/accounts`.
  useEffect(() => {
    const ids = accountsState === 'ready' && accountIdsKey ? accountIdsKey.split(',') : [];
    void loadRuleAttachments(ids, allMetaAccounts);
  }, [loadRuleAttachments, accountsState, accountIdsKey]);

  // The rows of every account, read beside the accounts, again for a new period or a retry.
  const [hierarchyRows, setHierarchyRows] = useState<HierarchyRows | { error: string } | null>(null);
  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    setHierarchyRows(null);
    void fetchHierarchyRows(period).then((rows) => {
      if (generation === requestGenerationRef.current) setHierarchyRows(rows);
    });
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [hierarchyReloadKey, period]);

  useEffect(() => {
    clearCampaignSelection();
    setDeliveryActions({});
    setCampaigns([]);
    setAdSets([]);
    setAds([]);
    setFailedAccounts([]);
    setHierarchyError('');
    if (accountsState !== 'ready') return;
    const accounts = metaAccounts;
    if (accounts.length === 0) {
      setHierarchyState('idle');
      return;
    }
    if (!hierarchyRows) {
      setHierarchyState('loading');
      return;
    }
    if (!(hierarchyRows instanceof Map)) {
      setHierarchyError(hierarchyRows.error);
      setHierarchyState('error');
      return;
    }
    const results = accountHierarchies(accounts, hierarchyRows);
    const loaded = results.filter((result) => !result.error);
    if (loaded.length === 0) {
      setHierarchyError(results[0]?.error ?? '');
      setHierarchyState('error');
      return;
    }
    setCampaigns(loaded.flatMap((result) => result.campaigns));
    setAdSets(loaded.flatMap((result) => result.adSets));
    setAds(loaded.flatMap((result) => result.ads));
    setFailedAccounts(results.flatMap((result) => (result.error ? [{ account: result.account, error: result.error }] : [])));
    setHierarchyState('ready');
  }, [hierarchyRows, clearCampaignSelection, accountsState, accountIdsKey]);

  useEffect(() => {
    setOpenFilterMenu(null);
    setIsDisplayOptionsOpen(false);
    clearCampaignSelection();
  }, [campaignFilterTab, clearCampaignSelection, setIsDisplayOptionsOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;

      if ((event.key === 'f' || event.key === 'F') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setIsDisplayOptionsOpen(false);
        if (filterButtonRef.current) {
          setOpenFilterMenu((current) => current ? null : {
            mode: 'root',
            anchor: filterButtonRef.current as HTMLElement,
          });
        }
      } else if ((event.key === 'v' || event.key === 'V') && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpenFilterMenu(null);
        toggleDisplayOptions();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsDisplayOptionsOpen, toggleDisplayOptions]);

  const clearMetaCallback = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('meta_connection');
    window.history.replaceState(window.history.state, '', url);
    setReturnedConnectionId(null);
  };

  const openMetaDialog = () => setIsMetaDialogOpen(true);
  const openAccountSelection = () => {
    const activeConnections = metaConnections.filter((connection) => connection.status === 'active');
    if (activeConnections.length === 1) {
      setReturnedConnectionId(activeConnections[0].id);
      return;
    }
    openMetaDialog();
  };

  const campaignFilterFields = useMemo(() => createLiveFields(campaigns, metaAccounts, 'campaigns', adSets), [campaigns, metaAccounts, adSets]);
  const adSetFilterFields = useMemo(() => createLiveFields(adSets, metaAccounts, 'adsets', adSets, campaigns), [adSets, metaAccounts, campaigns]);
  const adFilterFields = useMemo(() => createLiveFields(ads, metaAccounts, 'ads', adSets, campaigns), [ads, metaAccounts, adSets, campaigns]);
  const currentFilters = adsManagerFilters[campaignFilterTab];
  const currentFilterFields = (
    campaignFilterTab === 'campaigns'
      ? campaignFilterFields
      : campaignFilterTab === 'adsets'
        ? adSetFilterFields
        : adFilterFields
  ) as unknown as typeof campaignFilterFields;
  const updateCurrentFilters = (clauses: FilterClause[]) => setAdsManagerFilters(campaignFilterTab, clauses);
  const showFilterMenu = (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) =>
    setOpenFilterMenu({ mode, anchor, fieldId });

  const directionFactor = sortDirection === 'asc' ? 1 : -1;
  // Name, or any figure the table shows (#389); a hidden one falls back to Meta's order.
  const effectiveOrdering = adsManagerOrderings(campaignFilterTab, displayProperties)
    .some((option) => option.value === displayOrdering) ? displayOrdering : 'manual';
  const sortRows = <T extends { name: string; metrics?: AdsManagerMetrics }>(rows: T[]) => {
    if (effectiveOrdering === 'manual') return rows;
    if (effectiveOrdering === 'name') return [...rows].sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
    const metricId = effectiveOrdering as keyof AdsManagerMetrics;
    // A row without the figure stays last whichever way the column runs.
    return [...rows].sort((a, b) => {
      const left = a.metrics?.[metricId] ?? null;
      const right = b.metrics?.[metricId] ?? null;
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return (left - right) * directionFactor;
    });
  };

  const campaignView = filterView(campaigns, campaignFilterFields, adsManagerFilters.campaigns, quick);
  const adSetView = filterView(adSets, adSetFilterFields, adsManagerFilters.adsets, quick);
  const adView = filterView(ads, adFilterFields, adsManagerFilters.ads, quick);
  const currentView = campaignFilterTab === 'campaigns' ? campaignView : campaignFilterTab === 'adsets' ? adSetView : adView;
  const filteredCampaigns = sortRows(campaignView.visibleRows);
  const filteredAdSets = sortRows(adSetView.visibleRows);
  const filteredAds = sortRows(adView.visibleRows);
  const clearFilters = () => { updateCurrentFilters([]); setQuick(null); };
  const isBoard = view.layout === 'board';
  // Linear's Board: the columns are the grouping, never "No grouping"; Rows bands them.
  const activeGrouping = adsManagerActiveGrouping(campaignFilterTab, view);
  const activeRows = adsManagerActiveRows(campaignFilterTab, view);
  const groupingField = adsManagerGroupingField(activeGrouping);
  const rowsField = adsManagerGroupingField(activeRows);
  const groupingView = { ...view, grouping: activeGrouping };
  const groupKey = (group: { id: string }) => `${groupingField}:${group.id}`;
  const subGroupKey = (group: { id: string }, sub: { id: string }) => `${groupKey(group)}/${rowsField}:${sub.id}`;
  const toggleCollapsed = (key: string) => setCollapsedGroups(state => ({ ...state, [key]: !state[key] }));
  // Linear's sub-groups inside a group; as with groups, Status is a fixed set, so only its empty ones can be shown.
  const renderSubGroups = <T,>(group: { id: string; rows: T[] }, fields: FilterFieldDefinition<T>[], render: (row: T) => React.ReactNode) =>
    groupView(group.rows, fields, rowsField)
      .filter(sub => sub.rows.length > 0 || (view.showEmptyGroups && rowsField === 'status'))
      .map(sub => sub.label ? (
        <BuyerlyDataListGroup key={sub.id} subGroup title={sub.label} count={sub.rows.length}
          dotColor="var(--text-tertiary)"
          icon={rowsField === 'account' ? <BuyerlyProjectIcon size={14} /> : optionIcon(fields.find(field => field.id === rowsField), sub.id)}
          isCollapsed={Boolean(collapsedGroups[subGroupKey(group, sub)])}
          onToggleCollapse={() => toggleCollapsed(subGroupKey(group, sub))}>
          {sub.rows.map(render)}
        </BuyerlyDataListGroup>
      ) : <React.Fragment key={sub.id}>{sub.rows.map(render)}</React.Fragment>);
  // Status is a fixed set, so only its empty groups can be shown.
  const renderGrouped = <T,>(rows: T[], fields: FilterFieldDefinition<T>[], render: (row: T) => React.ReactNode) =>
    arrangeGroups(groupView(rows, fields, groupingField), groupingView, { allowEmpty: groupingField === 'status' }).map(group => (
      <React.Fragment key={group.id}>
        {group.label ? (
          <BuyerlyDataListGroup title={group.label} count={group.rows.length}
            dotColor="var(--text-tertiary)"
            icon={groupingField === 'account' ? <BuyerlyProjectIcon size={14} /> : undefined}
            isCollapsed={Boolean(collapsedGroups[groupKey(group)])}
            onToggleCollapse={() => toggleCollapsed(groupKey(group))}>
            {renderSubGroups(group, fields, render)}
          </BuyerlyDataListGroup>
        ) : group.rows.map(render)}
      </React.Fragment>
    ));
  const totalCurrent = campaignFilterTab === 'campaigns' ? campaigns.length : campaignFilterTab === 'adsets' ? adSets.length : ads.length;
  const filteredCurrentCount = campaignFilterTab === 'campaigns' ? filteredCampaigns.length : campaignFilterTab === 'adsets' ? filteredAdSets.length : filteredAds.length;

  const isPhoneTable = useMediaQuery(PHONE_TABLE_QUERY);
  const supportedProperties = displayProperties;
  const tableColumns = getAdsManagerColumns(campaignFilterTab, displayProperties, {
    spendFirst: isPhoneTable,
    groupedByAccount: groupingField === 'account' || rowsField === 'account',
  });

  /** Shows delivery this session wrote on the given rows. */
  const showDelivery = useCallback((entityIds: string[], status: DeliveryStatus) => {
    const local = status === 'ACTIVE' ? 'active' : 'paused';
    setDeliveryActions((current) => ({
      ...current,
      ...Object.fromEntries(entityIds.map((id) => [id, { busy: false, status: local }])),
    }));
  }, []);

  const rowName = (entityId: string) => (
    [...campaigns, ...adSets, ...ads].find((row) => row.id === entityId)?.name ?? entityLabels[campaignFilterTab].singular
  );

  // A write that finishes after the user left the workspace stays out of its
  // history and toasts; one that finishes after the list reloaded (another
  // period, another team) still records its undo, but no longer paints rows.
  const captureListScope = () => {
    const inScope = useAppStore.getState().captureScope();
    const generation = requestGenerationRef.current;
    return () => inScope() && generation === requestGenerationRef.current;
  };

  /** One row's toggle: the row shows the result, Ctrl+Z takes it back, only a failure speaks. */
  const runDelivery = async (level: EntityLevel, entityId: string, accountId: string, next: boolean) => {
    if (hierarchyState !== 'ready') return;
    const inWorkspace = useAppStore.getState().captureScope();
    const onAccount = captureListScope();
    const status: DeliveryStatus = next ? 'ACTIVE' : 'PAUSED';
    const name = rowName(entityId);
    setDeliveryActions((current) => ({ ...current, [entityId]: { ...current[entityId], busy: true } }));
    let result: Awaited<ReturnType<typeof setEntityDelivery>>;
    try {
      result = await setEntityDelivery(level, entityId, accountId, status);
    } catch (error) {
      if (!inWorkspace()) return;
      if (onAccount()) {
        setDeliveryActions((current) => ({ ...current, [entityId]: { ...current[entityId], busy: false } }));
      }
      toast.show({
        tone: 'error',
        title: `Couldn't ${next ? 'resume' : 'pause'}`,
        message: name,
        description: error instanceof Error ? error.message : 'The change could not be confirmed. Check Meta before retrying.',
      });
      return;
    }
    if (!inWorkspace()) return;
    if (onAccount()) showDelivery([entityId], result.status);
    if (result.changed && result.audit_event_id) {
      pushHistory(deliveryHistoryEntry({
        label: `${next ? 'resume' : 'pause'} ${name}`,
        targets: [{ level, entityId, accountId }],
        status,
        auditEventIds: [result.audit_event_id],
        onStatus: (ids, status) => { if (onAccount()) showDelivery(ids, status); },
      }));
    }
  };

  const currentRows = campaignFilterTab === 'campaigns' ? campaigns : campaignFilterTab === 'adsets' ? adSets : ads;

  /** Pauses or resumes every selected row of the current level (or the rows a right-click names), reporting each outcome. */
  const runBulkDelivery = async (next: 'active' | 'paused', ids: string[] = selectedCampaignIds) => {
    if (hierarchyState !== 'ready') return;
    const inWorkspace = useAppStore.getState().captureScope();
    const onAccount = captureListScope();
    const level = entityLevels[campaignFilterTab];
    const rows = currentRows.filter((row) => ids.includes(row.id));
    const eligible = rows.filter((row) => row.status !== 'unknown' && row.accountId);
    const status: DeliveryStatus = next === 'active' ? 'ACTIVE' : 'PAUSED';
    // Each row's own ad account: a selection may span several.
    const accountOf = new Map(eligible.map((row) => [row.id, row.accountId ?? '']));
    const noun = entityLabels[campaignFilterTab];
    setDeliveryActions((current) => ({
      ...current,
      ...Object.fromEntries(eligible.map((row) => [row.id, { ...current[row.id], busy: true }])),
    }));
    const outcome = await setDeliveryForMany(
      eligible.map((row) => ({ level, entityId: row.id, accountId: row.accountId ?? '' })),
      status,
      inWorkspace,
    );
    if (!inWorkspace()) return;
    const confirmed = new Set([...outcome.changed.map((item) => item.entityId), ...outcome.unchanged]);
    if (onAccount()) {
      setDeliveryActions((current) => ({
        ...current,
        ...Object.fromEntries(eligible.map((row) => [
          row.id,
          confirmed.has(row.id) ? { busy: false, status: next } : { ...current[row.id], busy: false },
        ])),
      }));
    }
    const changed = outcome.changed;
    if (changed.length > 0) {
      pushHistory(deliveryHistoryEntry({
        label: `${next === 'active' ? 'resume' : 'pause'} ${describeEntities(changed.map((item) => rowName(item.entityId)), noun)}`,
        targets: changed.map((item) => ({ level, entityId: item.entityId, accountId: accountOf.get(item.entityId) ?? '' })),
        status,
        auditEventIds: changed.flatMap((item) => (item.auditEventId ? [item.auditEventId] : [])),
        onStatus: (ids, status) => { if (onAccount()) showDelivery(ids, status); },
      }));
    }
    reportBulkDelivery(outcome, status, noun, rows.length - eligible.length);
  };

  const selectionNoun = entityLabels[campaignFilterTab];
  const selectedRows = currentRows.filter((row) => selectedCampaignIds.includes(row.id));
  const selectedRowIds = selectedRows.map((row) => row.id);
  // Rules attach per ad account, so "Apply rule…" works on rows of one account at a time.
  const selectedAccountIds = [...new Set(selectedRows.map((row) => row.accountId ?? ''))];
  const ruleAccountId = selectedAccountIds.length === 1 ? selectedAccountIds[0] : '';
  const selectionActions: SelectionAction[] = [
    { id: 'pause', label: 'Pause delivery', shortcut: 'p', icon: <Pause size={14} />, run: () => void runBulkDelivery('paused') },
    { id: 'resume', label: 'Resume delivery', shortcut: 'r', icon: <Play size={14} />, run: () => void runBulkDelivery('active') },
    // Meta's "Apply rule to" the selected campaigns or ad sets; ads take no rules.
    ...(campaignFilterTab !== 'ads' && attachmentsLoadState === 'ready' && ruleAccountId
      ? [{ id: 'rule', label: 'Apply rule…', shortcut: 'a', icon: <BuyerlyBoltIcon size={14} />, run: () => setIsBulkRulePickerOpen(true) }]
      : []),
  ];
  const visibleRowIds = (
    campaignFilterTab === 'campaigns' ? filteredCampaigns : campaignFilterTab === 'adsets' ? filteredAdSets : filteredAds
  ).map((row) => row.id);
  const selection = useRowSelection({
    selectedIds: selectedCampaignIds,
    visibleIds: visibleRowIds,
    setSelection: setCampaignSelection,
    actions: selectionActions,
    enabled: accountsState === 'ready' && hierarchyState === 'ready',
  });
  // "Apply rule…" from a row's right-click menu works on the rows it names, the selection otherwise.
  const ruleTargetIds = ruleMenuTargets ?? selectedRowIds;
  const ruleTargetAccounts = [...new Set(currentRows.filter((row) => ruleTargetIds.includes(row.id)).map((row) => row.accountId ?? ''))];
  const pickerAccountId = ruleTargetAccounts.length === 1 ? ruleTargetAccounts[0] : '';
  // A picker left over a selection that is gone, or now spans accounts, must not reopen on the next one.
  useEffect(() => {
    if (!pickerAccountId) setIsBulkRulePickerOpen(false);
  }, [pickerAccountId]);

  /**
   * Linear's right-click menu on a row or card: it acts on the selection when
   * the row is in it, else on that row alone. Buyerly's actions on delivery
   * and rules, then Copy.
   */
  const rowMenu = (row: { id: string; name: string; status: 'active' | 'paused' | 'unknown'; accountId?: string; identifier?: string }): RowMenuEntry[] => {
    const ids = selectedCampaignIds.includes(row.id) ? selectedCampaignIds : [row.id];
    const targets = currentRows.filter((candidate) => ids.includes(candidate.id));
    const statusOf = (target: typeof targets[number]) => deliveryActions[target.id]?.status ?? target.status;
    const controllable = hierarchyState === 'ready' && targets.some((target) => target.status !== 'unknown' && target.accountId);
    const accounts = new Set(targets.map((target) => target.accountId ?? ''));
    const noun = entityLabels[campaignFilterTab].singular;
    const copy = async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.show({ tone: 'success', title: `${what} copied to clipboard` });
      } catch {
        toast.error(`Couldn't copy the ${what.toLowerCase()}`, text);
      }
    };
    const entityPath = window.location.pathname.replace(/\/(campaigns|adsets|ads)(\/[^/]+)?\/?$/, '');
    const link = `${window.location.origin}${entityPath}/${campaignFilterTab}/${encodeURIComponent(row.id)}`;
    return [
      ...(controllable && targets.some((target) => statusOf(target) === 'active')
        ? [{ label: 'Pause delivery', icon: <Pause size={16} strokeWidth={1.75} />, shortcut: ['P'], onSelect: () => void runBulkDelivery('paused', ids) }]
        : []),
      ...(controllable && targets.some((target) => statusOf(target) === 'paused')
        ? [{ label: 'Resume delivery', icon: <Play size={16} strokeWidth={1.75} />, shortcut: ['R'], onSelect: () => void runBulkDelivery('active', ids) }]
        : []),
      ...(campaignFilterTab !== 'ads' && attachmentsLoadState === 'ready' && accounts.size === 1 && !accounts.has('')
        ? [{
          label: 'Apply rule…',
          icon: <BuyerlyBoltIcon size={16} />,
          shortcut: ['A'],
          onSelect: () => {
            setRuleMenuTargets(ids);
            setIsBulkRulePickerOpen(true);
          },
        }]
        : []),
      'separator',
      {
        label: 'Copy',
        icon: <BuyerlyClipboardIcon size={16} />,
        items: [
          { label: 'Copy ID', icon: <BuyerlyCopyIdIcon size={16} />, onSelect: () => void copy(row.identifier || row.id, `${noun[0].toUpperCase()}${noun.slice(1)} ID`) },
          { label: 'Copy URL', icon: <BuyerlyCopyUrlIcon size={16} />, onSelect: () => void copy(link, 'URL') },
          { label: 'Copy name', icon: <BuyerlyCopyTitleIcon size={16} />, onSelect: () => void copy(row.name, 'Name') },
        ],
      },
    ];
  };

  // The entity an address names opens on its row once its level is on screen.
  const revealedNoun = reveal ? entityLabels[reveal.entity].singular : '';
  useRevealRow({
    id: reveal?.id,
    navigationKey,
    ready: reveal?.entity === campaignFilterTab && accountsState === 'ready' && hierarchyState === 'ready',
    exists: currentRows.some((row) => row.id === reveal?.id),
    show: () => {
      if (!reveal) return false;
      const filteredOut = !visibleRowIds.includes(reveal.id);
      if (filteredOut) clearFilters();
      const fields = (campaignFilterTab === 'campaigns'
        ? campaignFilterFields
        : campaignFilterTab === 'adsets' ? adSetFilterFields : adFilterFields) as FilterFieldDefinition<{ id: string }>[];
      const holds = (group: { label: string; rows: { id: string }[] }) => Boolean(group.label) && group.rows.some((row) => row.id === reveal.id);
      // The row's group and its sub-group, wherever either is collapsed.
      const collapsed = groupView(currentRows as { id: string }[], fields, groupingField)
        .filter(holds)
        .flatMap((group) => [
          groupKey(group),
          ...groupView(group.rows, fields, rowsField).filter(holds).map((sub) => subGroupKey(group, sub)),
        ])
        .filter((key) => collapsedGroups[key]);
      if (collapsed.length > 0) {
        setCollapsedGroups((state) => ({ ...state, ...Object.fromEntries(collapsed.map((key) => [key, false])) }));
      }
      return filteredOut || collapsed.length > 0;
    },
    onDone: (shown) => {
      // Alt+Enter in an "Open …" palette: the row's own actions, as Linear's "More actions".
      if (!reveal || !takeRecordActions(`${entityLevels[reveal.entity]}:${reveal.id}`) || !shown) return;
      setCampaignSelection([reveal.id]);
      selection.setMenuOpen(true);
    },
    missing: () => ({
      title: "Couldn't open",
      message: `${revealedNoun} ${reveal?.id ?? ''}.`,
      description: `There is no such ${revealedNoun} in ${mine ? 'the ad accounts you lead' : 'these ad accounts'} ${period === 'today' ? 'today' : `for ${periodLabel.toLowerCase()}`}.`,
    }),
  });

  /** A live control, or nothing when the row cannot honestly be acted on. */
  const deliveryControl = (
    level: EntityLevel,
    row: { id: string; accountId?: string; status: 'active' | 'paused' | 'unknown' },
  ): DeliveryControl | undefined => {
    const accountId = row.accountId;
    if (!accountId || row.status === 'unknown') return undefined;
    const local = deliveryActions[row.id];
    return {
      status: local?.status ?? row.status,
      busy: Boolean(local?.busy),
      onChange: (next) => void runDelivery(level, row.id, accountId, next),
    };
  };

  const renderRows = () => {
    if ((currentFilters.length > 0 || quick) && filteredCurrentCount === 0) {
      return (
        <FilteredEmptyState
          noun={entityLabels[campaignFilterTab].plural}
          hiddenCount={totalCurrent}
          onClear={clearFilters}
        />
      );
    }
    if (campaignFilterTab === 'adsets') {
      return renderGrouped(filteredAdSets, adSetFilterFields, (adSet) => (
        <BuyerlyRowContextMenu key={adSet.id} entries={rowMenu(adSet)}>
          <AdSetRow adSet={adSet} properties={supportedProperties} columns={tableColumns} readOnly selectable delivery={deliveryControl('adset', adSet)} />
        </BuyerlyRowContextMenu>
      ));
    }
    if (campaignFilterTab === 'ads') {
      return renderGrouped(filteredAds, adFilterFields, (ad) => (
        <BuyerlyRowContextMenu key={ad.id} entries={rowMenu(ad)}>
          <AdRow ad={ad} properties={supportedProperties} columns={tableColumns} readOnly selectable delivery={deliveryControl('ad', ad)} />
        </BuyerlyRowContextMenu>
      ));
    }
    return renderGrouped(filteredCampaigns, campaignFilterFields, (campaign) => (
      <BuyerlyRowContextMenu key={campaign.id} entries={rowMenu(campaign)}>
        <CampaignRow
          campaign={campaign}
          properties={supportedProperties}
          columns={tableColumns}
          readOnly
          selectable
          delivery={deliveryControl('campaign', campaign)}
        />
      </BuyerlyRowContextMenu>
    ));
  };

  /** Chips a card shows, in table order; Status is the card's switch, and the board's columns and rows are left out. */
  const boardChipFields = [
    { field: 'account', property: 'account' },
    { field: 'campaign', property: 'campaign' },
    { field: 'adSet', property: 'adSet' },
    { field: 'rule', property: 'rules' },
  ].filter(({ property }) => displayProperties[property] && property !== activeGrouping && property !== activeRows);
  const boardFigures = metricsFor(campaignFilterTab).filter((metric) => displayProperties[metric.id]);

  const optionIcon = <T,>(field: FilterFieldDefinition<T> | undefined, id: string) => {
    const option = field?.options?.find((candidate) => candidate.value === id);
    return field && option ? facetIcon(field.id, option) : undefined;
  };

  /** The level as Linear's Board: one column per group, Rows as bands, the rest in Hidden columns. */
  const renderBoard = <T extends CampaignRowItem | AdSetRowItem | AdRowItem>(loaded: T[], fields: FilterFieldDefinition<T>[]) => {
    // Delivery this session wrote moves the card at once, as the switch shows it; Meta's snapshot catches up on its next sync.
    const rows = loaded.map((row) => {
      const local = deliveryActions[row.id]?.status;
      return local && local !== row.status
        ? { ...row, status: local, effectiveStatus: local === 'active' ? 'ACTIVE' : 'PAUSED' }
        : row;
    });
    const columnField = fields.find((field) => field.id === groupingField);
    const { shown, hidden } = arrangeBoardColumns(groupView(rows, fields, groupingField), groupingView);
    const laneField = fields.find((field) => field.id === rowsField);
    const lanes: BoardLane<T>[] | undefined = laneField
      ? groupView(rows, fields, rowsField)
        .filter((lane) => lane.rows.length > 0 || view.showEmptySubGroups)
        .map((lane) => ({
          id: lane.id,
          label: lane.label,
          icon: optionIcon(laneField, lane.id),
          cells: Object.fromEntries(shown.map((column) => [column.id, column.rows.filter((row) => lane.rows.includes(row))])),
        }))
      : undefined;
    const chips = (row: T): CardChip[] => boardChipFields.flatMap(({ field: fieldId }) => {
      const field = fields.find((candidate) => candidate.id === fieldId);
      const raw = field?.getValue(row);
      const values = (Array.isArray(raw) ? raw : [raw]).map(String).filter((value) => value && value !== 'no-rule' && value !== 'null' && value !== 'undefined');
      return values.map((value) => ({
        key: `${fieldId}:${value}`,
        label: field?.options?.find((option) => option.value === value)?.label ?? value,
        icon: optionIcon(field, value),
      }));
    });
    const level = entityLevels[campaignFilterTab];
    const card = (row: T) => (
      <BuyerlyRowContextMenu entries={rowMenu(row)}>
      <AdsManagerCard
        id={row.id}
        name={row.name}
        identifier={displayProperties.id ? row.identifier : undefined}
        noun={entityLabels[campaignFilterTab].singular}
        status={row.status}
        statusLabel={row.statusLabel}
        delivery={displayProperties.status !== false && activeGrouping !== 'status' && activeRows !== 'status'
          ? deliveryControl(level, row) ?? 'read-only'
          : undefined}
        chips={chips(row)}
        figures={boardFigures.map((metric) => ({
          key: metric.id,
          label: metric.label,
          value: formatMetric(metric, row.metrics?.[metric.id] ?? null, row.currency ?? ''),
        }))}
        selected={selectedCampaignIds.includes(row.id)}
        busy={Boolean(deliveryActions[row.id]?.busy)}
        onToggleSelected={() => toggleCampaignSelection(row.id)}
      />
      </BuyerlyRowContextMenu>
    );
    // By Status a card dropped on Active or Paused turns it on or off in Meta, once confirmed;
    // the other states are Meta's own and take no drops.
    const onStatusDrop = (row: T, toColumn: string) => {
      const next = toColumn === 'active';
      const control = deliveryControl(level, row);
      if (!control || !row.accountId) return;
      if ((control.status === 'active') === next) {
        const noun = entityLabels[campaignFilterTab].singular;
        toast.show({
          tone: 'info',
          title: next ? 'Already on' : 'Already off',
          message: row.name,
          description: next
            ? `This ${noun} is switched on; Meta shows it as ${row.statusLabel}.`
            : `This ${noun} is switched off; Meta shows it as ${row.statusLabel}.`,
        });
        return;
      }
      setPendingMove({ level, entityId: row.id, accountId: row.accountId, name: row.name, next });
    };
    return (
      <BuyerlyBoard
        columns={shown.map((group) => ({ id: group.id, label: group.label, icon: optionIcon(columnField, group.id), rows: group.rows }))}
        hiddenColumns={hidden.map(({ group, hiddenByMember }) => ({
          id: group.id,
          label: group.label,
          icon: optionIcon(columnField, group.id),
          count: group.rows.length,
          hiddenByMember,
        }))}
        lanes={lanes}
        rowKey={(row) => row.id}
        onHideColumn={(id) => updateView(toggleHiddenGroup(groupingView, id))}
        onShowColumn={(id) => updateView(toggleHiddenGroup(groupingView, id))}
        renderCard={card}
        move={activeGrouping === 'status' && hierarchyState === 'ready' ? {
          canMove: (columnId) => columnId === 'active' || columnId === 'paused',
          canDrag: (row) => Boolean(deliveryControl(level, row)) && !deliveryActions[row.id]?.busy,
          onMove: (row, _from, to) => onStatusDrop(row, to),
          renderOverlay: card,
        } : undefined}
      />
    );
  };

  const renderData = () => {
    if (accountsState === 'loading') {
      return <DataState title="Loading ad accounts…" detail="Reading imported accounts from this workspace." />;
    }
    if (accountsState === 'error') {
      return (
        <DataState
          title="Couldn't load ad accounts"
          detail={accountsError}
          role="alert"
          actionLabel="Retry"
          onAction={() => void refreshMetaAccounts()}
        />
      );
    }
    if (activeTeam.missing) {
      return <DataState title="Team not found" detail="This workspace has no team with that identifier." />;
    }
    if (activeTeam.loading) {
      return <DataState title="Loading campaigns…" detail="Reading the team's ad accounts." />;
    }
    // With none in the workspace yet, the team shows the workspace's own empty state and Add account.
    if (metaAccounts.length === 0 && activeTeam.team && allMetaAccounts.length > 0) {
      return (
        <DataState
          title="No ad accounts in this team"
          detail={`Add ad accounts to ${activeTeam.team.name} in its settings to see their campaigns here.`}
        />
      );
    }
    if (mine && metaAccounts.length === 0) {
      return (
        <DataState
          title="No ad accounts you lead"
          detail="Campaigns of the ad accounts you lead show here. Set yourself as Lead on an ad account's page or in the Ad accounts list."
        />
      );
    }
    if (metaAccounts.length === 0) {
      return (
        <DataState
          title="No ad accounts yet"
          detail="Add at least one ad account to see its campaigns, ad sets and ads. Automation stays off after import."
          actionLabel="Add account"
          onAction={openAccountSelection}
        />
      );
    }
    if (hierarchyState === 'loading') {
      return <DataState title="Loading campaigns…" detail="Reading saved Meta campaigns, ad sets, ads, and current metrics." />;
    }
    if (hierarchyState === 'error') {
      return (
        <DataState
          title="Couldn't load campaigns"
          detail={hierarchyError}
          role="alert"
          actionLabel="Retry"
          onAction={() => setHierarchyReloadKey((value) => value + 1)}
        />
      );
    }
    if (totalCurrent === 0) {
      return (
        <DataState
          title={`No ${entityLabels[campaignFilterTab].plural} in ${metaAccounts.length === 1 ? 'this ad account' : 'these ad accounts'}`}
          detail={`Meta returned no ${entityLabels[campaignFilterTab].singular} inventory for ${metaAccounts.length === 1 ? 'this imported account' : 'the imported accounts'}. Zero-activity entities are included when they exist.`}
          actionLabel="Retry"
          onAction={() => setHierarchyReloadKey((value) => value + 1)}
        />
      );
    }

    if (isBoard) {
      return (
        <div className="flex min-w-0 flex-1 flex-col">
          {failedAccounts.length > 0 && (
            <div className="campaign-filter-summary" role="alert">
              <span>
                {"Couldn't load "}
                {failedAccounts.length === 1
                  ? `${adAccountName(failedAccounts[0].account)}: ${failedAccounts[0].error}`
                  : `${failedAccounts.length} ad accounts: ${failedAccounts.map(({ account }) => adAccountName(account)).join(', ')}`}
              </span>
              <Button size="compact" onClick={() => setHierarchyReloadKey((value) => value + 1)}>Retry</Button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {(currentFilters.length > 0 || quick) && filteredCurrentCount === 0
              ? renderRows()
              : campaignFilterTab === 'campaigns'
                ? renderBoard(filteredCampaigns, campaignFilterFields)
                : campaignFilterTab === 'adsets'
                  ? renderBoard(filteredAdSets, adSetFilterFields)
                  : renderBoard(filteredAds, adFilterFields)}
          </div>
        </div>
      );
    }

    return (
      <BuyerlyDataTable
        className="campaign-list-container"
        columns={tableColumns}
        sortKey={effectiveOrdering === 'manual' ? undefined : effectiveOrdering}
        sortDirection={sortDirection}
        onSort={(columnId) => updateView(sortByColumn({ ...view, ordering: effectiveOrdering }, columnId, naturalAdsManagerDirection(columnId)))}
        before={failedAccounts.length > 0 && (
          <div className="campaign-filter-summary" role="alert">
            <span>
              {"Couldn't load "}
              {failedAccounts.length === 1
                ? `${adAccountName(failedAccounts[0].account)}: ${failedAccounts[0].error}`
                : `${failedAccounts.length} ad accounts: ${failedAccounts.map(({ account }) => adAccountName(account)).join(', ')}`}
            </span>
            <Button size="compact" onClick={() => setHierarchyReloadKey((value) => value + 1)}>Retry</Button>
          </div>
        )}
        after={filteredCurrentCount > 0 && filteredCurrentCount < totalCurrent && (
          <div className="campaign-filter-summary">
            <span>{totalCurrent - filteredCurrentCount} {entityLabels[campaignFilterTab].plural} hidden by filters</span>
            <Button size="compact" onClick={clearFilters}>Clear filters</Button>
          </div>
        )}
      >
        {renderRows()}
      </BuyerlyDataTable>
    );
  };

  const detailsFacetTabs: DetailsFacetTab[] = detailsTabs(campaignFilterTab).flatMap((fieldId) => {
    const facet = currentView.facets.find((candidate) => candidate.id === fieldId);
    return facet ? [{
      id: facet.id,
      label: facet.label,
      options: facet.options.map((option) => ({
        value: option.value, label: option.label, count: option.count ?? 0, icon: facetIcon(facet.id, option),
      })),
    }] : [];
  });
  const details = hierarchyState === 'ready' && accountsState === 'ready' ? (
    <DetailsFacets
      tabs={detailsFacetTabs}
      selection={quick}
      onSelect={setQuick}
      storageKey="buyerly:details-tab:ads-manager"
      noun={entityLabels[campaignFilterTab].plural}
    />
  ) : null;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">
        <div
          style={{ borderBottom: 'var(--canvas-border)', paddingLeft: '18px', paddingRight: '11px' }}
          className="flex h-[44px] items-center justify-between"
        >
          {/* Every ad account is on screen; one is connected on Ad accounts, as a Linear project is made under Projects. */}
          <div className="flex items-center">
            <SidebarCollapsedNavigation />
            <ViewTitle
              title={mine ? 'My campaigns' : 'Campaigns'}
              team={activeTeam.team}
              favorite={{
                kind: 'page',
                path: favoritePath(pathForTab(workspace.slug, 'campaigns', 'campaigns', 'preferences', '', undefined, activeTeam.key, mine), workspace.slug),
                title: mine ? 'My campaigns' : activeTeam.team ? `${activeTeam.team.name} › Campaigns` : 'Campaigns',
              }}
            />
          </div>
        </div>

        <BuyerlyDataListToolbar className="campaign-view-toolbar">
          {/* When the tabs no longer fit they fold into one menu, as in Linear; the actions stay on the right. */}
          <BuyerlyTabs
            collapseOverflow
            tabs={[
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'adsets', label: 'Ad sets' },
              { id: 'ads', label: 'Ads' },
            ]}
            activeTabId={campaignFilterTab}
            onChange={(id) => setCampaignFilterTab(id as AdsManagerEntity)}
            aria-label="Level"
          />

          <div className="flex shrink-0 items-center gap-1.5">
            <PeriodMenu period={period} label={periodLabel} onChange={setPeriod} />
            <Tooltip content="Add Filter" shortcut="F" disabled={Boolean(openFilterMenu)}>
              <BuyerlyFilterButton
                ref={filterButtonRef}
                active={currentFilters.length > 0}
                open={Boolean(openFilterMenu)}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  const anchor = event.currentTarget;
                  setIsDisplayOptionsOpen(false);
                  setOpenFilterMenu((current) => current ? null : { mode: 'root', anchor });
                }}
              />
            </Tooltip>
            <Tooltip content="Show display options" shortcut="Shift V" align="end" disabled={isDisplayOptionsOpen}>
              <button
                ref={displayOptionsButtonRef}
                type="button"
                aria-label="Display options"
                data-active={isDisplayOptionsOpen ? 'true' : undefined}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setOpenFilterMenu(null);
                  toggleDisplayOptions();
                }}
                className="buyerly-header-button buyerly-header-button--toolbar buyerly-header-target group"
              >
                <BuyerlySlidersIcon size={14} />
                <DisplayOptionsChangedDot show={displayChanged} />
              </button>
            </Tooltip>
            <DisplayOptionsPopover
              isOpen={isDisplayOptionsOpen}
              onClose={() => setIsDisplayOptionsOpen(false)}
              anchorRef={displayOptionsButtonRef}
              entity={campaignFilterTab}
              mine={mine}
              groups={groupView(currentRows as never[], currentFilterFields as never[], groupingField)
                .filter((group) => group.label)
                .map((group) => ({ id: group.id, label: group.label }))}
            />

            <DetailsPaneToggle pane="adsManager" />
          </div>
        </BuyerlyDataListToolbar>

        <ActiveFilterFormula
          fields={currentFilterFields}
          clauses={currentFilters}
          onChange={updateCurrentFilters}
          onOpenMenu={showFilterMenu}
        />
      </header>

      <BuyerlyFilterMenu
        isOpen={Boolean(openFilterMenu)}
        mode={openFilterMenu?.mode ?? 'root'}
        anchorElement={openFilterMenu?.anchor ?? null}
        fieldId={openFilterMenu?.fieldId}
        fields={currentFilterFields}
        clauses={currentFilters}
        onChange={updateCurrentFilters}
        onClose={() => setOpenFilterMenu(null)}
        items={currentRows as never[]}
        countNoun={[entityLabels[campaignFilterTab].singular, entityLabels[campaignFilterTab].plural]}
      />

      <DetailsPaneLayout pane="adsManager" label="Campaigns details" details={details}>
        <div className="campaign-view-list relative">
          {renderData()}
          <SelectionDock count={selection.count} onOpenActions={() => selection.setMenuOpen(true)} onClear={selection.clear} />
        </div>
      </DetailsPaneLayout>

      <ConfirmDialog
        open={Boolean(pendingMove)}
        title={pendingMove ? `${pendingMove.next ? 'Turn on' : 'Pause'} ${entityLabels[campaignFilterTab].singular}?` : ''}
        description={pendingMove
          ? `“${pendingMove.name}” ${pendingMove.next ? 'starts' : 'stops'} delivering in Meta. ${UNDO_SHORTCUT} ${pendingMove.next ? 'pauses it again' : 'turns it back on'}.`
          : ''}
        confirmLabel={pendingMove?.next ? 'Turn on' : 'Pause'}
        onConfirm={() => {
          const move = pendingMove;
          setPendingMove(null);
          if (move) void runDelivery(move.level, move.entityId, move.accountId, move.next);
        }}
        onCancel={() => setPendingMove(null)}
      />

      <SelectionCommandMenu
        open={selection.menuOpen}
        onOpenChange={selection.setMenuOpen}
        scope={selection.count === 1
          ? { label: rowName(selectedCampaignIds[0]) }
          : { label: `${selection.count} ${selectionNoun.plural}` }}
        actions={selectionActions}
        onClearScope={openCommandMenu}
      />

      {campaignFilterTab !== 'ads' && pickerAccountId && (
        <RuleSelectorPopover
          isOpen={isBulkRulePickerOpen}
          onClose={() => {
            setIsBulkRulePickerOpen(false);
            setRuleMenuTargets(null);
          }}
          anchorRect={null}
          accountId={pickerAccountId}
          level={campaignFilterTab === 'campaigns' ? 'campaign' : 'adset'}
          entityIds={ruleTargetIds}
          shortcut="A"
        />
      )}

      <MetaConnectionDialog
        open={isMetaDialogOpen || returnedConnectionId !== null}
        connectionId={returnedConnectionId}
        returnPath={pathname}
        onOpenChange={(open) => {
          if (!open) {
            setIsMetaDialogOpen(false);
            clearMetaCallback();
          }
        }}
        onImported={() => {
          void refreshMetaAccounts().then(() => setHierarchyReloadKey((value) => value + 1));
        }}
      />
    </div>
  );
};

interface PeriodMenuProps {
  period: AdsManagerPeriod;
  label: string;
  onChange: (period: AdsManagerPeriod) => void;
}

/**
 * The window every figure, metric filter and ordering is read for (#389):
 * the periods the hierarchy API serves, as Meta's date picker names them.
 */
const PeriodMenu: React.FC<PeriodMenuProps> = ({ period, label, onChange }) => (
  <DropdownMenu>
    <Tooltip content="Period">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Period: ${label}`}
          className="inline-flex h-[28px] shrink-0 [@media(hover:none)_and_(pointer:coarse)]:h-8 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--color-border-secondary)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
        >
          {label}
          <span aria-hidden="true">▾</span>
        </button>
      </DropdownMenuTrigger>
    </Tooltip>
    <DropdownMenuContent align="end" style={{ minWidth: 160 }}>
      <DropdownMenuLabel>Period</DropdownMenuLabel>
      {ADS_MANAGER_PERIODS.map((option) => (
        <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)}>
          <span className="flex-1">{option.label}</span>
          {option.value === period && <span aria-hidden="true">✓</span>}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
