import React from 'react';
import { AdItem, useAppStore } from '@/store/useAppStore';
import type { DeliveryControl } from '@/lib/delivery';
import { LinearDataListRow, LinearDataMetricCell, LinearDataPrimaryCell } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';
import { EntityRowControls, ResultsCpaCell } from './EntityRowCells';

interface AdRowProps {
  ad: AdItem;
  readOnly?: boolean;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  properties?: Record<string, boolean>;
}

export const AdRow: React.FC<AdRowProps> = ({ ad, readOnly = false, delivery, properties }) => {
  const { selectedCampaignIds, toggleCampaignSelection, displayProperties: storedDisplayProperties } = useAppStore();

  const displayProperties = properties ?? storedDisplayProperties;
  const isSelected = !readOnly && selectedCampaignIds.includes(ad.id);
  const isDeliveryKnown = ad.status !== 'unknown';
  const isDeliveryOn = ad.status === 'active';
  const columns = getAdsManagerColumns('ads', displayProperties);

  return (
    <LinearDataListRow
      layout="grid"
      columns={columns}
      tabIndex={readOnly ? undefined : 0}
      selected={isSelected}
      className={`ad-data-row ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <LinearDataPrimaryCell
        leading={(
          <EntityRowControls
            noun="ad"
            status={ad.status}
            statusLabel={ad.statusLabel}
            delivery={delivery}
            showStatus={displayProperties.status !== false}
            readOnly={readOnly}
            selected={isSelected}
            onToggleSelected={() => toggleCampaignSelection(ad.id)}
          />
        )}
        title={ad.name}
        subtitle={<span className="truncate">{ad.campaignName} › {ad.adSetName}</span>}
        dimmed={isDeliveryKnown && !isDeliveryOn}
        hint={ad.name}
      />

      {displayProperties.ctr !== false && <LinearDataMetricCell value={ad.ctr} />}

      {displayProperties.cpc !== false && <LinearDataMetricCell value={ad.cpc} />}

      {(displayProperties.results !== false || displayProperties.cpa !== false) && (
        <ResultsCpaCell
          leadsCount={ad.leadsCount}
          cpa={ad.cpa}
          showResults={displayProperties.results !== false}
          showCpa={displayProperties.cpa !== false}
        />
      )}

      {displayProperties.spend !== false && <LinearDataMetricCell value={ad.spend} />}
    </LinearDataListRow>
  );
};
