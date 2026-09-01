import React, { useState, useRef } from 'react';
import { CampaignItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearLabelPill } from '@/ui/LinearLabelPill';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { LabelSelectorPopover } from './LabelSelectorPopover';
import { RuleSelectorPopover } from './RuleSelectorPopover';
import { LinearBoltIcon } from '@/icons/LinearIcons';
import { getAdsManagerColumns } from './tableColumns';

interface CampaignRowProps {
  campaign: CampaignItem;
}

export const CampaignRow: React.FC<CampaignRowProps> = ({ campaign }) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
    toggleCampaignDelivery,
    campaignAttachedRules,
    setFocusedCampaignId,
    displayProperties,
    campaignGroups,
  } = useAppStore();

  const [isLabelSelectorOpen, setIsLabelSelectorOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const groupColumnRef = useRef<HTMLDivElement>(null);

  const [isRuleSelectorOpen, setIsRuleSelectorOpen] = useState(false);
  const [ruleAnchorRect, setRuleAnchorRect] = useState<DOMRect | null>(null);
  const rulesColumnRef = useRef<HTMLDivElement>(null);

  const isSelected = selectedCampaignIds.includes(campaign.id);
  const isDeliveryOn = campaign.status !== 'paused';
  const isPositiveRoi = campaign.roi.startsWith('+');
  const attachedCount = (campaignAttachedRules[campaign.id] || []).length;
  const hasRules = attachedCount > 0;
  const assignedGroups = campaignGroups.filter((group) =>
    campaign.groupIds.includes(group.id)
  );
  const columns = getAdsManagerColumns('campaigns', displayProperties);

  const handleRowClick = () => {
    setFocusedCampaignId(campaign.id);
  };

  const openLabelSelector = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      setAnchorRect(e.currentTarget.getBoundingClientRect());
    } else if (groupColumnRef.current) {
      setAnchorRect(groupColumnRef.current.getBoundingClientRect());
    }
    setIsLabelSelectorOpen(true);
  };

  const openRuleSelector = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      setFocusedCampaignId(campaign.id);
      setRuleAnchorRect(e.currentTarget.getBoundingClientRect());
    } else if (rulesColumnRef.current) {
      setFocusedCampaignId(campaign.id);
      setRuleAnchorRect(rulesColumnRef.current.getBoundingClientRect());
    }
    setIsRuleSelectorOpen(true);
  };

  return (
    <>
      <LinearDataListRow
        layout="grid"
        columns={columns}
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFocusedCampaignId(campaign.id);
          } else if (e.key === 'x' || e.key === 'X') {
            e.preventDefault();
            toggleCampaignSelection(campaign.id);
          } else if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            openLabelSelector();
          } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            openRuleSelector();
          }
        }}
        selected={isSelected}
        className="campaign-data-row cursor-pointer"
      >
        <div className="flex min-w-0 items-center gap-3">
          <LinearCheckbox checked={isSelected} onChange={() => toggleCampaignSelection(campaign.id)} />
          {displayProperties.status !== false && (
            <LinearToggle
              checked={isDeliveryOn}
              onChange={() => toggleCampaignDelivery(campaign.id)}
              tooltipContent={isDeliveryOn ? 'Pause campaign' : 'Resume campaign'}
            />
          )}
          <span
            className="truncate text-[13px] font-medium"
            style={{ color: isDeliveryOn ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            {campaign.name}
          </span>
        </div>

        {displayProperties.budget !== false && (
          <div className="truncate text-right text-[12px] font-[450] text-[var(--text-secondary)]">{campaign.budget}</div>
        )}

        {(displayProperties.results !== false || displayProperties.cpa !== false) && (
          <div className="flex min-w-0 items-center justify-end gap-1 truncate whitespace-nowrap text-[12px] font-[450]">
            {displayProperties.results !== false && <span>{campaign.leadsCount} leads</span>}
            {displayProperties.cpa !== false && <span className="text-[var(--text-tertiary)]">({campaign.cpa})</span>}
          </div>
        )}

        {displayProperties.spend !== false && (
          <div className="truncate text-right text-[12px] font-[450] text-[var(--text-secondary)]">{campaign.spend}</div>
        )}

        {displayProperties.roi !== false && (
          <div className={`truncate text-right text-[12px] font-semibold ${isDeliveryOn ? isPositiveRoi ? 'text-emerald-500' : 'text-rose-500' : 'text-[var(--text-muted)]'}`}>
            {campaign.roi}
          </div>
        )}

        {displayProperties.rules !== false && (
          <div ref={rulesColumnRef} className="flex min-w-0 items-center">
            {hasRules ? (
              <button
                type="button"
                onClick={openRuleSelector}
                style={{
                  height: '22px',
                  padding: '0 8px',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--item-hover-bg)',
                  border: '1px solid var(--color-border-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'border-color 0.15s, background-color 0.15s',
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
                    color: 'var(--text-primary)',
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
                onClick={openRuleSelector}
                style={{
                  height: '22px',
                  padding: '0 8px',
                  borderRadius: '9999px',
                  backgroundColor: 'transparent',
                  border: '1px dashed var(--color-border-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'opacity 0.15s, border-color 0.15s, background-color 0.15s, color 0.15s',
                }}
                className="opacity-0 group-hover/row:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--color-border-secondary)] hover:bg-[var(--item-hover-bg)]"
                title="Add rule (R)"
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
        )}

        {displayProperties.group && (
          <div
            ref={groupColumnRef}
            className="flex min-w-0 items-center gap-1 overflow-hidden"
          >
            {assignedGroups.length > 0 ? (
              assignedGroups.map((group) => (
                <LinearLabelPill
                  key={group.id}
                  label={group.name}
                  dotColor={group.color}
                  onClick={openLabelSelector}
                />
              ))
            ) : (
              <button
                type="button"
                onClick={openLabelSelector}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '9999px',
                  backgroundColor: 'transparent',
                  border: '1px dashed var(--color-border-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  outline: 'none',
                  transition:
                    'opacity 0.15s, border-color 0.15s, background-color 0.15s, color 0.15s',
                }}
                className="opacity-0 group-hover/row:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--color-border-secondary)] hover:bg-[var(--item-hover-bg)]"
                title="Add group (L)"
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
              </button>
            )}
          </div>
        )}

        {displayProperties.created && (
          <div className="truncate text-right text-[12px] text-[var(--text-tertiary)]">{campaign.date}</div>
        )}
      </LinearDataListRow>

      <LabelSelectorPopover
        isOpen={isLabelSelectorOpen}
        onClose={() => setIsLabelSelectorOpen(false)}
        anchorRect={anchorRect}
        campaignId={campaign.id}
        selectedGroupIds={campaign.groupIds}
      />

      <RuleSelectorPopover
        isOpen={isRuleSelectorOpen}
        onClose={() => setIsRuleSelectorOpen(false)}
        anchorRect={ruleAnchorRect}
        campaignId={campaign.id}
      />
    </>
  );
};
