import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api';
import type {
  AnalyticsHierarchyResponse,
  MetaAccount,
  MetaConnection,
} from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';
import type { AdsManagerEntity } from '@/store/useAppStore';
import { CampaignRow } from './CampaignRow';
import { AdSetRow } from './AdSetRow';
import { AdRow } from './AdRow';
import { DisplayOptionsPopover } from './DisplayOptionsPopover';
import { MetaConnectionDialog } from './MetaConnectionDialog';
import { DataState } from '@/ui/DataState';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { LinearTabs } from '@/ui/LinearTabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import {
  LinearDataListGroupHeader,
  LinearDataListColumnHeader,
  LinearDataListStack,
  LinearDataListToolbar,
  LinearDataListViewport,
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
import { LinearFacetSidebar } from '@/ui/LinearFacetSidebar';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';
import {
  LinearSidebarToggleIcon,
  LinearPlusIcon,
  LinearSidebarLeftToggleIcon,
  LinearSlidersIcon,
} from '@/icons/LinearIcons';
import { getAdsManagerColumns, getAdsManagerTableMinWidth } from './tableColumns';
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

const entityLabels: Record<AdsManagerEntity, { plural: string; singular: string }> = {
  campaigns: { plural: 'campaigns', singular: 'campaign' },
  adsets: { plural: 'ad sets', singular: 'ad set' },
  ads: { plural: 'ads', singular: 'ad' },
};

