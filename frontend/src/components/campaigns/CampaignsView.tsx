import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
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
import { openAppPath, pathForTab } from '@/lib/routing';
import { toast } from '@/ui/toast';
import { ApiError, apiRequest } from '@/lib/api';
import type {
  AnalyticsHierarchyResponse,
  MetaAccount,
  MetaConnection,
} from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { ViewTitle } from '@/components/teams/ViewTitle';
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
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { LinearTabs } from '@/ui/LinearTabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import {
  LinearDataListGroup,
  LinearDataListToolbar,
  LinearDataTable,
} from '@/ui/LinearDataList';
import {
  ActiveFilterFormula,
  FilteredEmptyState,
  LinearFilterButton,
  LinearFilterMenu,
} from '@/components/filters/LinearFilter';
import type { FilterMenuMode } from '@/components/filters/LinearFilter';
import { createLiveFields, filterView, groupView } from './campaignViewModel';
import type { AccountGroupOption } from './campaignViewModel';
import { useCampaignViewFilters } from './useCampaignViewFilters';
import {
  adsManagerGroupings,
  adsManagerOrderings,
  naturalAdsManagerDirection,
  useAdsManagerView,
} from './adsManagerViewModel';
import { ADS_MANAGER_PERIODS, periodFromSearch, type AdsManagerMetrics, type AdsManagerPeriod } from './adsManagerMetrics';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { arrangeGroups, sortByColumn } from '@/ui/listView';
import { DisplayOptionsChangedDot } from '@/ui/LinearDisplayOptions';
import { DetailsPaneLayout, DetailsPaneToggle } from '@/ui/DetailsPane';
import { DetailsFacets, type DetailsFacetTab } from '@/ui/DetailsFacets';
import type { FilterOption } from '@/components/filters/filterModel';
import { SelectionDock } from '@/ui/SelectionDock';
import { SelectionCommandMenu } from '@/ui/SelectionCommandMenu';
import { LinearBoltIcon } from '@/icons/LinearIcons';
import { RuleSelectorPopover } from './RuleSelectorPopover';
import { openCommandMenu } from '@/components/command/CommandMenu';
import { takeRecordActions } from '@/components/command/OpenPalette';
import { useRowSelection, type SelectionAction } from '@/ui/useRowSelection';
import { useRevealRow } from '@/ui/useRevealRow';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';
import {
  LinearPlusIcon,
  LinearSlidersIcon,
  LinearStatusCircleIcon,
} from '@/icons/LinearIcons';
import { getAdsManagerColumns } from './tableColumns';
import {
  eligibleMetaAccounts,
  hierarchyAdSetToRow,
  hierarchyAdToRow,
  hierarchyCampaignToRow,
  metaAccountLabel,
} from './liveCampaigns';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
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
  /** The entity the address names (`/ads-manager/{level}/{id}`): a search result, a shared link. */
  reveal?: { entity: AdsManagerEntity; id: string };
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
}

/** The level's own address; the entity a link named stays with the account being left. */
const levelPath = (pathname: string) => pathname.replace(/(\/(?:ads-manager|my-campaigns)\/[^/]+)\/.*$/, '$1');

/**
 * The details pane's quick filters: real delivery state, the parent campaign
 * of ad sets and ads (#389), then the rules on each row (#367).
 */
const detailsTabs = (entity: AdsManagerEntity) => (entity === 'campaigns' ? ['status', 'rule'] : ['status', 'campaign', 'rule']);

/** Fields a grouping groups by. */
const GROUPING_FIELDS: Record<string, string> = { groups: 'group', rules: 'rule' };

/** A phone keeps the name and Spend side by side; the other figures scroll (#389). */
const PHONE_TABLE_QUERY = '(max-width: 640px)';

