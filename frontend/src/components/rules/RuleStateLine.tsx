import React from 'react';
import { describeRuleState } from '@/lib/rules';
import type { RuleEntityStatePayload, RuleStateTone } from '@/lib/rules';

const TONE_COLORS: Record<RuleStateTone, string> = {
  acted: 'var(--rules-action-positive-text)',
  waiting: 'var(--rules-action-default-text)',
  blocked: 'var(--rules-scope-text)',
  quiet: 'var(--text-tertiary)',
  error: 'var(--rules-action-stop-text)',
};

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
    <div className="flex min-w-0 flex-col gap-[2px]" data-rule-state={row.state}>
      <span
        className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium leading-4"
        style={{ color }}
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={
            view.tone === 'blocked' || view.tone === 'quiet'
              ? { border: `1px solid ${color}` }
              : { backgroundColor: color }
          }
        />
        <span className="truncate">{view.label}</span>
      </span>
      {view.note && (
        <span
          className="pl-3 text-[12px] leading-4 text-[var(--text-tertiary)] [overflow-wrap:anywhere]"
          title={view.note}
        >
          {view.note}
        </span>
      )}
    </div>
  );
};
