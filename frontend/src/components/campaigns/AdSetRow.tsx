import React from 'react';
import { AdSetItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';

interface AdSetRowProps {
  adSet: AdSetItem;
}

export const AdSetRow: React.FC<AdSetRowProps> = ({ adSet }) => {
  const { toggleAdSetDelivery, selectedCampaignIds, toggleCampaignSelection, displayProperties } = useAppStore();

  const isSelected = selectedCampaignIds.includes(adSet.id);
  const isDeliveryOn = adSet.status !== 'paused';
  const isPositiveRoi = adSet.roi.startsWith('+');
  const columns = getAdsManagerColumns('adsets', displayProperties);

  return (
    <LinearDataListRow
      layout="grid"
      columns={columns}
      tabIndex={0}
      selected={isSelected}
      className="adset-data-row cursor-pointer"
    >
      <div className="flex min-w-0 items-center gap-3">
        <LinearCheckbox checked={isSelected} onChange={() => toggleCampaignSelection(adSet.id)} />
        {displayProperties.status !== false && (
          <LinearToggle checked={isDeliveryOn} onChange={() => toggleAdSetDelivery(adSet.id)} tooltipContent={isDeliveryOn ? 'Pause ad set' : 'Resume ad set'} />
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium" style={{ color: isDeliveryOn ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{adSet.name}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">{adSet.campaignName} · {adSet.audience}</div>
        </div>
      </div>

      {displayProperties.budget !== false && <div className="truncate text-right font-mono text-[12px] font-[450] text-[var(--text-secondary)]">{adSet.budget}</div>}

      {(displayProperties.results !== false || displayProperties.cpa !== false) && (
        <div className="flex min-w-0 items-center justify-end gap-1 truncate whitespace-nowrap">
          {displayProperties.results !== false && <span className="text-[12px] font-[450]">{adSet.leadsCount} leads</span>}
          {displayProperties.cpa !== false && <span className="text-[11px] text-[var(--text-muted)]">({adSet.cpa})</span>}
        </div>
      )}

      {displayProperties.spend !== false && <div className="truncate text-right font-mono text-[12px] font-[450] text-[var(--text-secondary)]">{adSet.spend}</div>}

      {displayProperties.roi !== false && <div className={`truncate text-right text-[12px] font-medium ${isPositiveRoi ? 'text-emerald-400' : 'text-rose-400'}`}>{adSet.roi}</div>}
    </LinearDataListRow>
  );
};
