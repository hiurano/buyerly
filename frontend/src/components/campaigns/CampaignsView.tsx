import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiRequest } from '@/lib/api';
import type { MetaAccount, MetaConnection } from '@/lib/types';
import { CampaignRow } from './CampaignRow';
import { AdSetRow } from './AdSetRow';
import { AdRow } from './AdRow';
import { CampaignRightSidebar } from './CampaignRightSidebar';
import { DisplayOptionsPopover } from './DisplayOptionsPopover';
import { CampaignGroupHeader } from './CampaignGroupHeader';
import { Tooltip } from '@/ui/Tooltip';
import { LinearTabs } from '@/ui/LinearTabs';
import { LinearDataListColumnHeader, LinearDataListStack, LinearDataListToolbar, LinearDataListViewport } from '@/ui/LinearDataList';
import { getAdsManagerColumns, getAdsManagerTableMinWidth } from './tableColumns';
import {
  ActiveFilterFormula,
  FilteredEmptyState,
  FilterMenuMode,
  LinearFilterButton,
  LinearFilterMenu,
} from '@/components/filters/LinearFilter';
import {
  createAdFilterFields,
  createAdSetFilterFields,
  createCampaignFilterFields,
} from '@/components/filters/filterCatalogs';
import { applyFilterClauses, FilterClause } from '@/components/filters/filterModel';
import {
  LinearPlusIcon,
  LinearSlidersIcon,
  LinearSidebarToggleIcon,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';
import { MetaConnectionDialog } from './MetaConnectionDialog';

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

export const CampaignsView: React.FC = () => {
  const {
    campaigns,
    adSets,
    ads,
    campaignFilterTab,
    setCampaignFilterTab,
    isRightSidebarOpen,
    toggleRightSidebar,
    campaignGroups,
    campaignAttachedRules,
    rules,
    adsManagerFilters,
    setAdsManagerFilters,
    adsManagerQuickFilter,
    clearAdsManagerQuickFilter,
    isDisplayOptionsOpen,
    toggleDisplayOptions,
    setIsDisplayOptionsOpen,
    displayGrouping,
    displayOrdering,
    setDisplayOrdering,
    displayProperties,
    collapsedGroups,
    toggleGroupCollapse,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
  } = useAppStore();

  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[] | null>(null);
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([]);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [returnedConnectionId, setReturnedConnectionId] = useState<number | null>(
    Number(new URLSearchParams(window.location.search).get('meta_connection')) || null,
  );

  const refreshMetaAccounts = async () => {
    const [accounts, connections] = await Promise.all([
      apiRequest<MetaAccount[]>('/api/accounts'),
      apiRequest<MetaConnection[]>('/api/meta/connections'),
    ]);
    setMetaAccounts(accounts);
    setMetaConnections(connections);
  };

  useEffect(() => {
    void refreshMetaAccounts().catch(() => setMetaAccounts(null));
  }, []);

  const clearMetaCallback = () => {
    window.history.replaceState({}, '', window.location.pathname);
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

  const campaignFilterFields = useMemo(
    () =>
      createCampaignFilterFields({
        campaigns,
        campaignGroups,
        rules,
        campaignAttachedRules,
      }),
    [campaignAttachedRules, campaignGroups, campaigns, rules]
  );

  const adSetFilterFields = useMemo(
    () =>
      createAdSetFilterFields({
        adSets,
        campaigns,
        campaignGroups,
        rules,
        campaignAttachedRules,
      }),
    [adSets, campaignAttachedRules, campaignGroups, campaigns, rules]
  );

  const adFilterFields = useMemo(
    () =>
      createAdFilterFields({
        ads,
        adSets,
        campaigns,
        campaignGroups,
        rules,
        campaignAttachedRules,
      }),
    [adSets, ads, campaignAttachedRules, campaignGroups, campaigns, rules]
  );

  const currentFilters = adsManagerFilters[campaignFilterTab];
  const currentFields =
    campaignFilterTab === 'campaigns'
      ? campaignFilterFields
      : campaignFilterTab === 'adsets'
      ? adSetFilterFields
      : adFilterFields;
  const currentFilterUiFields = currentFields as unknown as typeof campaignFilterFields;

  const updateCurrentFilters = (clauses: FilterClause[]) =>
    setAdsManagerFilters(campaignFilterTab, clauses);

  const clearAllCurrentFilters = () => {
    updateCurrentFilters([]);
    clearAdsManagerQuickFilter();
  };

  const getEffectiveFilters = (entity: 'campaigns' | 'adsets' | 'ads'): FilterClause[] => {
    const explicitFilters = adsManagerFilters[entity];
    if (!adsManagerQuickFilter || adsManagerQuickFilter.entity !== entity) {
      return explicitFilters;
    }
    return [
      ...explicitFilters,
      {
        fieldId: adsManagerQuickFilter.fieldId,
        operator: 'is',
        values: [adsManagerQuickFilter.value],
      },
    ];
  };

  const showFilterMenu = (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => {
    setOpenFilterMenu({ mode, anchor, fieldId });
  };

  // Global hotkey: 'V' for Display options (when not typing in an input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsDisplayOptionsOpen(false);
        if (filterButtonRef.current) {
          setOpenFilterMenu((current) =>
            current ? null : { mode: 'root', anchor: filterButtonRef.current as HTMLElement }
          );
        }
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setOpenFilterMenu(null);
        toggleDisplayOptions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsDisplayOptionsOpen, toggleDisplayOptions]);

  useEffect(() => {
    setOpenFilterMenu(null);
  }, [campaignFilterTab]);

  let filteredCampaigns = applyFilterClauses(
    campaigns,
    campaignFilterFields,
    getEffectiveFilters('campaigns')
  );
  const parseMetric = (value: string) => Number.parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
  const directionFactor = sortDirection === 'asc' ? 1 : -1;

  // Apply Ordering
  if (displayOrdering === 'name') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
  } else if (displayOrdering === 'spend') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => {
      return (parseMetric(a.spend) - parseMetric(b.spend)) * directionFactor;
    });
  } else if (displayOrdering === 'roi') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => {
      return (parseMetric(a.roi) - parseMetric(b.roi)) * directionFactor;
    });
  } else if (displayOrdering === 'results') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => (a.leadsCount - b.leadsCount) * directionFactor);
  } else if (displayOrdering === 'budget') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => (parseMetric(a.budget) - parseMetric(b.budget)) * directionFactor);
  } else if (displayOrdering === 'cpa') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => (parseMetric(a.cpa) - parseMetric(b.cpa)) * directionFactor);
  } else if (displayOrdering === 'created') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => (Date.parse(a.date) - Date.parse(b.date)) * directionFactor);
  }

  let filteredAdSets = applyFilterClauses(adSets, adSetFilterFields, getEffectiveFilters('adsets'));
  let filteredAds = applyFilterClauses(ads, adFilterFields, getEffectiveFilters('ads'));

  if (displayOrdering === 'name') {
    filteredAdSets = [...filteredAdSets].sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
    filteredAds = [...filteredAds].sort((a, b) => a.name.localeCompare(b.name) * directionFactor);
  } else if (displayOrdering === 'spend') {
    filteredAdSets = [...filteredAdSets].sort((a, b) => (parseMetric(a.spend) - parseMetric(b.spend)) * directionFactor);
    filteredAds = [...filteredAds].sort((a, b) => (parseMetric(a.spend) - parseMetric(b.spend)) * directionFactor);
  } else if (displayOrdering === 'roi') {
    filteredAdSets = [...filteredAdSets].sort((a, b) => (parseMetric(a.roi) - parseMetric(b.roi)) * directionFactor);
  } else if (displayOrdering === 'results') {
    filteredAdSets = [...filteredAdSets].sort((a, b) => (a.leadsCount - b.leadsCount) * directionFactor);
    filteredAds = [...filteredAds].sort((a, b) => (a.leadsCount - b.leadsCount) * directionFactor);
  } else if (displayOrdering === 'budget') {
    filteredAdSets = [...filteredAdSets].sort((a, b) => (parseMetric(a.budget) - parseMetric(b.budget)) * directionFactor);
  } else if (displayOrdering === 'cpa') {
    filteredAdSets = [...filteredAdSets].sort((a, b) => (parseMetric(a.cpa) - parseMetric(b.cpa)) * directionFactor);
    filteredAds = [...filteredAds].sort((a, b) => (parseMetric(a.cpa) - parseMetric(b.cpa)) * directionFactor);
  }

  const tableColumns = getAdsManagerColumns(campaignFilterTab, displayProperties);
  const tableMinWidth = getAdsManagerTableMinWidth(tableColumns);
  const hasExplicitFilter = currentFilters.length > 0;
  const hasQuickFilter = Boolean(adsManagerQuickFilter?.entity === campaignFilterTab);
  const hasFilterActive = hasExplicitFilter || hasQuickFilter;

  const totalCurrent =
    campaignFilterTab === 'adsets'
      ? adSets.length
      : campaignFilterTab === 'ads'
      ? ads.length
      : campaigns.length;

  const filteredCurrentCount =
    campaignFilterTab === 'adsets'
      ? filteredAdSets.length
      : campaignFilterTab === 'ads'
      ? filteredAds.length
      : filteredCampaigns.length;

  const hiddenCount = totalCurrent - filteredCurrentCount;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      {/* 1. Header (Stacked 2 Tiers = 87px total) - Spans full width across canvas */}
      <header className="flex shrink-0 flex-col">
        {/* Tier 1: Title (44px) with border-bottom */}
        <div
          style={{
            borderBottom: '1px solid var(--color-border-primary)',
            paddingLeft: '14px',
          }}
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
                transition:
                  'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="flex shrink-0 items-center justify-center"
            >
              <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="linear-icon-btn"
                  aria-label="Open sidebar"
                >
                  <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                letterSpacing: '-0.01em',
                color: 'var(--text-secondary)',
              }}
            >
              Ads Manager
            </h2>
          </div>
          <button
            className="ui-button flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-transparent bg-transparent px-2.5 text-[13px] font-medium text-[var(--text-secondary)] shadow-none outline-none transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
            type="button"
            onClick={openMetaDialog}
          >
            <LinearPlusIcon size={14} />
            <span>Connect Facebook</span>
          </button>
        </div>

        {/* Tier 2: View Filter Tabs & Action Buttons (43px) */}
        <LinearDataListToolbar>
          {/* Left: View Tabs with Linear Sliding Pill Physics */}
          <LinearTabs
            tabs={[
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'adsets', label: 'Ad sets' },
              { id: 'ads', label: 'Ads' },
            ]}
            activeTabId={campaignFilterTab}
            onChange={(id) => setCampaignFilterTab(id as 'campaigns' | 'adsets' | 'ads')}
          />

          {/* Right: Add filter + Display options + Toggle Sidebar */}
          <div className="flex items-center gap-1.5">
            <Tooltip content="Add filter" shortcut="F">
              <LinearFilterButton
                ref={filterButtonRef}
                active={hasExplicitFilter}
                open={Boolean(openFilterMenu)}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  setIsDisplayOptionsOpen(false);
                  setOpenFilterMenu((current) =>
                    current ? null : { mode: 'root', anchor: event.currentTarget }
                  );
                }}
              />
            </Tooltip>

            {/* Display Options Button with Popover */}
            <div className="relative">
              <Tooltip content="Show display options" shortcut="Shift V">
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
                  className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-transparent outline-none transition-all ${
                    isDisplayOptionsOpen
                      ? 'bg-[var(--item-active-bg)] text-[var(--text-primary)]'
                      : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <LinearSlidersIcon size={14} />
                </button>
              </Tooltip>

              <DisplayOptionsPopover
                isOpen={isDisplayOptionsOpen}
                onClose={() => setIsDisplayOptionsOpen(false)}
                anchorRef={displayOptionsButtonRef}
              />
            </div>

            {/* Toggle Right Details Sidebar */}
            <Tooltip
              content={isRightSidebarOpen ? 'Close details' : 'Open details'}
              shortcut="Alt I"
            >
              <button
                type="button"
                aria-label={isRightSidebarOpen ? 'Close details' : 'Open details'}
                onClick={toggleRightSidebar}
                className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all border ${
                  isRightSidebarOpen
                    ? 'bg-[var(--item-hover-bg)] border-[var(--color-border-secondary)] text-[var(--text-primary)]'
                    : 'bg-transparent border-transparent text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LinearSidebarToggleIcon isOpen={isRightSidebarOpen} size={14} />
              </button>
            </Tooltip>
          </div>
        </LinearDataListToolbar>

        <ActiveFilterFormula
          fields={currentFilterUiFields}
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
        fields={currentFilterUiFields}
        clauses={currentFilters}
        onChange={updateCurrentFilters}
        onClose={() => setOpenFilterMenu(null)}
      />

      {/* 2. Main Content Area below Header (Split: List on Left, Right Sidebar on Right) */}
      <div className="flex flex-1 overflow-hidden" style={{ flexDirection: 'row' }}>
        {/* Left: Campaign / Ad Set / Ad List Scroll Container */}
        {metaAccounts && metaAccounts.length === 0 ? (
          <section className="ui-empty-state flex flex-1 items-center justify-center" aria-label="Подключение рекламных кабинетов">
            <button
              className="ui-button ui-button-primary inline-flex h-11 items-center justify-center rounded-lg border border-[var(--text-primary)] bg-[var(--text-primary)] px-5 text-[14px] font-medium text-[var(--bg-canvas)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
              type="button"
              onClick={openAccountSelection}
            >
              Connect Facebook
            </button>
          </section>
        ) : (
        <LinearDataListViewport className="campaign-list-container" horizontal>
          <div style={{ minWidth: `${tableMinWidth}px` }}>
            <LinearDataListColumnHeader
              columns={tableColumns}
              minWidth={tableMinWidth}
              sortKey={displayOrdering === 'manual' ? undefined : displayOrdering}
              sortDirection={sortDirection}
              onSort={(columnId) => {
                if (displayOrdering === columnId) {
                  setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
                } else {
                  setDisplayOrdering(columnId as typeof displayOrdering);
                  setSortDirection(columnId === 'name' ? 'asc' : 'desc');
                }
              }}
            />

            <LinearDataListStack>
            {campaignFilterTab === 'adsets' ? (
              filteredAdSets.length === 0 ? (
                hasFilterActive ? (
                  <FilteredEmptyState noun="ad sets" hiddenCount={hiddenCount} onClear={clearAllCurrentFilters} />
                ) : (
                  <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">No ad sets found</div>
                )
              ) : (
                filteredAdSets.map((adSet) => <AdSetRow key={adSet.id} adSet={adSet} />)
              )
            ) : campaignFilterTab === 'ads' ? (
              filteredAds.length === 0 ? (
                hasFilterActive ? (
                  <FilteredEmptyState noun="ads" hiddenCount={hiddenCount} onClear={clearAllCurrentFilters} />
                ) : (
                  <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">No ads found</div>
                )
              ) : (
                filteredAds.map((ad) => <AdRow key={ad.id} ad={ad} />)
              )
            ) : filteredCampaigns.length === 0 ? (
              hasFilterActive ? (
                <FilteredEmptyState noun="campaigns" hiddenCount={hiddenCount} onClear={clearAllCurrentFilters} />
              ) : (
                <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">No campaigns found</div>
              )
            ) : displayGrouping === 'groups' ? (
              campaignGroups.map((group) => {
                const groupCampaigns = filteredCampaigns.filter((c) => c.groupIds.includes(group.id));
                if (groupCampaigns.length === 0) return null;
                return (
                  <div key={group.id}>
                    {/* Linear-style Group Header */}
                    {(() => {
                      const isCollapsed = collapsedGroups.includes(group.id);
                      return (
                        <>
                          <CampaignGroupHeader
                            groupId={group.id}
                            groupName={group.name}
                            count={groupCampaigns.length}
                            dotColor={group.color}
                            accentLch={group.accentColor}
                            isCollapsed={isCollapsed}
                            onToggleCollapse={() => toggleGroupCollapse(group.id)}
                          />
                          {!isCollapsed && (
                            <div className="space-y-0.5">
                              {groupCampaigns.map((campaign) => (
                                <CampaignRow key={campaign.id} campaign={campaign} />
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                );
              })
            ) : (
              filteredCampaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))
            )}
            </LinearDataListStack>

          {/* Footer Filter Notification Banner */}
            {hasFilterActive && hiddenCount > 0 && (
            <div className="mt-4 flex items-center justify-center gap-4 py-4 text-[12px] text-[var(--text-tertiary)]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--text-secondary)]">{hiddenCount}</span>
                <span>more hidden by filters</span>
                <button
                  type="button"
                  onClick={clearAllCurrentFilters}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]"
                >
                  <span>Clear Filters</span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2.97 2.97a.75.75 0 0 1 1.06 0L8 6.94l3.97-3.97a.75.75 0 1 1 1.06 1.06L9.06 8l3.97 3.97a.75.75 0 1 1-1.06 1.06L8 9.06l-3.97 3.97a.75.75 0 0 1-1.06-1.06L6.94 8 2.97 4.03a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              </div>
            </div>
            )}
          </div>
        </LinearDataListViewport>
        )}

        {/* Right: Linear Right Context Sidebar (Groups Filter Panel) */}
        <CampaignRightSidebar />
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
        onImported={() => { void refreshMetaAccounts(); }}
      />
    </div>
  );
};
