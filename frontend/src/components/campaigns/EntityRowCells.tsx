import React from 'react';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearDataMetricCell } from '@/ui/LinearDataList';
import type { DeliveryControl } from '@/lib/delivery';
import { LinearProjectIcon } from '@/icons/LinearIcons';
import { findMetric, type AdsManagerMetrics } from './adsManagerMetrics';
import { formatMetric } from './liveCampaigns';

interface EntityRowControlsProps {
  /** Singular noun for tooltips, e.g. "ad set". */
  noun: string;
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  showStatus: boolean;
  /** False where rows cannot be selected; the slot is kept for alignment. */
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

/** Selection and delivery controls that lead every Ads Manager row. */
export const EntityRowControls: React.FC<EntityRowControlsProps> = ({
  noun,
  status,
  statusLabel,
  delivery,
  showStatus,
  selectable,
  selected,
  onToggleSelected,
}) => {
  const controlLabel = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <>
      {/* Keep the selection slot so read-only rows retain the established Name alignment. */}
      {!selectable ? (
        <LinearCheckbox checked={false} hidden />
      ) : (
        <LinearCheckbox checked={selected} onChange={onToggleSelected} />
      )}
      {showStatus && (
        status === 'unknown' ? (
          <span
            className="inline-flex h-5 w-8 shrink-0 items-center justify-center text-[12px] text-[var(--text-muted)]"
            title="Delivery status is not available in this snapshot"
            aria-label="Delivery status unavailable"
          >
            —
          </span>
        ) : (
          <LinearToggle
            checked={delivery ? delivery.status === 'active' : status === 'active'}
            busy={delivery?.busy}
            onChange={delivery ? delivery.onChange : undefined}
            disabled={!delivery}
            tooltipContent={delivery
              ? (delivery.status === 'active' ? `Turn this ${noun} off` : `Turn this ${noun} on`)
              : `${statusLabel}. ${controlLabel} controls are not available for this account`}
          />
        )
      )}
    </>
  );
};

export interface EntityPropertyRow {
  identifier: string;
  accountName?: string;
  campaignName?: string;
  adSetName?: string;
  metrics?: AdsManagerMetrics;
  currency?: string;
}

const EntityTextCell: React.FC<{ text: string; muted?: boolean }> = ({ text, muted = false }) => (
  <div
    className={`min-w-0 truncate whitespace-nowrap text-[12px] font-[450] ${muted ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}
    title={text || undefined}
  >
    {text || '—'}
  </div>
);

/** The row's ad account with Ad accounts' icon, as Linear shows a project on an issue row. */
const EntityAccountCell: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-[450] text-[var(--text-secondary)]" title={name || undefined}>
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-tertiary)]" aria-hidden="true">
      <LinearProjectIcon size={12} />
    </span>
    <span className="min-w-0 truncate whitespace-nowrap">{name || '—'}</span>
  </div>
);

/**
 * Any Ads Manager column after the name (#389): the parent campaign or ad
 * set, the Meta ID, or one figure for the period. Rules has its own cell.
 */
export const EntityPropertyCell: React.FC<{ columnId: string; row: EntityPropertyRow }> = ({ columnId, row }) => {
  if (columnId === 'account') return <EntityAccountCell name={row.accountName ?? ''} />;
  if (columnId === 'campaign') return <EntityTextCell text={row.campaignName ?? ''} />;
  if (columnId === 'adSet') return <EntityTextCell text={row.adSetName ?? ''} />;
  if (columnId === 'id') return <EntityTextCell text={row.identifier} muted />;
  const metric = findMetric(columnId);
  if (!metric) return <div />;
  return <LinearDataMetricCell value={formatMetric(metric, row.metrics?.[metric.id] ?? null, row.currency ?? '')} />;
};
