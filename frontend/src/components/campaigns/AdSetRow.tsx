import React from 'react';
import { AdSetItem, useAppStore } from '@/store/useAppStore';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyDataListRow, BuyerlyDataPrimaryCell, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { EntityPropertyCell, EntityRowControls } from './EntityRowCells';
import { RuleAttachmentCell } from './RuleAttachmentCell';

interface AdSetRowProps {
  adSet: AdSetItem;
  readOnly?: boolean;
  /** Rows can be selected for bulk actions. */
  selectable?: boolean;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  properties: Record<string, boolean>;
  /** The table's columns, so every row lines up with the header. */
  columns: BuyerlyDataListColumn[];
}

export const AdSetRow: React.FC<AdSetRowProps> = ({ adSet, readOnly = false, selectable = false, delivery, properties, columns }) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
    adSetAttachedRules,
  } = useAppStore();

  const displayProperties = properties;
  const isSelected = selectable && selectedCampaignIds.includes(adSet.id);
  const isDeliveryKnown = adSet.status !== 'unknown';
  const isDeliveryOn = adSet.status === 'active';

  return (
    <BuyerlyDataListRow
      data-row-id={adSet.id}
      layout="grid"
      columns={columns}
      tabIndex={readOnly ? undefined : 0}
      selected={isSelected}
      className={`adset-data-row ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <BuyerlyDataPrimaryCell
        leading={(
          <EntityRowControls
            noun="ad set"
            status={adSet.status}
            statusLabel={adSet.statusLabel}
            delivery={delivery}
            showStatus={displayProperties.status !== false}
            selectable={selectable}
            selected={isSelected}
            onToggleSelected={() => toggleCampaignSelection(adSet.id)}
          />
        )}
        title={adSet.name}
        dimmed={isDeliveryKnown && !isDeliveryOn}
        hint={`${adSet.name} · ${adSet.identifier}`}
      />

      {columns.slice(1).map((column) => (column.id === 'rules' ? (
        <RuleAttachmentCell
          key={column.id}
          accountId={adSet.accountId ?? ''}
          level="adset"
          entityId={adSet.id}
          attachedRuleIds={adSetAttachedRules[adSet.id] || []}
          campaignId={adSet.campaignId}
        />
      ) : (
        <EntityPropertyCell key={column.id} columnId={column.id} row={adSet} />
      )))}
    </BuyerlyDataListRow>
  );
};
