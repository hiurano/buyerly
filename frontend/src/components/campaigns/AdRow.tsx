import React from 'react';
import { AdItem, useAppStore } from '@/store/useAppStore';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyDataListRow, BuyerlyDataPrimaryCell, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { EntityPropertyCell, EntityRowControls } from './EntityRowCells';

interface AdRowProps {
  ad: AdItem;
  readOnly?: boolean;
  /** Rows can be selected for bulk actions. */
  selectable?: boolean;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  properties: Record<string, boolean>;
  /** The table's columns, so every row lines up with the header. */
  columns: BuyerlyDataListColumn[];
}

export const AdRow: React.FC<AdRowProps> = ({ ad, readOnly = false, selectable = false, delivery, properties, columns }) => {
  const { selectedCampaignIds, toggleCampaignSelection } = useAppStore();

  const displayProperties = properties;
  const isSelected = selectable && selectedCampaignIds.includes(ad.id);
  const isDeliveryKnown = ad.status !== 'unknown';
  const isDeliveryOn = ad.status === 'active';

  return (
    <BuyerlyDataListRow
      data-row-id={ad.id}
      layout="grid"
      columns={columns}
      tabIndex={readOnly ? undefined : 0}
      selected={isSelected}
      className={`ad-data-row ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <BuyerlyDataPrimaryCell
        leading={(
          <EntityRowControls
            noun="ad"
            status={ad.status}
            statusLabel={ad.statusLabel}
            delivery={delivery}
            showStatus={displayProperties.status !== false}
            selectable={selectable}
            selected={isSelected}
            onToggleSelected={() => toggleCampaignSelection(ad.id)}
          />
        )}
        title={ad.name}
        dimmed={isDeliveryKnown && !isDeliveryOn}
        hint={`${ad.name} · ${ad.identifier}`}
      />

      {columns.slice(1).map((column) => (
        <EntityPropertyCell key={column.id} columnId={column.id} row={ad} />
      ))}
    </BuyerlyDataListRow>
  );
};
