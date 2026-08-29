import React from 'react';
import { CampaignItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';

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
  } = useAppStore();

  const isSelected = selectedCampaignIds.includes(campaign.id);
  const isDeliveryOn = campaign.status !== 'paused';
  const isPositiveRoi = campaign.roi.startsWith('+');
  const attachedCount = (campaignAttachedRules[campaign.id] || []).length;
  const hasRules = attachedCount > 0;


  const handleRowClick = () => {
    toggleCampaignSelection(campaign.id);
  };

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          toggleCampaignSelection(campaign.id);
        }
      }}
      data-selected={isSelected ? 'true' : 'false'}
      style={{
        height: '44px',
        display: 'grid',
        gridTemplateColumns:
          '8px 18px 32px 1fr minmax(90px, auto) minmax(145px, auto) minmax(95px, auto) minmax(85px, auto) 18px',
        columnGap: '12px',
        alignItems: 'center',
        borderRadius: '8px',
        backgroundColor: isSelected
          ? 'rgba(234, 179, 8, 0.09)'
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

      {/* 4. Campaign Title + Rules Badge */}
      <div className="flex items-center gap-2 min-w-0 pr-2">
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
        {/* Rules Badge */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isRightSidebarOpen) {
              toggleRightSidebar();
            }
            setActiveRightSidebarTab('rules');
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            height: '18px',
            padding: '0 6px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            fontFamily: '"Inter Variable", "SF Pro Display", -apple-system, sans-serif',
            fontSize: '11px',
            fontWeight: 500,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            background: hasRules ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.05)',
            color: hasRules ? '#eab308' : '#94969b',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background = hasRules ? 'rgba(234, 179, 8, 0.22)' : 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = hasRules ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.05)';
          }}
        >
          {hasRules ? (
            <>⚡ {attachedCount} {attachedCount === 1 ? 'rule' : 'rules'}</>
          ) : (
            <>+ Rule</>
          )}
        </button>
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

      {/* 9. End padding spacer */}
      <div />
    </div>
  );
};
