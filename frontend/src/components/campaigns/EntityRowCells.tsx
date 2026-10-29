import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyCheckbox } from '@/ui/BuyerlyCheckbox';
import { BuyerlyDataMetricCell } from '@/ui/BuyerlyDataList';
import type { DeliveryControl } from '@/lib/delivery';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { findMetric, type AdsManagerMetrics } from './adsManagerMetrics';
import { formatMetric } from './liveCampaigns';
import { DeliveryStatusControl, rowDeliveryState } from './DeliveryStatusControl';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  text: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  textMuted: {
    color: colors['--text-tertiary'],
  },
  account: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  accountIcon: {
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--text-tertiary'],
  },
  accountName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

interface EntityRowControlsProps {
  /** Singular noun for tooltips, e.g. "ad set". */
  noun: string;
  status: 'active' | 'paused' | 'unknown';
  /** Meta's `effective_status`, which the icon shows. */
  effectiveStatus?: string;
  statusLabel: string;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  showStatus: boolean;
  /** False where rows cannot be selected; the slot is kept for alignment. */
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

/** Selection and delivery status that lead every Ads Manager row. */
export const EntityRowControls: React.FC<EntityRowControlsProps> = ({
  noun,
  status,
  effectiveStatus,
  statusLabel,
  delivery,
  showStatus,
  selectable,
  selected,
  onToggleSelected,
}) => (
  <>
    {/* Keep the selection slot so read-only rows retain the established Name alignment. */}
    {!selectable ? (
      <BuyerlyCheckbox checked={false} hidden />
    ) : (
      <BuyerlyCheckbox checked={selected} onChange={onToggleSelected} />
    )}
    {showStatus && (
      <DeliveryStatusControl
        noun={noun}
        state={rowDeliveryState(status, effectiveStatus, delivery)}
        statusLabel={statusLabel}
        delivery={delivery}
      />
    )}
  </>
);

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
    {...stylex.props(styles.text, muted && styles.textMuted)}
    title={text || undefined}
  >
    {text || '—'}
  </div>
);

/** The row's ad account with Ad accounts' icon, as Linear shows a project on an issue row. */
const EntityAccountCell: React.FC<{ name: string }> = ({ name }) => (
  <div {...stylex.props(styles.account)} title={name || undefined}>
    <span {...stylex.props(styles.accountIcon)} aria-hidden="true">
      <BuyerlyIcon name="ad-accounts" size={12} />
    </span>
    <span {...stylex.props(styles.accountName)}>{name || '—'}</span>
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
  return <BuyerlyDataMetricCell value={formatMetric(metric, row.metrics?.[metric.id] ?? null, row.currency ?? '')} />;
};
