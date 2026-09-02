import React from 'react';
import { AdItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';

interface AdRowProps {
  ad: AdItem;
}

export const AdRow: React.FC<AdRowProps> = ({ ad }) => {
  const { toggleAdDelivery, selectedCampaignIds, toggleCampaignSelection, displayProperties } = useAppStore();

  const isSelected = selectedCampaignIds.includes(ad.id);
  const isDeliveryOn = ad.status !== 'paused';
  const columns = getAdsManagerColumns('ads', displayProperties);

  return (
    <LinearDataListRow
      layout="grid"
      columns={columns}
      tabIndex={0}
      selected={isSelected}
      className="ad-data-row cursor-pointer"
    >
      <div className="flex min-w-0 items-center gap-3">
        <LinearCheckbox checked={isSelected} onChange={() => toggleCampaignSelection(ad.id)} />
        {displayProperties.status !== false && (
          <LinearToggle checked={isDeliveryOn} onChange={() => toggleAdDelivery(ad.id)} tooltipContent={isDeliveryOn ? 'Pause ad' : 'Resume ad'} />
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium" style={{ color: isDeliveryOn ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{ad.name}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">{ad.campaignName} › {ad.adSetName}</div>
        </div>
      </div>

      <div className="truncate text-right text-[12px] font-[450] text-[var(--text-secondary)]">{ad.ctr}</div>

      <div className="truncate text-right font-mono text-[12px] font-[450] text-[var(--text-secondary)]">{ad.cpc}</div>

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
