import React from 'react';
import { RuleItem, useAppStore } from '@/store/useAppStore';
import { LinearCheckbox } from '@/ui/LinearCheckbox';
import { LinearToggle } from '@/ui/LinearToggle';

import { LinearDataListRow } from '@/ui/LinearDataList';
import { LinearLabelPill } from '@/ui/LinearLabelPill';
import { ruleActionTone } from '@/lib/rules';
import type { RuleActionTone } from '@/lib/rules';
import { getRulesColumns } from './tableColumns';
import { RuleRowMenu } from './RuleRowMenu';

const ACTION_BADGE_STYLES: Record<
  RuleActionTone,
  { bg: string; border: string; text: string }
> = {
  stop: {
    bg: 'var(--rules-action-stop-bg)',
    border: 'var(--rules-action-stop-border)',
    text: 'var(--rules-action-stop-text)',
  },
  positive: {
    bg: 'var(--rules-action-positive-bg)',
    border: 'var(--rules-action-positive-border)',
    text: 'var(--rules-action-positive-text)',
  },
  default: {
    bg: 'var(--rules-action-default-bg)',
    border: 'var(--rules-action-default-border)',
    text: 'var(--rules-action-default-text)',
  },
};

interface RuleRowProps {
  rule: RuleItem;
}

export const RuleRow: React.FC<RuleRowProps> = ({ rule }) => {
  const {
    selectedRuleIds,
    toggleRuleSelection,
    toggleRuleStatus,
    setFocusedRuleId,
    rulesDisplayProperties,
  } = useAppStore();

  const isSelected = selectedRuleIds.includes(rule.id);
  const isDeliveryOn = rule.status !== 'paused';
  const columns = getRulesColumns(rulesDisplayProperties);

  const handleRowClick = () => {
    setFocusedRuleId(rule.id);
  };

  const actionStyle = ACTION_BADGE_STYLES[ruleActionTone(rule.actionKind)];

  return (
    <LinearDataListRow
      layout="grid"
      columns={columns}
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFocusedRuleId(rule.id);
        } else if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          toggleRuleSelection(rule.id);
        }
      }}
      selected={isSelected}
      className="cursor-pointer"
    >
      <div className="flex min-w-0 items-center gap-3">
        <LinearCheckbox checked={isSelected} onChange={() => toggleRuleSelection(rule.id)} />
        {rulesDisplayProperties.status !== false && (
          <div onClick={(e) => e.stopPropagation()}>
            <LinearToggle
              checked={isDeliveryOn}
              disabled={rule.needsReview && !isDeliveryOn}
              tooltipContent={
                rule.needsReview && !isDeliveryOn
                  ? rule.reviewReason || 'Re-save this rule before switching it on'
                  : isDeliveryOn
                  ? 'Pause rule'
                  : 'Resume rule'
              }
              onChange={() => void toggleRuleStatus(rule.id)}
            />
          </div>
        )}
        <span className="truncate text-[13px] font-[450]" style={{ color: isDeliveryOn ? 'var(--text-primary)' : 'var(--text-muted)' }}>{rule.name}</span>
        {rule.needsReview && (
          <LinearLabelPill
            label="Needs review"
            dotColor="var(--rules-action-stop-text)"
            className="shrink-0"
          />
        )}
      </div>

      {rulesDisplayProperties.condition !== false && (
          <div className="flex min-w-0 items-center overflow-hidden">
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                backgroundColor: 'var(--rules-property-bg)',
                border: '1px solid var(--rules-property-border)',
                color: 'var(--rules-property-text)',
                borderRadius: '4px',
                padding: '2px 7px',
                fontFamily: 'var(--font-monospace, monospace)',
                letterSpacing: '-0.01em',
              }}
              className="truncate whitespace-nowrap select-text"
            >
              {rule.condition}
            </span>
          </div>
      )}

      {rulesDisplayProperties.action !== false && (
          <div className="flex min-w-0 items-center overflow-hidden">
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                backgroundColor: actionStyle.bg,
                border: `1px solid ${actionStyle.border}`,
                color: actionStyle.text,
                borderRadius: '4px',
                padding: '2px 7px',
                letterSpacing: '-0.01em',
              }}
              className="truncate whitespace-nowrap"
            >
              {rule.action}
            </span>
          </div>
      )}

      {rulesDisplayProperties.scope !== false && (
          <div className="flex min-w-0 items-center overflow-hidden">
            {rule.scope && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 450,
                backgroundColor: 'var(--rules-scope-bg)',
                border: '1px solid var(--rules-property-border)',
                color: 'var(--rules-scope-text)',
                borderRadius: '4px',
                padding: '2px 6px',
              }}
              className="truncate whitespace-nowrap"
            >
              {rule.scope}
            </span>
            )}
          </div>
      )}

      {rulesDisplayProperties.lastRun !== false && (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 450,
              color: 'var(--text-tertiary)',
            }}
            className="truncate text-right whitespace-nowrap"
          >
            {rule.lastRun}
          </span>
      )}

        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <RuleRowMenu rule={rule} />
      </div>
    </LinearDataListRow>
  );
};
