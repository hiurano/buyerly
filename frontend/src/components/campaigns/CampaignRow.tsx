import React, { useState, useRef } from 'react';
import { CampaignItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearLabelPill } from '@/ui/LinearLabelPill';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { LabelSelectorPopover } from './LabelSelectorPopover';
import { RuleAttachmentCell } from './RuleAttachmentCell';
import type { RuleAttachmentCellHandle } from './RuleAttachmentCell';
import { getAdsManagerColumns } from './tableColumns';

interface CampaignRowProps {
  campaign: CampaignItem;
  readOnly?: boolean;
  properties?: Record<string, boolean>;
  showIdentifier?: boolean;
}

export const CampaignRow: React.FC<CampaignRowProps> = ({
  campaign,
  readOnly = false,
  properties,
  showIdentifier = false,
}) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
    toggleCampaignDelivery,
    campaignAttachedRules,
    setFocusedCampaignId,
    displayProperties: storedDisplayProperties,
    campaignGroups,
  } = useAppStore();

  const [isLabelSelectorOpen, setIsLabelSelectorOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const groupColumnRef = useRef<HTMLDivElement>(null);
  const ruleCellRef = useRef<RuleAttachmentCellHandle>(null);

  const isSelected = !readOnly && selectedCampaignIds.includes(campaign.id);
  const isDeliveryKnown = campaign.status !== 'unknown';
  const isDeliveryOn = campaign.status === 'active';
  const displayProperties = properties ?? storedDisplayProperties;
  const isPositiveRoi = campaign.roi.startsWith('+');
  const attachedCount = (campaignAttachedRules[campaign.id] || []).length;
  const hasRules = attachedCount > 0;
  const assignedGroups = campaignGroups.filter((group) =>
    campaign.groupIds.includes(group.id)
  );
  const columns = getAdsManagerColumns('campaigns', displayProperties);

  const handleRowClick = () => {
    if (readOnly) return;
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

  return (
    <>
      <LinearDataListRow
        layout="grid"
        columns={columns}
        tabIndex={readOnly ? undefined : 0}
        onClick={readOnly ? undefined : handleRowClick}
        onKeyDown={readOnly ? undefined : (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFocusedCampaignId(campaign.id);
          } else if (e.key === 'x' || e.key === 'X') {
            e.preventDefault();
            toggleCampaignSelection(campaign.id);
          } else if (!readOnly && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            openLabelSelector();
          } else if (!readOnly && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            ruleCellRef.current?.open();
          }
        }}
        selected={isSelected}
        className={`campaign-data-row ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* Keep the selection slot so read-only rows retain the established Name alignment. */}
          {readOnly ? (
            <LinearCheckbox checked={false} hidden />
          ) : (
            <LinearCheckbox
              checked={isSelected}
              onChange={() => toggleCampaignSelection(campaign.id)}
            />
          )}
          {displayProperties.status !== false && (
            !isDeliveryKnown ? (
              <span
                className="inline-flex h-5 w-8 items-center justify-center text-[12px] text-[var(--text-muted)]"
                title="Delivery status is not available in this snapshot"
                aria-label="Delivery status unavailable"
              >
                —
              </span>
            ) : (
              <LinearToggle
                checked={isDeliveryOn}
                onChange={readOnly ? undefined : () => toggleCampaignDelivery(campaign.id)}
                disabled={readOnly}
                tooltipContent={readOnly
                  ? `${campaign.statusLabel}. Campaign controls are not connected yet`
                  : isDeliveryOn ? 'Pause campaign' : 'Resume campaign'}
              />
            )
          )}
          <span className="flex min-w-0 flex-col" title={`${campaign.name} · ${campaign.identifier}`}>
            <span
              className="truncate text-[13px] font-medium"
              style={{ color: isDeliveryKnown && !isDeliveryOn ? 'var(--text-tertiary)' : 'var(--text-primary)' }}
            >
              {campaign.name}
            </span>
            {showIdentifier && (
              <span className="truncate font-mono text-[10px] leading-3 text-[var(--text-muted)]">
                {campaign.identifier}
              </span>
            )}
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
          <RuleAttachmentCell
            ref={ruleCellRef}
            level="campaign"
            entityId={campaign.id}
            attachedRuleIds={campaignAttachedRules[campaign.id] || []}
            onOpen={() => setFocusedCampaignId(campaign.id)}
          />
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

    </>
  );
};