function facetIcon(fieldId: string, option: FilterOption): React.ReactNode {
  if (fieldId === 'rule') {
    return <LinearBoltIcon size={14} style={{ color: option.value === 'no-rule' ? 'var(--text-muted)' : option.color }} />;
  }
  if (fieldId === 'campaign') return <span className="details-facets-dot" style={{ backgroundColor: 'var(--text-tertiary)' }} />;
  if (option.value === 'active' || option.value === 'paused') return <LinearStatusCircleIcon status={option.value} size={14} />;
  return <span className="details-facets-dot" style={{ backgroundColor: option.color }} />;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({ reveal, navigationKey }) => {
  const {
    campaignFilterTab,
    setCampaignFilterTab,
    isDisplayOptionsOpen,
    toggleDisplayOptions,
    setIsDisplayOptionsOpen,
    clearCampaignSelection,
    selectedCampaignIds,
    setCampaignSelection,
    loadAccountRuleAttachments,
    attachmentsLoadState,
  } = useAppStore();

  const requestGenerationRef = useRef(0);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);
  const [accountGroups, setAccountGroups] = useState<AccountGroupOption[] | null>(null);
  const [groupsError, setGroupsError] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Each level's own view, saved per member on the server (#385).
  const { view, update: updateView, displayChanged } = useAdsManagerView(campaignFilterTab);
  const displayGrouping = view.grouping;
  const displayOrdering = view.ordering;
  const displayProperties = view.properties;
  const sortDirection = view.direction;
  const [allMetaAccounts, setAllMetaAccounts] = useState<MetaAccount[]>([]);
  // A team's Ads Manager, as Linear's team Issues: only the team's ad accounts.
  const { workspace, user } = useWorkspaceSession();
  const activeTeam = useActiveTeam(workspace.id);
  // My campaigns, as Linear's My issues: the ad accounts you lead.
  const mine = useAppStore((state) => state.myCampaigns);
  const metaAccounts = useMemo(() => {
    if (mine) return allMetaAccounts.filter((account) => account.lead_user_id != null && account.lead_user_id === user.id);
    if (!activeTeam.key) return allMetaAccounts;
    const team = activeTeam.team;
    return team ? allMetaAccounts.filter((account) => account.id !== undefined && team.account_ids.includes(account.id)) : [];
  }, [activeTeam.key, activeTeam.team, allMetaAccounts, mine, user.id]);
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([]);
  const [accountsState, setAccountsState] = useState<LoadState>('loading');
  const [accountsError, setAccountsError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
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
    `${window.location.pathname}:${selectedAccountId ?? ''}:${campaignFilterTab}`,
    navigationKey,
  );
  // Only a quick filter the pane can show applies, so none is ever left on unseen.
  const quick = savedQuick && detailsTabs(campaignFilterTab).includes(savedQuick.fieldId) ? savedQuick : null;
  const [campaigns, setCampaigns] = useState<ReturnType<typeof hierarchyCampaignToRow>[]>([]);
  const [adSets, setAdSets] = useState<ReturnType<typeof hierarchyAdSetToRow>[]>([]);
  const [ads, setAds] = useState<ReturnType<typeof hierarchyAdToRow>[]>([]);
  const [hierarchyState, setHierarchyState] = useState<LoadState>('idle');
  const [hierarchyError, setHierarchyError] = useState('');
  // Delivery this session wrote to Meta, shown on the row over the stored
  // snapshot, which only catches up on its next sync.
  const [deliveryActions, setDeliveryActions] = useState<Record<string, { busy: boolean; status?: 'active' | 'paused' }>>({});
  const [hierarchyReloadKey, setHierarchyReloadKey] = useState(0);
  // The selection's "Apply rule…": one picker over every selected row.
  const [isBulkRulePickerOpen, setIsBulkRulePickerOpen] = useState(false);
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
      setHierarchyState(eligibleAccounts.length > 0 ? 'loading' : 'idle');
      setSelectedAccountId((current) => {
        const sharedAccount = new URLSearchParams(window.location.search).get('account');
        if (!current && sharedAccount && eligibleAccounts.some(account => account.account_id === sharedAccount)) return sharedAccount;
        if (current && eligibleAccounts.some((account) => account.account_id === current)) {
          return current;
        }
        return eligibleAccounts[0]?.account_id ?? null;
      });
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

  // Another team, or the team's accounts arriving: the account on screen must be one of them.
  useEffect(() => {
    if (accountsState !== 'ready') return;
    setSelectedAccountId((current) => (
      current && metaAccounts.some((account) => account.account_id === current) ? current : metaAccounts[0]?.account_id ?? null
    ));
  }, [accountsState, metaAccounts]);

  // The address names the ad account on every navigation — a search result, a
  // shared link, Back — and it wins over the one on screen.
  useEffect(() => {
    const accountId = new URLSearchParams(window.location.search).get('account');
    if (!accountId || accountId === selectedAccountId) return;
    if (!metaAccounts.some((account) => account.account_id === accountId)) return;
    requestGenerationRef.current += 1;
    setHierarchyState('loading');
    setSelectedAccountId(accountId);
  }, [metaAccounts, navigationKey, selectedAccountId]);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<AccountGroupOption[]>('/api/account-groups')
      .then(groups => { if (!cancelled) setAccountGroups(groups); })
      .catch(() => { if (!cancelled) setGroupsError(true); });
    return () => { cancelled = true; };
  }, []);

  // Rule attachments are per ad account, so they reload whenever it changes.
  useEffect(() => {
    void loadAccountRuleAttachments(selectedAccountId);
  }, [loadAccountRuleAttachments, selectedAccountId]);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    clearCampaignSelection();
    setDeliveryActions({});
    setCampaigns([]);
    setAdSets([]);
    setAds([]);
    setHierarchyError('');
    if (!selectedAccountId) {
      setHierarchyState('idle');
      return undefined;
    }

    setHierarchyState('loading');
    const hierarchyRequest = (level: 'campaign' | 'adset' | 'ad') =>
      apiRequest<AnalyticsHierarchyResponse>(
        `/api/analytics/hierarchy?parent_id=${encodeURIComponent(selectedAccountId)}` +
        `&level=${level}&period=${period}`,
      );

    void Promise.all([
      hierarchyRequest('campaign'),
      hierarchyRequest('adset'),
      hierarchyRequest('ad'),
    ])
      .then(([campaignResponse, adSetResponse, adResponse]) => {
        if (generation !== requestGenerationRef.current) return;
        const campaignRows = campaignResponse.items.map(hierarchyCampaignToRow);
        const campaignNames = new Map(campaignRows.map((campaign) => [campaign.id, campaign.name]));
        const adSetRows = adSetResponse.items.map((item) => hierarchyAdSetToRow(item, campaignNames));
        const adSetsById = new Map(adSetRows.map((adSet) => [adSet.id, adSet]));
        setCampaigns(campaignRows);
        setAdSets(adSetRows);
        setAds(adResponse.items.map((item) => hierarchyAdToRow(item, adSetsById)));
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
  }, [hierarchyReloadKey, clearCampaignSelection, selectedAccountId, period]);

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

  const selectedAccount = metaAccounts.find((account) => account.account_id === selectedAccountId);
  const selectAccount = (accountId: string) => {
    if (accountId === selectedAccountId) return;
    requestGenerationRef.current += 1;
    setHierarchyState('loading');
    setSelectedAccountId(accountId);
    const url = new URL(window.location.href);
    url.searchParams.set('account', accountId);
    if (reveal) url.pathname = levelPath(url.pathname);
    window.history.replaceState(window.history.state, '', url);
  };

  const campaignFilterFields = useMemo(() => createLiveFields(campaigns, selectedAccount, accountGroups, 'campaigns', adSets), [campaigns, selectedAccount, accountGroups, adSets]);
  const adSetFilterFields = useMemo(() => createLiveFields(adSets, selectedAccount, accountGroups, 'adsets', adSets, campaigns), [adSets, selectedAccount, accountGroups, campaigns]);
  const adFilterFields = useMemo(() => createLiveFields(ads, selectedAccount, accountGroups, 'ads', adSets, campaigns), [ads, selectedAccount, accountGroups, adSets, campaigns]);
  const currentFilters = adsManagerFilters[campaignFilterTab];
  const currentFilterFields = (
    campaignFilterTab === 'campaigns'
      ? campaignFilterFields
      : campaignFilterTab === 'adsets'
        ? adSetFilterFields
        : adFilterFields
  ) as unknown as typeof campaignFilterFields;
  const updateCurrentFilters = (clauses: FilterClause[]) => {
    setAdsManagerFilters(campaignFilterTab, clauses);
    const url = new URL(window.location.href);
    if (selectedAccountId) url.searchParams.set('account', selectedAccountId);
    window.history.replaceState(window.history.state, '', url);
  };
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
  const groupingField = adsManagerGroupings(campaignFilterTab, accountGroups !== null)
    .some((option) => option.value === displayGrouping)
    ? GROUPING_FIELDS[displayGrouping] ?? displayGrouping
    : 'none';
  // Delivery status is a fixed set, so only its empty groups can be shown.
  const renderGrouped = <T,>(rows: T[], fields: FilterFieldDefinition<T>[], render: (row: T) => React.ReactNode) =>
    arrangeGroups(groupView(rows, fields, groupingField), view, { allowEmpty: groupingField === 'status' }).map(group => (
      <React.Fragment key={group.id}>
        {group.label ? (
          <LinearDataListGroup title={group.label} count={group.rows.length}
            dotColor="var(--text-tertiary)" isCollapsed={Boolean(collapsedGroups[`${groupingField}:${group.id}`])}
            onToggleCollapse={() => setCollapsedGroups(state => ({ ...state, [`${groupingField}:${group.id}`]: !state[`${groupingField}:${group.id}`] }))}>
            {group.rows.map(render)}
          </LinearDataListGroup>
        ) : group.rows.map(render)}
      </React.Fragment>
    ));
  const totalCurrent = campaignFilterTab === 'campaigns' ? campaigns.length : campaignFilterTab === 'adsets' ? adSets.length : ads.length;
  const filteredCurrentCount = campaignFilterTab === 'campaigns' ? filteredCampaigns.length : campaignFilterTab === 'adsets' ? filteredAdSets.length : filteredAds.length;

  const isPhoneTable = useMediaQuery(PHONE_TABLE_QUERY);
  const supportedProperties = displayProperties;
  const tableColumns = useMemo(
    () => getAdsManagerColumns(campaignFilterTab, displayProperties, { spendFirst: isPhoneTable }),
    [campaignFilterTab, displayProperties, isPhoneTable],
  );

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
  // history and toasts; one that finishes after an account switch still records
  // its undo, but no longer paints rows of the account now on screen.
  const captureAccountScope = () => {
    const inScope = useAppStore.getState().captureScope();
    const generation = requestGenerationRef.current;
    return () => inScope() && generation === requestGenerationRef.current;
  };

  /** One row's toggle: the row shows the result, Ctrl+Z takes it back, only a failure speaks. */
  const runDelivery = async (level: EntityLevel, entityId: string, next: boolean) => {
    if (!selectedAccountId || hierarchyState !== 'ready') return;
    const inWorkspace = useAppStore.getState().captureScope();
    const onAccount = captureAccountScope();
    const accountId = selectedAccountId;
    const status: DeliveryStatus = next ? 'ACTIVE' : 'PAUSED';
    const name = rowName(entityId);
    setDeliveryActions((current) => ({ ...current, [entityId]: { ...current[entityId], busy: true } }));
    try {
      const result = await setEntityDelivery(level, entityId, accountId, status);
      if (!inWorkspace()) return;
      if (onAccount()) showDelivery([entityId], result.status);
      if (result.changed && result.audit_event_id) {
        pushHistory(deliveryHistoryEntry({
          label: `${next ? 'resume' : 'pause'} ${name}`,
          accountId,
          targets: [{ level, entityId }],
          status,
          auditEventIds: [result.audit_event_id],
          onStatus: (ids, status) => { if (onAccount()) showDelivery(ids, status); },
        }));
      }
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
    }
  };

  const currentRows = campaignFilterTab === 'campaigns' ? campaigns : campaignFilterTab === 'adsets' ? adSets : ads;

  /** Pauses or resumes every selected row of the current level, reporting each outcome. */
  const runBulkDelivery = async (next: 'active' | 'paused') => {
    if (!selectedAccountId || hierarchyState !== 'ready') return;
    const inWorkspace = useAppStore.getState().captureScope();
    const onAccount = captureAccountScope();
    const level = entityLevels[campaignFilterTab];
    const rows = currentRows.filter((row) => selectedCampaignIds.includes(row.id));
    const eligible = rows.filter((row) => row.status !== 'unknown');
    const status: DeliveryStatus = next === 'active' ? 'ACTIVE' : 'PAUSED';
    const accountId = selectedAccountId;
    const noun = entityLabels[campaignFilterTab];
    setDeliveryActions((current) => ({
      ...current,
      ...Object.fromEntries(eligible.map((row) => [row.id, { ...current[row.id], busy: true }])),
    }));
    const outcome = await setDeliveryForMany(
      eligible.map((row) => ({ level, entityId: row.id })),
      selectedAccountId,
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
        accountId,
        targets: changed.map((item) => ({ level, entityId: item.entityId })),
        status,
        auditEventIds: changed.flatMap((item) => (item.auditEventId ? [item.auditEventId] : [])),
        onStatus: (ids, status) => { if (onAccount()) showDelivery(ids, status); },
      }));
    }
    reportBulkDelivery(outcome, status, noun, rows.length - eligible.length);
  };

  const selectionNoun = entityLabels[campaignFilterTab];
  const selectionActions: SelectionAction[] = [
    { id: 'pause', label: 'Pause delivery', shortcut: 'p', icon: <Pause size={14} />, run: () => void runBulkDelivery('paused') },
    { id: 'resume', label: 'Resume delivery', shortcut: 'r', icon: <Play size={14} />, run: () => void runBulkDelivery('active') },
    // Meta's "Apply rule to" the selected campaigns or ad sets; ads take no rules.
    ...(campaignFilterTab !== 'ads' && attachmentsLoadState === 'ready'
      ? [{ id: 'rule', label: 'Apply rule…', shortcut: 'a', icon: <LinearBoltIcon size={14} />, run: () => setIsBulkRulePickerOpen(true) }]
      : []),
  ];
  const selectedRowIds = currentRows.filter((row) => selectedCampaignIds.includes(row.id)).map((row) => row.id);
  const visibleRowIds = useMemo(() => (
    campaignFilterTab === 'campaigns' ? filteredCampaigns : campaignFilterTab === 'adsets' ? filteredAdSets : filteredAds
  ).map((row) => row.id), [campaignFilterTab, filteredAds, filteredAdSets, filteredCampaigns]);
  const selection = useRowSelection({
    selectedIds: selectedCampaignIds,
    visibleIds: visibleRowIds,
    setSelection: setCampaignSelection,
    actions: selectionActions,
    enabled: accountsState === 'ready' && hierarchyState === 'ready' && Boolean(selectedAccountId),
  });
  // A picker left over a selection that is gone must not reopen on the next one.
  useEffect(() => {
    if (selectedRowIds.length === 0) setIsBulkRulePickerOpen(false);
  }, [selectedRowIds.length]);

  // The entity an address names opens on its row once its ad account and
  // level are on screen; an account the address names but Ads Manager cannot
  // open leaves the one on screen in place.
  const requestedAccountId = new URLSearchParams(window.location.search).get('account');
  const accountSettled = !requestedAccountId
    || requestedAccountId === selectedAccountId
    || !metaAccounts.some((account) => account.account_id === requestedAccountId);
  const revealedNoun = reveal ? entityLabels[reveal.entity].singular : '';
  useRevealRow({
    id: reveal?.id,
    navigationKey,
    ready: reveal?.entity === campaignFilterTab && accountsState === 'ready' && hierarchyState === 'ready'
      && accountSettled && (accountGroups !== null || groupsError),
    exists: currentRows.some((row) => row.id === reveal?.id),
    show: () => {
      if (!reveal) return false;
      const filteredOut = !visibleRowIds.includes(reveal.id);
      if (filteredOut) clearFilters();
      const groups: { id: string; label: string; rows: { id: string }[] }[] = campaignFilterTab === 'campaigns'
        ? groupView(campaigns, campaignFilterFields, groupingField)
        : campaignFilterTab === 'adsets'
          ? groupView(adSets, adSetFilterFields, groupingField)
          : groupView(ads, adFilterFields, groupingField);
      const collapsed = groups
        .filter((group) => group.label && group.rows.some((row) => row.id === reveal.id))
        .map((group) => `${groupingField}:${group.id}`)
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
      description: `There is no such ${revealedNoun} in ${selectedAccount ? metaAccountLabel(selectedAccount) : 'this ad account'} ${period === 'today' ? 'today' : `for ${periodLabel.toLowerCase()}`}.`,
    }),
  });

  /** A live control, or nothing when the row cannot honestly be acted on. */
  const deliveryControl = (
    level: EntityLevel,
    entityId: string,
    status: 'active' | 'paused' | 'unknown',
  ): DeliveryControl | undefined => {
    if (!selectedAccountId || status === 'unknown') return undefined;
    const local = deliveryActions[entityId];
    return {
      status: local?.status ?? status,
      busy: Boolean(local?.busy),
      onChange: (next) => void runDelivery(level, entityId, next),
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
        <AdSetRow key={adSet.id} adSet={adSet} properties={supportedProperties} columns={tableColumns} readOnly selectable delivery={deliveryControl('adset', adSet.id, adSet.status)} />
      ));
    }
    if (campaignFilterTab === 'ads') {
      return renderGrouped(filteredAds, adFilterFields, (ad) => (
        <AdRow key={ad.id} ad={ad} properties={supportedProperties} columns={tableColumns} readOnly selectable delivery={deliveryControl('ad', ad.id, ad.status)} />
      ));
    }
    return renderGrouped(filteredCampaigns, campaignFilterFields, (campaign) => (
      <CampaignRow
        key={campaign.id}
        campaign={campaign}
        properties={supportedProperties}
        columns={tableColumns}
        readOnly
        selectable
        delivery={deliveryControl('campaign', campaign.id, campaign.status)}
      />
    ));
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
          secondaryLabel="Add account"
          onSecondary={openMetaDialog}
        />
      );
    }
    if (mine && metaAccounts.length === 0 && allMetaAccounts.length > 0) {
      return (
        <DataState
          title="No ad accounts you lead"
          detail="Campaigns of the ad accounts you lead show here. Set yourself as Lead on an ad account's page or in the Ad accounts list."
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
          secondaryLabel="Add account"
          onSecondary={openMetaDialog}
        />
      );
    }
    if ((currentFilters.some(clause => clause.fieldId === 'group') || quick?.fieldId === 'group') && accountGroups === null) {
      return <DataState title={groupsError ? 'Account group filters unavailable' : 'Loading account groups…'}
        detail={groupsError ? 'Reload to retry, or clear the group filter.' : 'Waiting for group membership.'}
        actionLabel={groupsError ? 'Clear filters' : undefined} onAction={groupsError ? clearFilters : undefined} />;
    }
    if (totalCurrent === 0) {
      return (
        <DataState
          title={`No ${entityLabels[campaignFilterTab].plural} in this ad account`}
          detail={`Meta returned no ${entityLabels[campaignFilterTab].singular} inventory for this imported account. Zero-activity entities are included when they exist.`}
          actionLabel="Retry"
          onAction={() => setHierarchyReloadKey((value) => value + 1)}
        />
      );
    }

    return (
      <LinearDataTable
        className="campaign-list-container"
        columns={tableColumns}
        sortKey={effectiveOrdering === 'manual' ? undefined : effectiveOrdering}
        sortDirection={sortDirection}
        onSort={(columnId) => updateView(sortByColumn({ ...view, ordering: effectiveOrdering }, columnId, naturalAdsManagerDirection(columnId)))}
        after={filteredCurrentCount > 0 && filteredCurrentCount < totalCurrent && (
          <div className="campaign-filter-summary">
            <span>{totalCurrent - filteredCurrentCount} {entityLabels[campaignFilterTab].plural} hidden by filters</span>
            <Button size="compact" onClick={clearFilters}>Clear filters</Button>
          </div>
        )}
      >
        {renderRows()}
      </LinearDataTable>
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
          <div className="flex items-center">
            <SidebarCollapsedNavigation />
            <ViewTitle title={mine ? 'My campaigns' : 'Campaigns'} team={mine ? null : activeTeam.team} />
          </div>
          {selectedAccount ? (
            <DropdownMenuAccount
              account={selectedAccount}
              accounts={metaAccounts}
              selectedAccountId={selectedAccountId}
              onSelect={selectAccount}
              onConnect={openMetaDialog}
            />
          ) : (
            <HeaderCreateButton label="Add account" tooltip="Add ad account" onClick={openMetaDialog} />
          )}
        </div>

        <LinearDataListToolbar className="campaign-view-toolbar">
          {/* When the tabs no longer fit they fold into one menu, as in Linear; the actions stay on the right. */}
          <LinearTabs
            collapseOverflow
            tabs={[
              { id: 'campaigns', label: 'Campaigns', count: hierarchyState === 'ready' ? campaigns.length : undefined },
              { id: 'adsets', label: 'Ad sets', count: hierarchyState === 'ready' ? adSets.length : undefined },
              { id: 'ads', label: 'Ads', count: hierarchyState === 'ready' ? ads.length : undefined },
            ]}
            activeTabId={campaignFilterTab}
            onChange={(id) => setCampaignFilterTab(id as AdsManagerEntity)}
            aria-label="Level"
          />

          <div className="flex shrink-0 items-center gap-1.5">
            <PeriodMenu period={period} label={periodLabel} onChange={setPeriod} />
            <Tooltip content="Add Filter" shortcut="F" disabled={Boolean(openFilterMenu)}>
              <LinearFilterButton
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
                className="linear-header-button linear-header-button--toolbar linear-header-target group"
              >
                <LinearSlidersIcon size={14} />
                <DisplayOptionsChangedDot show={displayChanged} />
              </button>
            </Tooltip>
            <DisplayOptionsPopover
              isOpen={isDisplayOptionsOpen}
              onClose={() => setIsDisplayOptionsOpen(false)}
              anchorRef={displayOptionsButtonRef}
              entity={campaignFilterTab}
              hasAccountGroups={accountGroups !== null}
              groups={groupView(currentRows as never[], currentFilterFields as never[], groupingField)
                .filter((group) => group.label)
                .map((group) => ({ id: group.id, label: group.label }))}
            />

            <DetailsPaneToggle pane="adsManager" />
          </div>
        </LinearDataListToolbar>

        <ActiveFilterFormula
          fields={currentFilterFields}
          clauses={currentFilters}
          onChange={updateCurrentFilters}
          onOpenMenu={showFilterMenu}
        />
      </header>

      <LinearFilterMenu
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

      <SelectionCommandMenu
        open={selection.menuOpen}
        onOpenChange={selection.setMenuOpen}
        scope={selection.count === 1
          ? { label: rowName(selectedCampaignIds[0]) }
          : { label: `${selection.count} ${selectionNoun.plural}` }}
        actions={selectionActions}
        onClearScope={openCommandMenu}
      />

      {campaignFilterTab !== 'ads' && (
        <RuleSelectorPopover
          isOpen={isBulkRulePickerOpen && selectedRowIds.length > 0}
          onClose={() => setIsBulkRulePickerOpen(false)}
          anchorRect={null}
          level={campaignFilterTab === 'campaigns' ? 'campaign' : 'adset'}
          entityIds={selectedRowIds}
          shortcut="A"
        />
      )}

      <MetaConnectionDialog
        open={isMetaDialogOpen || returnedConnectionId !== null}
        connectionId={returnedConnectionId}
        returnPath={window.location.pathname}
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

interface DropdownMenuAccountProps {
  account: MetaAccount;
  accounts: MetaAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  onConnect: () => void;
}

const DropdownMenuAccount: React.FC<DropdownMenuAccountProps> = ({
  account,
  accounts,
  selectedAccountId,
  onSelect,
  onConnect,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="max-w-[120px] truncate rounded-full border border-[var(--color-border-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)] sm:max-w-[220px] lg:max-w-[280px] [@media(hover:none)_and_(pointer:coarse)]:min-h-8"
          aria-label="Select ad account"
          title={metaAccountLabel(account)}
        >
          {metaAccountLabel(account)} ▾
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: 'min(360px, calc(100vw - 32px))' }}>
        <DropdownMenuLabel>Ad account</DropdownMenuLabel>
        {accounts.map((candidate) => (
          <DropdownMenuItem key={candidate.account_id} onSelect={() => onSelect(candidate.account_id)}>
            <span className="truncate">{metaAccountLabel(candidate)}</span>
            {candidate.account_id === selectedAccountId && <span aria-hidden="true">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* The Ad accounts page, as Linear's "All projects" (#388). */}
        <DropdownMenuItem
          onSelect={() => {
            const slug = useAppStore.getState().workspaceSlug;
            if (slug) openAppPath(pathForTab(slug, 'accounts'));
          }}
        >
          <span>All ad accounts…</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onConnect}>
          <span className="flex items-center gap-1.5">
            <LinearPlusIcon size={14} aria-hidden="true" />
            Add account
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
