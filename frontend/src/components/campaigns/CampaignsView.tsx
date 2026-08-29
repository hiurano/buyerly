import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { CampaignRow } from './CampaignRow';
import { CampaignRightSidebar } from './CampaignRightSidebar';
import { Tooltip } from '@/ui/Tooltip';
import {
  LinearFilterIcon,
  LinearSlidersIcon,
  LinearSidebarToggleIcon,
} from '@/icons/LinearIcons';

export const CampaignsView: React.FC = () => {
  const {
    campaigns,
    campaignFilterTab,
    setCampaignFilterTab,
    isRightSidebarOpen,
    toggleRightSidebar,
    selectedFilterRuleId,
    selectedFilterPlatform,
    campaignAttachedRules,
  } = useAppStore();

  const filteredCampaigns = campaigns.filter((c) => {
    // 1. Status tab filter
    if (campaignFilterTab !== 'all' && c.status !== campaignFilterTab) {
      return false;
    }
    // 2. Rule filter (if a rule is selected in the right sidebar)
    if (selectedFilterRuleId) {
      const attached = campaignAttachedRules[c.id] || [];
      if (!attached.includes(selectedFilterRuleId)) return false;
    }
    // 3. Platform filter (if a platform is selected in the right sidebar)
    if (selectedFilterPlatform && c.platform !== selectedFilterPlatform) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      {/* 1. Header (Stacked 2 Tiers = 87px total) - Spans full width across canvas */}
      <header className="flex shrink-0 flex-col">
        {/* Tier 1: Title (44px) with border-bottom */}
        <div
          style={{
            borderBottom: '1px solid lch(9.84 1.48 272)',
            padding: '0px 10px 0px 8px',
          }}
          className="flex h-[44px] items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'lch(90.451% 1.2 272 / 1)',
              }}
            >
              Campaigns
            </h2>
          </div>
        </div>

        {/* Tier 2: View Filter Tabs & Action Buttons (43px) - No border bottom */}
        <div
          style={{
            padding: '0px 10px 0px 8px',
          }}
          className="flex h-[43px] items-center justify-between"
        >
          {/* Left: View Tabs (Pills 28px, border-radius: 9999px) */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All campaigns' },
              { id: 'active', label: 'Active' },
              { id: 'paused', label: 'Paused' },
            ].map((tab) => {
              const isActive = campaignFilterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setCampaignFilterTab(tab.id as 'active' | 'paused' | 'all')
                  }
                  style={{
                    height: '28px',
                    borderRadius: '9999px',
                    padding: '0px 10px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: isActive
                      ? 'lch(16.706% 0.979 272 / 1)'
                      : 'transparent',
                    color: isActive
                      ? 'lch(100% 0 272 / 1)'
                      : 'lch(61.803% 1.2 272 / 1)',
                  }}
                  className="transition-colors duration-100 hover:bg-[#1a1b1d] hover:text-white outline-none"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right: Add filter + Display options + Toggle Sidebar */}
          <div className="flex items-center gap-1.5">
            <Tooltip content="Add filter" shortcut="F">
              <button
                type="button"
                aria-label="Add filter"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '9999px',
                  backgroundColor: 'lch(10.149 0.689 272)',
                  border: '1px solid transparent',
                  color: 'lch(61.803% 1.2 272 / 1)',
                }}
                className="flex items-center justify-center transition-colors duration-100 hover:bg-[#1a1b1d] hover:text-white outline-none"
              >
                <span className="flex h-[14px] w-[14px] items-center justify-center">
                  <LinearFilterIcon size={14} />
                </span>
              </button>
            </Tooltip>

            <Tooltip content="Display options" shortcut="D">
              <button
                type="button"
                aria-label="Display options"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '9999px',
                  backgroundColor: 'lch(10.149 0.689 272)',
                  border: '1px solid transparent',
                  color: 'lch(61.803% 1.2 272 / 1)',
                }}
                className="flex items-center justify-center transition-colors duration-100 hover:bg-[#1a1b1d] hover:text-white outline-none"
              >
                <span className="flex h-[14px] w-[14px] items-center justify-center">
                  <LinearSlidersIcon size={14} />
                </span>
              </button>
            </Tooltip>

            <Tooltip content={isRightSidebarOpen ? 'Close details' : 'Open details'} shortcut="⌥I">
              <button
                type="button"
                aria-label={isRightSidebarOpen ? 'Close details' : 'Open details'}
                aria-expanded={isRightSidebarOpen}
                onClick={toggleRightSidebar}
                data-state={isRightSidebarOpen ? 'active' : 'inactive'}
                data-active={isRightSidebarOpen ? 'true' : undefined}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '9999px',
                  border: '1px solid transparent',
                  backgroundColor: isRightSidebarOpen ? 'lch(18.634 1.075 272)' : 'transparent',
                  color: isRightSidebarOpen ? 'lch(100 0 272)' : 'lch(61.803% 1.2 272 / 1)',
                  transition: 'border 0.15s ease, background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                }}
                className="flex items-center justify-center outline-none hover:bg-[lch(18.634_1.075_272)] hover:text-white"
              >
                <span className="flex h-[14px] w-[14px] items-center justify-center">
                  <LinearSidebarToggleIcon size={16} isOpen={isRightSidebarOpen} />
                </span>
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* 2. Main Content Area below Header (Split: List on Left, Right Sidebar on Right) */}
      <div className="flex flex-1 overflow-hidden" style={{ flexDirection: 'row' }}>
        {/* Left: Campaign List & Sticky Groups Scroll Container */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Sticky Group Header (36px, #161719) */}
          <div
            style={{
              height: '36px',
              backgroundColor: 'lch(9.232% 0.85 272 / 1)',
              borderRadius: '6px',
            }}
            className="sticky top-0 z-10 mb-1 flex items-center justify-between px-3 text-[13px] font-[500] text-[#e4e5e8]"
          >
            <div className="flex items-center gap-2">
              <span className="capitalize">
                {campaignFilterTab === 'all' ? 'All campaigns' : campaignFilterTab}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'lch(61.803% 1.2 272 / 1)',
                  backgroundColor: 'lch(10.149% 0.689 272 / 1)',
                  borderRadius: '9999px',
                  padding: '1px 6px',
                }}
              >
                {filteredCampaigns.length}
              </span>
            </div>
          </div>

          {/* Campaign Rows */}
          <div className="space-y-0.5">
            {filteredCampaigns.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[13px] text-[#6b6f76]">
                No campaigns found
              </div>
            ) : (
              filteredCampaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))
            )}
          </div>
        </div>

        {/* Right: Linear Right Context Sidebar (Labels / Priority / Projects) */}
        <CampaignRightSidebar />
      </div>
    </div>
  );
};


