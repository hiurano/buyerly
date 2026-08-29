import React from 'react';
import { CampaignItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearBoltIcon } from '@/icons/LinearIcons';

interface CampaignRowProps {
  campaign: CampaignItem;
}

export const CampaignRow: React.FC<CampaignRowProps> = ({ campaign }) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
    toggleCampaignDelivery,
    isRightSidebarOpen,
    toggleRightSidebar,
    setActiveRightSidebarTab,
    campaignAttachedRules,
    focusedCampaignId,
    setFocusedCampaignId,
  } = useAppStore();

  const isSelected = selectedCampaignIds.includes(campaign.id);
  const isFocused = focusedCampaignId === campaign.id;
  const isDeliveryOn = campaign.status !== 'paused';
  const isPositiveRoi = campaign.roi.startsWith('+');
  const attachedCount = (campaignAttachedRules[campaign.id] || []).length;
  const hasRules = attachedCount > 0;

  const handleRowClick = () => {
    setFocusedCampaignId(campaign.id);
  };

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFocusedCampaignId(campaign.id);
        } else if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          toggleCampaignSelection(campaign.id);
        }
      }}
      data-selected={isSelected ? 'true' : 'false'}
      data-focused={isFocused ? 'true' : 'false'}
      style={{
        height: '44px',
        display: 'grid',
        gridTemplateColumns:
          '8px 18px 32px 1fr minmax(80px, auto) minmax(135px, auto) minmax(90px, auto) minmax(80px, auto) minmax(85px, auto) 18px',
        columnGap: '12px',
        alignItems: 'center',
        borderRadius: '8px',
        backgroundColor: isSelected
          ? 'rgba(234, 179, 8, 0.09)'
          : isFocused
          ? 'rgba(255, 255, 255, 0.04)'
          : 'transparent',
      }}
      className="group/row relative cursor-pointer select-none px-2 transition-colors duration-100 hover:bg-white/[0.05] outline-none"
    >
      {/* 1. Indent spacer */}
      <div />

      {/* 2. Exact Linear Checkbox with Row Hover Visibility & Yellow Accent */}
      <div className="flex items-center justify-center">
        <LinearCheckbox
          checked={isSelected}
          onChange={() => toggleCampaignSelection(campaign.id)}
        />
      </div>

      {/* 3. Linear Delivery Switch (On / Off) */}
      <div className="flex items-center justify-center">
        <LinearToggle
          checked={isDeliveryOn}
          onChange={() => toggleCampaignDelivery(campaign.id)}
          tooltipContent={isDeliveryOn ? 'Pause campaign' : 'Resume campaign'}
        />
      </div>

      {/* 4. Campaign Title (Clean, unconstrained, free of badge clutter) */}
      <div className="flex items-center min-w-0 pr-2">
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: isDeliveryOn ? '#ffffff' : 'lch(61.803% 1.2 272 / 1)',
          }}
          className="truncate"
        >
          {campaign.name}
        </span>
      </div>

      {/* 5. Budget ($500/day) */}
      <div className="flex items-center whitespace-nowrap text-[12px] font-medium text-[#94969b]">
        <span>{campaign.budget}</span>
      </div>

      {/* 6. Leads & CPA (142 leads ($8.70)) */}
      <div className="flex items-center gap-1 whitespace-nowrap text-[12px] font-medium">
        <span className={isDeliveryOn ? 'text-white' : 'text-[#94969b]'}>
          {campaign.leadsCount} leads
        </span>
        <span className="text-[#94969b]">({campaign.cpa})</span>
      </div>

      {/* 7. Spend ($1,240 spend) */}
      <div className="flex items-center whitespace-nowrap text-[12px] font-medium text-[#94969b]">
        <span>{campaign.spend}</span>
      </div>

      {/* 8. ROI (+142% ROI) */}
      <div className="flex items-center whitespace-nowrap text-[12px] font-medium">
        <span
          className={
            isDeliveryOn
              ? isPositiveRoi
                ? 'text-emerald-400 font-semibold'
                : 'text-rose-400 font-semibold'
              : 'text-[#6b6f76]'
          }
        >
          {campaign.roi}
        </span>
      </div>

      {/* 9. Dedicated Rules Badge Column (Linear Badge Pill Shape & Physics) */}
      <div className="flex items-center justify-start">
        {hasRules ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFocusedCampaignId(campaign.id);
              if (!isRightSidebarOpen) {
                toggleRightSidebar();
              }
              setActiveRightSidebarTab('rules');
            }}
            style={{
              height: '22px',
              padding: '0 8px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
            }}
          >
            <div className="flex h-3.5 w-3.5 items-center justify-center flex-shrink-0">
              <LinearBoltIcon size={12} className="text-[#eab308]" />
            </div>
            <span
              style={{
                fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                fontSize: '12px',
                fontWeight: 500,
                color: '#e4e5e8',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {attachedCount} {attachedCount === 1 ? 'rule' : 'rules'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFocusedCampaignId(campaign.id);
              if (!isRightSidebarOpen) {
                toggleRightSidebar();
              }
              setActiveRightSidebarTab('rules');
            }}
            style={{
              height: '22px',
              padding: '0 8px',
              borderRadius: '9999px',
              backgroundColor: 'transparent',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'opacity 0.15s, border-color 0.15s, background-color 0.15s, color 0.15s',
            }}
            className="opacity-0 group-hover/row:opacity-100 text-[#8c8f95] hover:text-white hover:border-white/30 hover:bg-white/[0.04]"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            >
              <line x1="5" y1="2" x2="5" y2="8" />
              <line x1="2" y1="5" x2="8" y2="5" />
            </svg>
            <span
              style={{
                fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              Rule
            </span>
          </button>
        )}
      </div>

      {/* 10. End Spacer */}
      <div />
    </div>
  );
};
