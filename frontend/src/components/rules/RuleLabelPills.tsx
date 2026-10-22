import React from 'react';
import type { RuleLabel } from '@/store/useAppStore';
import { BuyerlyLabelPill } from '@/ui/BuyerlyLabelPill';

/**
 * A rule's labels as Linear's pills: one or two side by side, more folded
 * into one pill with their dots stacked and "N labels", as Linear does when
 * the row has no room for each.
 */
export const RuleLabelPills: React.FC<{ labels: RuleLabel[]; className?: string }> = ({ labels, className = '' }) => {
  if (labels.length === 0) return null;
  if (labels.length <= 2) {
    return (
      // A long name ends in an ellipsis inside its pill instead of being cut at the column's edge.
      <span className={`flex min-w-0 items-center gap-1 overflow-hidden [&>div]:min-w-0 [&>div]:!shrink ${labels.length === 2 ? '[&>div]:!max-w-[calc(50%-2px)]' : ''} ${className}`}>
        {labels.map((label) => (
          <BuyerlyLabelPill key={label.id} label={label.name} dotColor={label.color} />
        ))}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full border border-[var(--color-border-secondary)] bg-[var(--item-hover-bg)] px-2 ${className}`}
      title={labels.map((label) => label.name).join(', ')}
    >
      <span className="flex items-center" aria-hidden="true">
        {labels.slice(0, 4).map((label, index) => (
          <span
            key={label.id}
            className="block h-[9px] w-[9px] rounded-full"
            style={{
              backgroundColor: label.color,
              marginLeft: index === 0 ? 0 : -3,
              boxShadow: '0 0 0 1.5px var(--card-bg)',
            }}
          />
        ))}
      </span>
      <span className="ml-1.5 whitespace-nowrap text-[12px] font-[450] text-[var(--text-secondary)]">{labels.length} labels</span>
    </span>
  );
};
