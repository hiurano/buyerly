import React from 'react';
import { AdItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';

interface AdRowProps {
  ad: AdItem;
  readOnly?: boolean;
  properties?: Record<string, boolean>;
}

export const AdRow: React.FC<AdRowProps> = ({ ad, readOnly = false, properties }) => {
  const { toggleAdDelivery, selectedCampaignIds, toggleCampaignSelection, displayProperties: storedDisplayProperties } = useAppStore();

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
              checked={isDeliveryOn}
              onChange={readOnly ? undefined : () => toggleAdDelivery(ad.id)}
              disabled={readOnly}
              tooltipContent={readOnly ? `${ad.statusLabel}. Ad controls are not connected yet` : isDeliveryOn ? 'Pause ad' : 'Resume ad'}
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
