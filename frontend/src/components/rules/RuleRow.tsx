import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, type as typeTokens } from '@/styles/tokens.stylex';
import { BuyerlyCheckbox } from '@/ui/BuyerlyCheckbox';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';

import { BuyerlyDataListRow, BuyerlyDataMetricCell, BuyerlyDataPrimaryCell } from '@/ui/BuyerlyDataList';
import { BuyerlyLabelPill } from '@/ui/BuyerlyLabelPill';
import { ATTACH_STEPS, RULE_LEVEL_LABELS, ruleActionTone } from '@/lib/rules';
import type { RuleActionTone } from '@/lib/rules';
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
  cell: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
  chip: {
    ...truncate,
    fontSize: 11,
    fontWeight: 500,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 4,
    paddingTop: 2,
    paddingRight: 7,
    paddingBottom: 2,
    paddingLeft: 7,
    letterSpacing: '-0.01em',
  },
  condition: {
    backgroundColor: colors['--rules-property-bg'],
    borderColor: colors['--rules-property-border'],
    color: colors['--rules-property-text'],
    fontFamily: typeTokens['--font-monospace'],
    userSelect: 'text',
  },
  stop: {
    backgroundColor: colors['--rules-action-stop-bg'],
    borderColor: colors['--rules-action-stop-border'],
    color: colors['--rules-action-stop-text'],
  },
  positive: {
    backgroundColor: colors['--rules-action-positive-bg'],
    borderColor: colors['--rules-action-positive-border'],
    color: colors['--rules-action-positive-text'],
  },
  default: {
    backgroundColor: colors['--rules-action-default-bg'],
    borderColor: colors['--rules-action-default-border'],
    color: colors['--rules-action-default-text'],
  },
  scope: {
    fontWeight: 450,
    paddingRight: 6,
    paddingLeft: 6,
    letterSpacing: null,
    backgroundColor: colors['--rules-scope-bg'],
    borderColor: colors['--rules-property-border'],
    color: colors['--rules-scope-text'],
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

const ACTION_BADGE_STYLES: Record<RuleActionTone, stylex.StyleXStyles> = {
  stop: styles.stop,
  positive: styles.positive,
  default: styles.default,
};

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

  const isDeliveryOn = rule.status !== 'paused';
  const columns = getRulesColumns(rulesDisplayProperties);
  const isSmall = useIsSmallScreen();

  const handleRowClick = () => {
    setFocusedRuleId(rule.id);
  };

  const actionStyle = ACTION_BADGE_STYLES[ruleActionTone(rule.actionKind)];

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
              <div onClick={(e) => e.stopPropagation()}>
                <BuyerlyToggle
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
            <span {...stylex.props(styles.chip, styles.condition)} title={rule.condition}>
              {rule.condition}
            </span>
          </div>
      )}

      {rulesDisplayProperties.action !== false && (
          <div {...stylex.props(styles.cell)}>
            <span {...stylex.props(styles.chip, actionStyle)}>
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
              {...stylex.props(styles.chip, styles.scope)}
              title={rule.preset.attached_account_ids.length === 0 ? ATTACH_STEPS : undefined}
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
