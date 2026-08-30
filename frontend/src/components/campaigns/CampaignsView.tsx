import React, { useRef, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { CampaignRow } from './CampaignRow';
import { AdSetRow } from './AdSetRow';
import { AdRow } from './AdRow';
import { CampaignRightSidebar } from './CampaignRightSidebar';
import { DisplayOptionsPopover } from './DisplayOptionsPopover';
import { CampaignGroupHeader } from './CampaignGroupHeader';
import { Tooltip } from '@/ui/Tooltip';
import { LinearTabs } from '@/ui/LinearTabs';
import {
  LinearFilterIcon,
  LinearSlidersIcon,
  LinearSidebarToggleIcon,
} from '@/icons/LinearIcons';

/** Per-group GEO color config (dot color + gradient left-stop accent) */
const GEO_GROUP_COLORS: Record<string, { dotColor: string; accentLch: string }> = {
  'group-germany':     { dotColor: 'rgb(59, 130, 246)',  accentLch: 'lch(10.756 5.912 273.56)' },
  'group-netherlands': { dotColor: 'rgb(249, 115, 22)',  accentLch: 'lch(10.756 4.2 50)' },
  'group-italy':       { dotColor: 'rgb(239, 68, 68)',   accentLch: 'lch(10.756 2.366 34.369)' },
  'group-usa':         { dotColor: 'rgb(139, 92, 246)',  accentLch: 'lch(10.756 5.221 300.708)' },
};

const DEFAULT_GROUP_COLOR = { dotColor: 'rgb(148, 163, 184)', accentLch: 'lch(10.756 0.85 272)' };

export const CampaignsView: React.FC = () => {
  const {
    campaigns,
    adSets,
    ads,
    campaignFilterTab,
    setCampaignFilterTab,
    isRightSidebarOpen,
    toggleRightSidebar,
    selectedFilterGroupId,
    setSelectedFilterGroupId,
    ruleGroups,
    campaignAttachedRules,
    isDisplayOptionsOpen,
    toggleDisplayOptions,
    setIsDisplayOptionsOpen,
    displayGrouping,
    displayOrdering,
    collapsedGroups,
    toggleGroupCollapse,
  } = useAppStore();

  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);

  // Global hotkey: 'V' for Display options (when not typing in an input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        toggleDisplayOptions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDisplayOptions]);

  // Filter campaigns by GEO group
  let filteredCampaigns = campaigns.filter((c) => {
    if (selectedFilterGroupId) {
      if (c.groupId !== selectedFilterGroupId) return false;
    }
    return true;
  });

  // Apply Ordering
  if (displayOrdering === 'spend') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => {
      const spendA = parseFloat(a.spend.replace(/[^0-9.]/g, '')) || 0;
      const spendB = parseFloat(b.spend.replace(/[^0-9.]/g, '')) || 0;
      return spendB - spendA;
    });
  } else if (displayOrdering === 'roi') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => {
      const roiA = parseFloat(a.roi.replace(/[^0-9.-]/g, '')) || 0;
      const roiB = parseFloat(b.roi.replace(/[^0-9.-]/g, '')) || 0;
      return roiB - roiA;
    });
  } else if (displayOrdering === 'results') {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => b.leadsCount - a.leadsCount);
  }

  const matchingCampaignIds = new Set(filteredCampaigns.map((c) => c.id));

  // Filter adSets
  const filteredAdSets = adSets.filter((s) => {
    if (selectedFilterGroupId) {
      return matchingCampaignIds.has(s.campaignId);
    }
    return true;
  });

  const matchingAdSetIds = new Set(filteredAdSets.map((s) => s.id));

  // Filter ads
  const filteredAds = ads.filter((a) => {
    if (selectedFilterGroupId) {
      return matchingAdSetIds.has(a.adSetId);
    }
    return true;
  });

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
            borderBottom: '1px solid #1a1b1d',
          }}
          className="flex h-[44px] items-center justify-between pl-2 pr-2.5"
        >
          <div className="flex items-center gap-2">
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                letterSpacing: '-0.01em',
                color: 'lch(90.155% 1.2 272 / 1)',
              }}
            >
              Ads Manager
            </h2>
          </div>
        </div>

        {/* Tier 2: View Filter Tabs & Action Buttons (43px) */}
        <div
          className="flex h-[43px] items-center justify-between pl-2 pr-2.5"
        >
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
              <button
                type="button"
                className="group relative flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[#959496] transition-all hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.12)] hover:text-[#ffffff]"
              >
                <LinearFilterIcon size={14} />
              </button>
            </Tooltip>

            {/* Display Options Button with Popover */}
            <div className="relative">
              <Tooltip content="Display options" shortcut="V">
                <button
                  ref={displayOptionsButtonRef}
                  type="button"
                  onClick={toggleDisplayOptions}
                  className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all border ${
                    isDisplayOptionsOpen
                      ? 'bg-[rgba(255,255,255,0.12)] border-[rgba(255,255,255,0.16)] text-[#ffffff]'
                      : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.06)] text-[#959496] hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.12)] hover:text-[#ffffff]'
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
                onClick={toggleRightSidebar}
                className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all border ${
                  isRightSidebarOpen
                    ? 'bg-[rgba(255,255,255,0.12)] border-[rgba(255,255,255,0.16)] text-[#ffffff]'
                    : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.06)] text-[#959496] hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.12)] hover:text-[#ffffff]'
                }`}
              >
                <LinearSidebarToggleIcon isOpen={isRightSidebarOpen} size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* 2. Main Content Area below Header (Split: List on Left, Right Sidebar on Right) */}
      <div className="flex flex-1 overflow-hidden" style={{ flexDirection: 'row' }}>
        {/* Left: Campaign / Ad Set / Ad List Scroll Container */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {/* Rows List */}
          <div className="space-y-0.5">
            {campaignFilterTab === 'adsets' ? (
              filteredAdSets.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">
                  No ad sets found
                </div>
              ) : (
                filteredAdSets.map((adSet) => <AdSetRow key={adSet.id} adSet={adSet} />)
              )
            ) : campaignFilterTab === 'ads' ? (
              filteredAds.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">
                  No ads found
                </div>
              ) : (
                filteredAds.map((ad) => <AdRow key={ad.id} ad={ad} />)
              )
            ) : filteredCampaigns.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">
                No campaigns found
              </div>
            ) : displayGrouping === 'groups' ? (
              ruleGroups.map((group) => {
                const groupCampaigns = filteredCampaigns.filter((c) => c.groupId === group.id);
                if (groupCampaigns.length === 0) return null;
                return (
                  <div key={group.id}>
                    {/* Linear-style Group Header */}
                    {(() => {
                      const colors = GEO_GROUP_COLORS[group.id] ?? DEFAULT_GROUP_COLOR;
                      const isCollapsed = collapsedGroups.includes(group.id);
                      return (
                        <>
                          <CampaignGroupHeader
                            groupId={group.id}
                            groupName={group.name}
                            count={groupCampaigns.length}
                            dotColor={colors.dotColor}
                            accentLch={colors.accentLch}
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
          </div>

          {/* Footer Filter Notification Banner */}
          {selectedFilterGroupId && hiddenCount > 0 && (
            <div className="mt-4 flex items-center justify-center gap-4 py-4 text-[12px] text-[#959496]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#fefeff]">{hiddenCount}</span>
                <span>more hidden by filters</span>
                <button
                  type="button"
                  onClick={() => setSelectedFilterGroupId(null)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium text-[#e3e5e7] hover:bg-[#222225] transition-colors"
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

        {/* Right: Linear Right Context Sidebar (Groups Filter Panel) */}
        <CampaignRightSidebar />
      </div>
    </div>
  );
};
