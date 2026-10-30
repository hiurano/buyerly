import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { BuyerlyCheckbox } from '@/ui/BuyerlyCheckbox';
import { DeliveryStatusControl } from '@/components/campaigns/DeliveryStatusControl';

import { BuyerlyDataListRow, BuyerlyDataMetricCell, BuyerlyDataPrimaryCell } from '@/ui/BuyerlyDataList';
import { BuyerlyLabelPill } from '@/ui/BuyerlyLabelPill';
import { ATTACH_STEPS, RULE_LEVEL_LABELS } from '@/lib/rules';
import { getRulesColumns } from './tableColumns';
import { RuleRowMenu } from './RuleRowMenu';
import { useIsSmallScreen } from '@/lib/useMediaQuery';
import { useRulesView } from './rulesViewModel';
import { RuleLabelPills } from './RuleLabelPills';
import { formatCheckInterval, formatRepeat } from './ruleDraft';
import { useRulesStore, RuleItem } from '@/models/rulesStore';
import { useSelectionStore } from '@/models/selectionStore';
import { dialogStore } from '@/models/dialogStore';
import { withClassName } from '@/ui/withClassName';

/** A day as Linear's Created column shows it: Oct 14. */
const createdDay = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
};

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  row: {
    cursor: 'pointer',
  },
  text: {
    ...truncate,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  identifier: {
    fontVariantNumeric: 'tabular-nums',
    color: colors['--text-tertiary'],
  },
  muted: {
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  labels: {
    display: 'flex',
    height: '100%',
    minWidth: 0,
    cursor: 'pointer',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Condition, Action and Scope read as Linear's text properties: 12px, secondary, no chip.
  cell: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
  menu: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // Pinned to the right edge on a narrow screen, where this column is past the scroll.
  menuSticky: {
    position: 'sticky',
    right: 0,
    zIndex: 1,
  },
});

interface RuleRowProps {
  rule: RuleItem;
}

const RuleRowContent: React.FC<RuleRowProps> = ({ rule }) => {
  // Only this rule's selection and labels: a change to another rule draws its own row alone (#500).
  const isSelected = useSelectionStore((state) => state.selectedRuleIds.includes(rule.id));
  const toggleRuleSelection = useSelectionStore((state) => state.toggleRuleSelection);
  const toggleRuleStatus = useRulesStore((state) => state.toggleRuleStatus);
  const setFocusedRuleId = useSelectionStore((state) => state.setFocusedRuleId);
  const rulesDisplayProperties = useRulesView().view.properties;
  const rowLabels = useRulesStore((state) => state.labelsOfRule(rule));

  const status = rule.status === 'paused' ? 'paused' : 'active';
  // A paused rule held for review is re-saved before it runs again: its icon only says why.
  const heldForReview = rule.needsReview && status === 'paused';
  const columns = getRulesColumns(rulesDisplayProperties);
  const isSmall = useIsSmallScreen();

  const handleRowClick = () => {
    setFocusedRuleId(rule.id);
  };

  return (
    <BuyerlyDataListRow
      data-row-id={rule.id}
      layout="grid"
      columns={columns}
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFocusedRuleId(rule.id);
        }
      }}
      selected={isSelected}
      xstyle={styles.row}
    >
      <BuyerlyDataPrimaryCell
        leading={(
          <>
            <BuyerlyCheckbox checked={isSelected} onChange={() => toggleRuleSelection(rule.id)} />
            {rulesDisplayProperties.status !== false && (
              <DeliveryStatusControl
                noun="rule"
                state={status}
                statusLabel={status === 'paused' ? 'Rule paused' : 'Rule active'}
                delivery={heldForReview ? undefined : {
                  status,
                  busy: false,
                  onChange: () => toggleRuleStatus(rule.id),
                }}
                unavailableTitle={heldForReview ? rule.reviewReason || 'Re-save this rule before switching it on' : undefined}
              />
            )}
          </>
        )}
        title={rule.name}
        badge={rule.needsReview && (
          <BuyerlyLabelPill
            label="Needs review"
            dotColor="var(--rules-action-stop-text)"
          />
        )}
        hint={rule.name}
      />

      {rulesDisplayProperties.id && (
        <span {...stylex.props(styles.text, styles.identifier)}>{rule.identifier}</span>
      )}

      {rulesDisplayProperties.labels !== false && (
        <div
          role="button"
          tabIndex={-1}
          aria-label={`Labels of ${rule.name}`}
          data-label-picker-trigger=""
          data-rule-labels={rule.id}
          {...stylex.props(styles.labels)}
          onClick={(event) => {
            event.stopPropagation();
            const open = dialogStore.ruleLabelPicker;
            if (open && open.ruleIds.length === 1 && open.ruleIds[0] === rule.id) {
              dialogStore.closeRuleLabelPicker();
            } else {
              dialogStore.openRuleLabelPicker([rule.id], event.currentTarget.getBoundingClientRect());
            }
          }}
        >
          <RuleLabelPills labels={rowLabels} />
        </div>
      )}

      {rulesDisplayProperties.condition !== false && (
          <div {...stylex.props(styles.cell)}>
            <span {...stylex.props(styles.text)} title={rule.condition}>
              {rule.condition}
            </span>
          </div>
      )}

      {rulesDisplayProperties.action !== false && (
          <div {...stylex.props(styles.cell)}>
            <span {...stylex.props(styles.text)} title={rule.action}>
              {rule.action}
            </span>
          </div>
      )}

      {rulesDisplayProperties.level && (
        <span {...stylex.props(styles.text)}>{RULE_LEVEL_LABELS[rule.preset.level ?? 'adset']}</span>
      )}

      {rulesDisplayProperties.scope !== false && (
          <div {...stylex.props(styles.cell)}>
            {rule.scope && (
            <span
              {...stylex.props(styles.text)}
              title={rule.preset.attached_account_ids.length === 0 ? ATTACH_STEPS : rule.scope}
            >
              {rule.scope}
            </span>
            )}
          </div>
      )}

      {rulesDisplayProperties.check && (
        <span {...stylex.props(styles.text)}>{formatCheckInterval(rule.preset.check_interval_minutes)}</span>
      )}

      {rulesDisplayProperties.repeat && (
        <span {...stylex.props(styles.text)}>{formatRepeat(rule.preset.cooldown_minutes)}</span>
      )}

      {rulesDisplayProperties.lastCheck !== false && (
        <BuyerlyDataMetricCell value={rule.lastCheck} valueXstyle={styles.muted} />
      )}

      {rulesDisplayProperties.lastRun !== false && (
        <BuyerlyDataMetricCell value={rule.lastRun} valueXstyle={styles.muted} />
      )}

      {rulesDisplayProperties.created && (
        <BuyerlyDataMetricCell value={createdDay(rule.preset.created_at)} valueXstyle={styles.muted} />
      )}

      <div
        {...withClassName(stylex.props(styles.menu, isSmall && styles.menuSticky), isSmall ? 'buyerly-data-sticky' : undefined)}
        onClick={(e) => e.stopPropagation()}
      >
        <RuleRowMenu rule={rule} />
      </div>
    </BuyerlyDataListRow>
  );
};

/** Draws again only when its rule, its selection or its labels change, as Linear's rows. */
export const RuleRow = React.memo(RuleRowContent);