export const CampaignsView: React.FC = () => {
  const {
    campaignFilterTab,
    setCampaignFilterTab,
    isRightSidebarOpen,
    toggleRightSidebar,
    displayGrouping,
    displayOrdering,
    setDisplayOrdering,
    displayProperties,
    isDisplayOptionsOpen,
    toggleDisplayOptions,
    setIsDisplayOptionsOpen,
    clearCampaignSelection,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    loadAccountRuleAttachments,
  } = useAppStore();

  const requestGenerationRef = useRef(0);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);
  const [facetTab, setFacetTab] = useState('status');
  const [accountGroups, setAccountGroups] = useState<AccountGroupOption[] | null>(null);
  const [groupsError, setGroupsError] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([]);
  const [accountsState, setAccountsState] = useState<LoadState>('loading');
  const [accountsError, setAccountsError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { filters: adsManagerFilters, updateFilters: setAdsManagerFilters, quick, setQuick } = useCampaignViewFilters(
    `${window.location.pathname}:${selectedAccountId ?? ''}:${campaignFilterTab}`,
  );
  const [campaigns, setCampaigns] = useState<ReturnType<typeof hierarchyCampaignToRow>[]>([]);
  const [adSets, setAdSets] = useState<ReturnType<typeof hierarchyAdSetToRow>[]>([]);
  const [ads, setAds] = useState<ReturnType<typeof hierarchyAdToRow>[]>([]);
  const [hierarchyState, setHierarchyState] = useState<LoadState>('idle');
  const [hierarchyError, setHierarchyError] = useState('');
  const [hierarchyReloadKey, setHierarchyReloadKey] = useState(0);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [returnedConnectionId, setReturnedConnectionId] = useState<number | null>(
    Number(new URLSearchParams(window.location.search).get('meta_connection')) || null,
  );

  const refreshMetaAccounts = useCallback(async () => {
    setAccountsState('loading');
    setAccountsError('');
    try {
      const [accounts, connections] = await Promise.all([
        apiRequest<MetaAccount[]>('/api/accounts'),
        apiRequest<MetaConnection[]>('/api/meta/connections').catch(() => []),
      ]);
      const eligibleAccounts = eligibleMetaAccounts(accounts);
      setMetaAccounts(eligibleAccounts);
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
      setAccountsError(requestErrorMessage(error));
      setAccountsState('error');
    }
  }, []);

  useEffect(() => {
    void refreshMetaAccounts();
  }, [refreshMetaAccounts]);

  useEffect(() => {
    const restoreAccount = () => {
      const accountId = new URLSearchParams(window.location.search).get('account');
      if (accountId && metaAccounts.some(account => account.account_id === accountId)) setSelectedAccountId(accountId);
    };
    window.addEventListener('popstate', restoreAccount);
    return () => window.removeEventListener('popstate', restoreAccount);
  }, [metaAccounts]);

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
        `&level=${level}&period=today`,
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
  }, [hierarchyReloadKey, clearCampaignSelection, selectedAccountId]);

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
      } else if (event.key === 'v' || event.key === 'V') {
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
    window.history.replaceState(window.history.state, '', url);
  };

  const campaignFilterFields = useMemo(() => createLiveFields(campaigns, selectedAccount, accountGroups, 'campaigns', adSets), [campaigns, selectedAccount, accountGroups, adSets]);
  const adSetFilterFields = useMemo(() => createLiveFields(adSets, selectedAccount, accountGroups, 'adsets', adSets), [adSets, selectedAccount, accountGroups]);
  const adFilterFields = useMemo(() => createLiveFields(ads, selectedAccount, accountGroups, 'ads', adSets), [ads, selectedAccount, accountGroups, adSets]);
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
  const supportsBudget = campaignFilterTab !== 'ads';
  const supportedOrdering = new Set([
    'manual',
    'name',
    'spend',
    'results',
    'cpa',
    ...(supportsBudget ? ['budget'] : []),
  ]);
  const effectiveOrdering = supportedOrdering.has(displayOrdering) ? displayOrdering : 'manual';
  const parseMetric = (value: string) => Number.parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
  const sortRows = <T extends { name: string; spend: string; leadsCount: number; cpa: string; budget?: string }>(rows: T[]) => {
    const sorted = [...rows];
    if (effectiveOrdering === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
    } else if (effectiveOrdering === 'spend') {
      sorted.sort((a, b) => (parseMetric(a.spend) - parseMetric(b.spend)) * directionFactor);
    } else if (effectiveOrdering === 'results') {
      sorted.sort((a, b) => (a.leadsCount - b.leadsCount) * directionFactor);
    } else if (effectiveOrdering === 'cpa') {
      sorted.sort((a, b) => (parseMetric(a.cpa) - parseMetric(b.cpa)) * directionFactor);
    } else if (effectiveOrdering === 'budget') {
      sorted.sort((a, b) => (parseMetric(a.budget || '') - parseMetric(b.budget || '')) * directionFactor);
    }
    return sorted;
  };

  const campaignView = filterView(campaigns, campaignFilterFields, adsManagerFilters.campaigns, quick);
  const adSetView = filterView(adSets, adSetFilterFields, adsManagerFilters.adsets, quick);
  const adView = filterView(ads, adFilterFields, adsManagerFilters.ads, quick);
  const currentView = campaignFilterTab === 'campaigns' ? campaignView : campaignFilterTab === 'adsets' ? adSetView : adView;
  const filteredCampaigns = sortRows(campaignView.visibleRows);
  const filteredAdSets = sortRows(adSetView.visibleRows);
  const filteredAds = sortRows(adView.visibleRows);
  const clearFilters = () => { updateCurrentFilters([]); setQuick(null); };
  const groupingField = displayGrouping === 'groups' ? 'group' : displayGrouping === 'rules' ? 'rule' : displayGrouping;
  const renderGrouped = <T,>(rows: T[], fields: FilterFieldDefinition<T>[], render: (row: T) => React.ReactNode) =>
    groupView(rows, fields, groupingField).map(group => (
      <React.Fragment key={group.id}>
        {group.label && <LinearDataListGroupHeader title={group.label} count={group.rows.length}
          dotColor="var(--text-tertiary)" isCollapsed={Boolean(collapsedGroups[`${groupingField}:${group.id}`])}
          onToggleCollapse={() => setCollapsedGroups(state => ({ ...state, [`${groupingField}:${group.id}`]: !state[`${groupingField}:${group.id}`] }))} />}
        {(!group.label || !collapsedGroups[`${groupingField}:${group.id}`]) && group.rows.map(render)}
      </React.Fragment>
    ));
  const totalCurrent = campaignFilterTab === 'campaigns' ? campaigns.length : campaignFilterTab === 'adsets' ? adSets.length : ads.length;
  const filteredCurrentCount = campaignFilterTab === 'campaigns' ? filteredCampaigns.length : campaignFilterTab === 'adsets' ? filteredAdSets.length : filteredAds.length;

  const supportedProperties = useMemo(() => ({
    ...displayProperties,
    status: displayProperties.status !== false,
    budget: supportsBudget && displayProperties.budget !== false,
    results: displayProperties.results !== false,
    cpa: displayProperties.cpa !== false,
    spend: displayProperties.spend !== false,
    ctr: campaignFilterTab === 'ads' && displayProperties.ctr !== false,
    cpc: campaignFilterTab === 'ads' && displayProperties.cpc !== false,
    roi: false,
    rules: false,
    group: false,
    created: false,
  }), [campaignFilterTab, displayProperties, supportsBudget]);
  const tableColumns = getAdsManagerColumns(campaignFilterTab, supportedProperties);
  const tableMinWidth = getAdsManagerTableMinWidth(tableColumns);

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
        <AdSetRow key={adSet.id} adSet={adSet} properties={supportedProperties} readOnly />
      ));
    }
    if (campaignFilterTab === 'ads') {
      return renderGrouped(filteredAds, adFilterFields, (ad) => (
        <AdRow key={ad.id} ad={ad} properties={supportedProperties} readOnly />
      ));
    }
    return renderGrouped(filteredCampaigns, campaignFilterFields, (campaign) => (
      <CampaignRow
        key={campaign.id}
        campaign={campaign}
        properties={supportedProperties}
        readOnly
        showIdentifier
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
          secondaryLabel="Connect Facebook"
          onSecondary={openMetaDialog}
        />
      );
    }
    if (metaAccounts.length === 0) {
      return (
        <DataState
          title="Connect an ad account"
          detail="Connect Facebook and import at least one account to see real Meta entities. Automation stays off after import."
          actionLabel="Connect Facebook"
          onAction={openAccountSelection}
        />
      );
    }
    if (hierarchyState === 'loading') {
      return <DataState title="Loading Ads Manager…" detail="Reading saved Meta campaigns, ad sets, ads, and current metrics." />;
    }
    if (hierarchyState === 'error') {
      return (
        <DataState
          title="Couldn't load Ads Manager"
          detail={hierarchyError}
          role="alert"
          actionLabel="Retry"
          onAction={() => setHierarchyReloadKey((value) => value + 1)}
          secondaryLabel="Connect Facebook"
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
      <LinearDataListViewport className="campaign-list-container" horizontal>
        <div style={{ minWidth: `${tableMinWidth}px` }}>
          <LinearDataListColumnHeader
            columns={tableColumns}
            minWidth={tableMinWidth}
            sortKey={effectiveOrdering === 'manual' ? undefined : effectiveOrdering}
            sortDirection={sortDirection}
            onSort={(columnId) => {
              if (effectiveOrdering === columnId) {
                setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
              } else {
                setDisplayOrdering(columnId as typeof displayOrdering);
                setSortDirection(columnId === 'name' ? 'asc' : 'desc');
              }
            }}
          />
          <LinearDataListStack>{renderRows()}</LinearDataListStack>
          {filteredCurrentCount > 0 && filteredCurrentCount < totalCurrent && (
            <div className="campaign-filter-summary">
              <span>{totalCurrent - filteredCurrentCount} {entityLabels[campaignFilterTab].plural} hidden by filters</span>
              <Button size="compact" onClick={clearFilters}>Clear filters</Button>
            </div>
          )}
        </div>
      </LinearDataListViewport>
    );
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">
        <div
          style={{ borderBottom: '1px solid var(--color-border-primary)', paddingLeft: '14px' }}
          className="flex h-[44px] items-center justify-between pr-2.5"
        >
          <div className="flex items-center">
            <div
              style={{
                width: isSidebarCollapsed ? '28px' : '0px',
                opacity: isSidebarCollapsed ? 1 : 0,
                transform: isSidebarCollapsed ? 'scale(1)' : 'scale(0.85)',
                marginRight: isSidebarCollapsed ? '6px' : '0px',
                pointerEvents: isSidebarCollapsed ? 'auto' : 'none',
                overflow: 'hidden',
                transition: 'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="flex shrink-0 items-center justify-center"
            >
              <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
                <button type="button" onClick={toggleSidebarCollapsed} className="linear-icon-btn" aria-label="Open sidebar">
                  <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[var(--text-secondary)]">Ads Manager</h2>
          </div>
          <button
            className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
            type="button"
            onClick={openMetaDialog}
          >
            <LinearPlusIcon size={14} />
            <span>Connect Facebook</span>
          </button>
        </div>

        <LinearDataListToolbar className="campaign-view-toolbar">
          <LinearTabs
            tabs={[
              { id: 'campaigns', label: 'Campaigns', count: hierarchyState === 'ready' ? campaigns.length : undefined },
              { id: 'adsets', label: 'Ad sets', count: hierarchyState === 'ready' ? adSets.length : undefined },
              { id: 'ads', label: 'Ads', count: hierarchyState === 'ready' ? ads.length : undefined },
            ]}
            activeTabId={campaignFilterTab}
            onChange={(id) => setCampaignFilterTab(id as AdsManagerEntity)}
            aria-label="Ads Manager level"
          />

          <div className="flex min-w-0 items-center gap-1.5">
            <Tooltip content="Add filter" shortcut="F">
              <LinearFilterButton
                ref={filterButtonRef}
                active={currentFilters.length > 0}
                open={Boolean(openFilterMenu)}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  setIsDisplayOptionsOpen(false);
                  setOpenFilterMenu((current) => current ? null : { mode: 'root', anchor: event.currentTarget });
                }}
              />
            </Tooltip>
            <Tooltip content="Display options" shortcut="V">
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
                className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-transparent outline-none transition-all ${isDisplayOptionsOpen ? 'bg-[var(--item-active-bg)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'}`}
              >
                <LinearSlidersIcon size={14} />
              </button>
            </Tooltip>
            <DisplayOptionsPopover
              isOpen={isDisplayOptionsOpen}
              onClose={() => setIsDisplayOptionsOpen(false)}
              anchorRef={displayOptionsButtonRef}
              entity={campaignFilterTab}
              hasAccountGroups={accountGroups !== null}
            />

            <Tooltip content={isRightSidebarOpen ? 'Close details' : 'Open details'}>
              <button type="button" className="linear-icon-btn" aria-label={isRightSidebarOpen ? 'Close details' : 'Open details'}
                aria-expanded={isRightSidebarOpen} onClick={toggleRightSidebar}>
                <LinearSidebarToggleIcon size={16} isOpen={isRightSidebarOpen} />
              </button>
            </Tooltip>
            {selectedAccount && (
              <DropdownMenuAccount
                account={selectedAccount}
                accounts={metaAccounts}
                selectedAccountId={selectedAccountId}
                onSelect={selectAccount}
              />
            )}
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
      />

      <div className="campaign-view-body">
        <div className="campaign-view-list">{renderData()}</div>
        {isRightSidebarOpen && hierarchyState === 'ready' && accountsState === 'ready' && (
          <div className="campaign-view-details">
            {groupsError && <p role="status" className="linear-facet-empty">Account groups unavailable. Reload to retry.</p>}
            <LinearFacetSidebar facets={currentView.facets} activeTab={quick?.fieldId ?? facetTab} selection={quick}
              onTabChange={id => { setFacetTab(id); setQuick(null); }} onSelect={setQuick} />
          </div>
        )}
      </div>

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

interface DropdownMenuAccountProps {
  account: MetaAccount;
  accounts: MetaAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
}

const DropdownMenuAccount: React.FC<DropdownMenuAccountProps> = ({
  account,
  accounts,
  selectedAccountId,
  onSelect,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="max-w-[120px] truncate rounded-full border border-[var(--color-border-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)] sm:max-w-[220px] lg:max-w-[280px]"
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
