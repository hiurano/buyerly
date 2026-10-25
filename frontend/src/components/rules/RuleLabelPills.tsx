import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { BuyerlyLabelPill } from '@/ui/BuyerlyLabelPill';
import { type RuleLabel } from '@/models/rulesStore';

const styles = stylex.create({
  row: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  // A long name ends in an ellipsis inside its pill instead of being cut at the column's edge.
  pill: {
    minWidth: 0,
    flexShrink: 1,
  },
  pillHalf: {
    maxWidth: 'calc(50% - 2px)',
  },
  folded: {
    display: 'inline-flex',
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--item-hover-bg'],
    paddingLeft: 8,
    paddingRight: 8,
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
  },
  dot: {
    display: 'block',
    height: 9,
    width: 9,
    borderRadius: 9999,
  },
  count: {
    marginLeft: 6,
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
});

/**
 * A rule's labels as Linear's pills: one or two side by side, more folded
 * into one pill with their dots stacked and "N labels", as Linear does when
 * the row has no room for each.
 */
export const RuleLabelPills: React.FC<{ labels: RuleLabel[]; xstyle?: stylex.StyleXStyles }> = ({ labels, xstyle }) => {
  if (labels.length === 0) return null;
  if (labels.length <= 2) {
    return (
      <span {...stylex.props(styles.row, xstyle)}>
        {labels.map((label) => (
          <BuyerlyLabelPill
            key={label.id}
            label={label.name}
            dotColor={label.color}
            xstyle={[styles.pill, labels.length === 2 && styles.pillHalf]}
          />
        ))}
      </span>
    );
  }
  return (
    <span {...stylex.props(styles.folded, xstyle)} title={labels.map((label) => label.name).join(', ')}>
      <span {...stylex.props(styles.dots)} aria-hidden="true">
        {labels.slice(0, 4).map((label, index) => (
          <span
            key={label.id}
            {...stylex.props(styles.dot)}
            style={{
              backgroundColor: label.color,
              marginLeft: index === 0 ? 0 : -3,
              boxShadow: '0 0 0 1.5px var(--card-bg)',
            }}
          />
        ))}
      </span>
      <span {...stylex.props(styles.count)}>{labels.length} labels</span>
    </span>
  );
};
