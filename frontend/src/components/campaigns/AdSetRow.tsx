import React from 'react';
import * as stylex from '@stylexjs/stylex';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyDataListRow, BuyerlyDataPrimaryCell, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { EntityPropertyCell, EntityRowControls } from './EntityRowCells';
import { RuleAttachmentCell } from './RuleAttachmentCell';
import { useRulesStore, AdSetItem } from '@/models/rulesStore';
import { useSelectionStore } from '@/models/selectionStore';

const styles = stylex.create({
  row: {
    cursor: 'pointer',
  },
  readOnly: {
    cursor: 'default',
  },
});

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
  const selectedCampaignIds = useSelectionStore((state) => state.selectedCampaignIds);
  const toggleCampaignSelection = useSelectionStore((state) => state.toggleCampaignSelection);
  const adSetAttachedRules = useRulesStore((state) => state.adSetAttachedRules);

  const displayProperties = properties;
  const isSelected = selectable && selectedCampaignIds.includes(adSet.id);

  return (
    <BuyerlyDataListRow
      data-row-id={adSet.id}
      layout="grid"
      columns={columns}
      tabIndex={readOnly ? undefined : 0}
      selected={isSelected}
      className="adset-data-row"
      xstyle={readOnly ? styles.readOnly : styles.row}
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
