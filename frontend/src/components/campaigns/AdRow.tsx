import React from 'react';
import { AdItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import type { DeliveryControl } from '@/lib/delivery';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';

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
      <div className="flex min-w-0 items-center gap-3">
        {readOnly ? (
          <LinearCheckbox checked={false} hidden />
        ) : (
          <LinearCheckbox checked={isSelected} onChange={() => toggleCampaignSelection(ad.id)} />
        )}
        {displayProperties.status !== false && (
          !isDeliveryKnown ? (
            <span className="inline-flex h-5 w-8 items-center justify-center text-[12px] text-[var(--text-muted)]" aria-label="Delivery status unavailable">—</span>
          ) : (
            <LinearToggle
              checked={delivery ? delivery.status === 'active' : isDeliveryOn}
              busy={delivery?.busy}
              onChange={delivery ? delivery.onChange : undefined}
              disabled={!delivery}
              tooltipContent={delivery
                ? ((delivery.status === 'active') ? 'Turn this ad off' : 'Turn this ad on')
                : `${ad.statusLabel}. Ad controls are not available for this account`}
            />
          )
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium" style={{ color: isDeliveryKnown && !isDeliveryOn ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{ad.name}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">{ad.campaignName} › {ad.adSetName}</div>
        </div>
      </div>

      {displayProperties.ctr !== false && <div className="truncate text-right text-[12px] font-[450] text-[var(--text-secondary)]">{ad.ctr}</div>}

      {displayProperties.cpc !== false && <div className="truncate text-right font-mono text-[12px] font-[450] text-[var(--text-secondary)]">{ad.cpc}</div>}

      {(displayProperties.results !== false || displayProperties.cpa !== false) && (
        <div className="flex min-w-0 items-center justify-end gap-1 truncate whitespace-nowrap">
          {displayProperties.results !== false && <span className="text-[12px] font-[450]">{ad.leadsCount} leads</span>}
          {displayProperties.cpa !== false && <span className="text-[11px] text-[var(--text-muted)]">({ad.cpa})</span>}
        </div>
      )}

      {displayProperties.spend !== false && <div className="truncate text-right font-mono text-[12px] font-[450] text-[var(--text-secondary)]">{ad.spend}</div>}
    </LinearDataListRow>
  );
};
