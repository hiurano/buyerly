import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { describeRuleState } from '@/lib/rules';
import type { RuleEntityStatePayload, RuleStateTone } from '@/lib/rules';

const TONE_COLORS: Record<RuleStateTone, string> = {
  acted: 'var(--rules-action-positive-text)',
  waiting: 'var(--rules-action-default-text)',
  blocked: 'var(--rules-scope-text)',
  quiet: 'var(--text-tertiary)',
  error: 'var(--rules-action-stop-text)',
};

const styles = stylex.create({
  root: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: 2,
  },
  status: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '16px',
  },
  dot: {
    height: 6,
    width: 6,
    flexShrink: 0,
    borderRadius: 9999,
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  note: {
    paddingLeft: 12,
    fontSize: 12,
    lineHeight: '16px',
    color: colors['--text-tertiary'],
    overflowWrap: 'anywhere',
  },
});

interface RuleStateLineProps {
  row: RuleEntityStatePayload;
}

/**
 * One rule's state on one entity (#322): a coloured status ("Waiting until
 * 00:00", "Gave way to Stop") and, under it, why — the readings, the undo, the
 * last time it fired. Shared by the rule's status dialog and the Ads Manager
 * rule picker, so both sides of the question read the same.
 */
export const RuleStateLine: React.FC<RuleStateLineProps> = ({ row }) => {
  const view = describeRuleState(row);
  const color = TONE_COLORS[view.tone];
  return (
    <div {...stylex.props(styles.root)} data-rule-state={row.state}>
      <span {...stylex.props(styles.status)} style={{ color }}>
        <span
          aria-hidden="true"
          {...stylex.props(styles.dot)}
          style={
            view.tone === 'blocked' || view.tone === 'quiet'
              ? { border: `1px solid ${color}` }
              : { backgroundColor: color }
          }
        />
        <span {...stylex.props(styles.label)}>{view.label}</span>
      </span>
      {view.note && (
        <span {...stylex.props(styles.note)} title={view.note}>
          {view.note}
        </span>
      )}
    </div>
  );
};
