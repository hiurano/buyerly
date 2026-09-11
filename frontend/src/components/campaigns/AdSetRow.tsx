import React from 'react';
import { AdSetItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearDataListRow } from '@/ui/LinearDataList';
import { getAdsManagerColumns } from './tableColumns';
import { RuleAttachmentCell } from './RuleAttachmentCell';

interface AdSetRowProps {
  adSet: AdSetItem;
  readOnly?: boolean;
  properties?: Record<string, boolean>;
}

export const AdSetRow: React.FC<AdSetRowProps> = ({ adSet, readOnly = false, properties }) => {
  const {
    toggleAdSetDelivery,
    selectedCampaignIds,
    toggleCampaignSelection,
    displayProperties: storedDisplayProperties,
    adSetAttachedRules,
  } = useAppStore();

  const displayProperties = properties ?? storedDisplayProperties;
  const isSelected = !readOnly && selectedCampaignIds.includes(adSet.id);
  const isDeliveryKnown = adSet.status !== 'unknown';
  const isDeliveryOn = adSet.status === 'active';
  const isPositiveRoi = adSet.roi.startsWith('+');
  const columns = getAdsManagerColumns('adsets', displayProperties);

  return (
    <LinearDataListRow
      layout="grid"
      columns={columns}
      tabIndex={readOnly ? undefined : 0}
      selected={isSelected}
      className={`adset-data-row ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {readOnly ? (
          <LinearCheckbox checked={false} hidden />
        ) : (
          <LinearCheckbox checked={isSelected} onChange={() => toggleCampaignSelection(adSet.id)} />
        )}
        {displayProperties.status !== false && (
          !isDeliveryKnown ? (
            <span className="inline-flex h-5 w-8 items-center justify-center text-[12px] text-[var(--text-muted)]" aria-label="Delivery status unavailable">—</span>
          ) : (
            <LinearToggle
              checked={isDeliveryOn}
              onChange={readOnly ? undefined : () => toggleAdSetDelivery(adSet.id)}
              disabled={readOnly}
              tooltipContent={readOnly ? `${adSet.statusLabel}. Ad set controls are not connected yet` : isDeliveryOn ? 'Pause ad set' : 'Resume ad set'}
            />
          )
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium" style={{ color: isDeliveryKnown && !isDeliveryOn ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{adSet.name}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">{adSet.campaignName} · {adSet.identifier}</div>
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
