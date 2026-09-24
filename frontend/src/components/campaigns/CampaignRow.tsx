import React, { useState, useRef } from 'react';
import { CampaignItem, useAppStore } from '@/store/useAppStore';
import type { DeliveryControl } from '@/lib/delivery';
import { LinearLabelPill } from '@/ui/LinearLabelPill';
import { LinearDataListRow, LinearDataMetricCell, LinearDataPrimaryCell } from '@/ui/LinearDataList';
import { EntityRowControls, ResultsCpaCell } from './EntityRowCells';
import { LabelSelectorPopover } from './LabelSelectorPopover';
import { RuleAttachmentCell } from './RuleAttachmentCell';
import type { RuleAttachmentCellHandle } from './RuleAttachmentCell';
import { getAdsManagerColumns } from './tableColumns';

interface CampaignRowProps {
  campaign: CampaignItem;
  readOnly?: boolean;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  properties?: Record<string, boolean>;
  showIdentifier?: boolean;
}

export const CampaignRow: React.FC<CampaignRowProps> = ({
  campaign,
  readOnly = false,
  delivery,
  properties,
  showIdentifier = false,
}) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
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
        <LinearDataPrimaryCell
          leading={(
            <EntityRowControls
              noun="campaign"
              status={campaign.status}
              statusLabel={campaign.statusLabel}
              delivery={delivery}
              showStatus={displayProperties.status !== false}
              readOnly={readOnly}
              selected={isSelected}
              onToggleSelected={() => toggleCampaignSelection(campaign.id)}
            />
          )}
          title={campaign.name}
          subtitle={showIdentifier ? <span className="truncate font-mono">{campaign.identifier}</span> : undefined}
          dimmed={isDeliveryKnown && !isDeliveryOn}
          hint={`${campaign.name} · ${campaign.identifier}`}
        />

        {displayProperties.budget !== false && <LinearDataMetricCell value={campaign.budget} />}

        {(displayProperties.results !== false || displayProperties.cpa !== false) && (
          <ResultsCpaCell
            leadsCount={campaign.leadsCount}
            cpa={campaign.cpa}
            showResults={displayProperties.results !== false}
            showCpa={displayProperties.cpa !== false}
          />
        )}

        {displayProperties.spend !== false && <LinearDataMetricCell value={campaign.spend} />}

        {displayProperties.roi !== false && (
          <LinearDataMetricCell
            value={campaign.roi}
            valueClassName={`font-semibold ${isDeliveryOn ? isPositiveRoi ? 'text-emerald-500' : 'text-rose-500' : 'text-[var(--text-muted)]'}`}
          />
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
          <LinearDataMetricCell value={campaign.date} valueClassName="text-[var(--text-tertiary)]" />
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
