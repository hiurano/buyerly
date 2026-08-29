import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { CampaignRow } from './CampaignRow';
import { CampaignDetailsDrawer } from './CampaignDetailsDrawer';
import { Tooltip } from '@/ui/Tooltip';
import {
  LinearFilterIcon,
  LinearSlidersIcon,
} from '@/icons/LinearIcons';

export const CampaignsView: React.FC = () => {
  const {
    campaigns,
    campaignFilterTab,
    setCampaignFilterTab,
    activeDetailsCampaignId,
  } = useAppStore();


  const filteredCampaigns = campaigns.filter((c) => {
    if (campaignFilterTab === 'all') return true;
    return c.status === campaignFilterTab;
  });

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-transparent" style={{ flexDirection: 'row' }}>
      {/* Main Campaign List */}
      <div className="flex flex-1 flex-col overflow-hidden">
      {/* 1. Header (Stacked 2 Tiers = 87px total) */}
      <header className="flex shrink-0 flex-col border-b border-[#18191b] px-4 pt-1">
        {/* Tier 1: Title (44px) */}
        <div className="flex h-[44px] items-center justify-between">
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

        {/* Tier 2: View Filter Tabs & Action Buttons (43px) */}
        <div className="flex h-[43px] items-center justify-between pb-1">
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

          {/* Right: Add filter + Display options (28x28px circular buttons) */}
          <div className="flex items-center gap-1.5">
            <Tooltip content="Add filter" shortcut="F">
              <button
                type="button"
                aria-label="Add filter"
                className="linear-icon-btn"
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
                className="linear-icon-btn"
              >
                <span className="flex h-[14px] w-[14px] items-center justify-center">
                  <LinearSlidersIcon size={14} />
                </span>
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* 2. Campaign List & Sticky Groups Scroll Container */}
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
      </div>

      {/* Right Details Drawer (slides in when campaign is selected) */}
      {activeDetailsCampaignId && <CampaignDetailsDrawer />}
    </div>
  );
};
