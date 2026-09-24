import React from 'react';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';
import { LinearDataMetricCell } from '@/ui/LinearDataList';
import type { DeliveryControl } from '@/lib/delivery';

interface EntityRowControlsProps {
  /** Singular noun for tooltips, e.g. "ad set". */
  noun: string;
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  /** Present when the row may really change delivery in Meta. */
  delivery?: DeliveryControl;
  showStatus: boolean;
  readOnly: boolean;
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
  readOnly,
  selected,
  onToggleSelected,
}) => {
  const controlLabel = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <>
      {/* Keep the selection slot so read-only rows retain the established Name alignment. */}
      {readOnly ? (
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

interface ResultsCpaCellProps {
  leadsCount: number;
  cpa: string;
  showResults: boolean;
  showCpa: boolean;
}

/** The combined Results / CPA column: the count, with its cost beside it. */
export const ResultsCpaCell: React.FC<ResultsCpaCellProps> = ({ leadsCount, cpa, showResults, showCpa }) => (
  <LinearDataMetricCell
    value={showResults ? `${leadsCount} leads` : cpa}
    suffix={showResults && showCpa ? `(${cpa})` : undefined}
  />
);
