import React from 'react';
import { AdSetItem, useAppStore } from '@/store/useAppStore';
import type { DeliveryControl } from '@/lib/delivery';
import { LinearDataListRow, LinearDataMetricCell, LinearDataPrimaryCell } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';
import { EntityRowControls, ResultsCpaCell } from './EntityRowCells';
import { RuleAttachmentCell } from './RuleAttachmentCell';

interface AdSetRowProps {
  adSet: AdSetItem;
  readOnly?: boolean;
  /** Rows can be selected for bulk actions. */
  selectable?: boolean;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  properties?: Record<string, boolean>;
}

export const AdSetRow: React.FC<AdSetRowProps> = ({ adSet, readOnly = false, selectable = false, delivery, properties }) => {
  const {
    selectedCampaignIds,
    toggleCampaignSelection,
    displayProperties: storedDisplayProperties,
    adSetAttachedRules,
  } = useAppStore();

  const displayProperties = properties ?? storedDisplayProperties;
  const isSelected = selectable && selectedCampaignIds.includes(adSet.id);
  const isDeliveryKnown = adSet.status !== 'unknown';
  const isDeliveryOn = adSet.status === 'active';
  const isPositiveRoi = adSet.roi.startsWith('+');
  const columns = getAdsManagerColumns('adsets', displayProperties);

  return (
    <LinearDataListRow
      data-row-id={adSet.id}
      layout="grid"
      columns={columns}
      tabIndex={readOnly ? undefined : 0}
      selected={isSelected}
      className={`adset-data-row ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <LinearDataPrimaryCell
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
        subtitle={(
          <span className="truncate">
            {adSet.campaignName} · <span className="font-mono">{adSet.identifier}</span>
          </span>
        )}
        dimmed={isDeliveryKnown && !isDeliveryOn}
        hint={`${adSet.name} · ${adSet.identifier}`}
      />

      {displayProperties.budget !== false && <LinearDataMetricCell value={adSet.budget} />}

      {(displayProperties.results !== false || displayProperties.cpa !== false) && (
        <ResultsCpaCell
          leadsCount={adSet.leadsCount}
          cpa={adSet.cpa}
          showResults={displayProperties.results !== false}
          showCpa={displayProperties.cpa !== false}
        />
      )}

      {displayProperties.spend !== false && <LinearDataMetricCell value={adSet.spend} />}

      {displayProperties.roi !== false && (
        <LinearDataMetricCell
          value={adSet.roi}
          valueClassName={`font-semibold ${isDeliveryOn ? isPositiveRoi ? 'text-emerald-500' : 'text-rose-500' : 'text-[var(--text-muted)]'}`}
        />
      )}

      {displayProperties.rules !== false && (
        <RuleAttachmentCell
          level="adset"
          entityId={adSet.id}
          attachedRuleIds={adSetAttachedRules[adSet.id] || []}
        />
      )}
    </LinearDataListRow>
  );
};
