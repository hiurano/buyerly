import React, { useState, useRef } from 'react';
import { CampaignItem, useAppStore } from '@/store/useAppStore';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyDataListRow, BuyerlyDataPrimaryCell, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { EntityPropertyCell, EntityRowControls } from './EntityRowCells';
import { LabelSelectorPopover } from './LabelSelectorPopover';
import { RuleAttachmentCell } from './RuleAttachmentCell';
import type { RuleAttachmentCellHandle } from './RuleAttachmentCell';

interface CampaignRowProps {
  campaign: CampaignItem;
  readOnly?: boolean;
  /** Rows can be selected for bulk actions. */
  selectable?: boolean;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  properties: Record<string, boolean>;
  /** The table's columns, so every row lines up with the header. */
  columns: BuyerlyDataListColumn[];
}

export const CampaignRow: React.FC<CampaignRowProps> = ({
  campaign,
  readOnly = false,
  selectable = false,
  delivery,
  properties,
  columns,
}) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
    campaignAttachedRules,
    setFocusedCampaignId,
  } = useAppStore();

  const [isLabelSelectorOpen, setIsLabelSelectorOpen] = useState(false);
  const ruleCellRef = useRef<RuleAttachmentCellHandle>(null);

  const isSelected = selectable && selectedCampaignIds.includes(campaign.id);
  const isDeliveryKnown = campaign.status !== 'unknown';
  const isDeliveryOn = campaign.status === 'active';
  const displayProperties = properties;

  const handleRowClick = () => {
    if (readOnly) return;
    setFocusedCampaignId(campaign.id);
  };

  const openLabelSelector = () => setIsLabelSelectorOpen(true);

  return (
    <>
      <BuyerlyDataListRow
        data-row-id={campaign.id}
        layout="grid"
        columns={columns}
        tabIndex={readOnly ? undefined : 0}
        onClick={readOnly ? undefined : handleRowClick}
        onKeyDown={readOnly ? undefined : (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFocusedCampaignId(campaign.id);
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
        <BuyerlyDataPrimaryCell
          leading={(
            <EntityRowControls
              noun="campaign"
              status={campaign.status}
              statusLabel={campaign.statusLabel}
              delivery={delivery}
              showStatus={displayProperties.status !== false}
              selectable={selectable}
              selected={isSelected}
              onToggleSelected={() => toggleCampaignSelection(campaign.id)}
            />
          )}
          title={campaign.name}
          dimmed={isDeliveryKnown && !isDeliveryOn}
          hint={`${campaign.name} · ${campaign.identifier}`}
        />

        {columns.slice(1).map((column) => (column.id === 'rules' ? (
          <RuleAttachmentCell
            key={column.id}
            ref={ruleCellRef}
            accountId={campaign.accountId ?? ''}
            level="campaign"
            entityId={campaign.id}
            attachedRuleIds={campaignAttachedRules[campaign.id] || []}
            onOpen={() => setFocusedCampaignId(campaign.id)}
          />
        ) : (
          <EntityPropertyCell key={column.id} columnId={column.id} row={campaign} />
        )))}
      </BuyerlyDataListRow>

      <LabelSelectorPopover
        isOpen={isLabelSelectorOpen}
        onClose={() => setIsLabelSelectorOpen(false)}
        anchorRect={null}
        campaignId={campaign.id}
        selectedGroupIds={campaign.groupIds}
      />

    </>
  );
};
