import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { menuItemMarker } from '@/ui/markers.stylex';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from '@/ui/ContextMenu';
import {
  BuyerlyLabelIcon,
  BuyerlyTrashIcon,
  BuyerlyCheckIcon,
} from '@/icons/BuyerlyIcons';
import { ruleActionTone } from '@/lib/rules';
import type { RuleActionTone } from '@/lib/rules';
import { ruleStatesTitle } from './RuleStatesDialog';
import { labelsOf } from './rulesViewModel';
import { RuleLabelPills } from './RuleLabelPills';
import { useDialogStore, dialogStore } from '@/models/dialogStore';
import { useRulesStore, RuleItem } from '@/models/rulesStore';

const ACTION_DOT_COLORS: Record<RuleActionTone, string> = {
  stop: 'var(--rules-action-stop-text)',
  positive: 'var(--rules-action-positive-text)',
  default: 'var(--rules-action-default-text)',
};

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** The sans stack the app's controls use. */
const SANS = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: colors['--card-bg'],
    borderRadius: 8,
    boxShadow: `0 0 0 0.5px ${colors['--board-card-ring']}, ${colors['--canvas-shadow']}`,
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '0.1s',
    transitionTimingFunction: 'ease',
    userSelect: 'none',
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  cardSelected: {
    backgroundColor: colors['--item-active-bg'],
    boxShadow: `0 0 0 1px ${colors['--color-border-secondary']}, ${colors['--canvas-shadow']}`,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identifier: {
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
    letterSpacing: '-0.24px',
  },
  titleRow: {
    marginTop: 4,
  },
  title: {
    display: 'block',
    overflow: 'hidden',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '16px',
    color: colors['--text-primary'],
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    overflow: 'hidden',
  },
  badge: {
    height: 24,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--rules-property-border'],
    paddingTop: 0,
    paddingRight: 8,
    paddingBottom: 0,
    paddingLeft: 8,
    backgroundColor: colors['--rules-property-bg'],
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 450,
    color: colors['--rules-property-text'],
  },
  condition: {
    ...truncate,
    maxWidth: 180,
  },
  action: {
    gap: 5,
    flexShrink: 0,
  },
  actionDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  labels: {
    marginTop: 6,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  menuLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  menuLabel: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  menuIcon: {
    color: colors['--text-tertiary'],
  },
  menuHint: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: colors['--text-tertiary'],
  },
  kbd: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: SANS,
  },
  arrow: {
    fontSize: 10,
  },
  empty: {
    paddingTop: 8,
    paddingRight: 14,
    paddingBottom: 8,
    paddingLeft: 14,
    fontSize: 12,
    color: colors['--text-muted'],
  },
  labelDot: {
    height: 9,
    width: 9,
    flexShrink: 0,
    borderRadius: 9999,
  },
  labelName: truncate,
  check: {
    flexShrink: 0,
    color: colors['--text-secondary'],
  },
  deleteIcon: {
    color: {
      default: '#9d9d9e',
      [stylex.when.ancestor(':hover', menuItemMarker)]: '#fff',
      [stylex.when.ancestor('[data-highlighted]', menuItemMarker)]: '#fff',
    },
  },
  deleteKeys: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: '#9d9d9e',
  },
});

interface RuleCardProps {
  rule: RuleItem;
  isSelected: boolean;
  onSelect: () => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({
  rule,
  isSelected,
  onSelect,
}) => {
  const ruleLabels = useRulesStore((state) => state.ruleLabels);
  const setRuleLabels = useRulesStore((state) => state.setRuleLabels);
  const requestDeletion = useDialogStore((state) => state.requestDeletion);
  const openEditRuleModal = useDialogStore((state) => state.openEditRuleModal);
  const cardLabels = labelsOf(rule, ruleLabels);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          // The board's card is the rule's row: a search result or link opens it here.
          data-row-id={rule.id}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          data-is-active={isSelected ? 'true' : 'false'}
          {...stylex.props(styles.card, isSelected && styles.cardSelected)}
        >
          {/* 1. Top Row: Issue ID */}
          <div {...stylex.props(styles.topRow)}>
            <span {...stylex.props(styles.identifier)}>
              {rule.identifier}
            </span>
          </div>

          {/* 2. Title Row (Clean Title without icon) */}
          <div {...stylex.props(styles.titleRow)}>
            <span {...stylex.props(styles.title)}>
              {rule.name}
            </span>
          </div>

          {/* 3. Badge / Tag Pills Row (24px height, 48px/pill radius, 1px #2f3132 border) */}
          <div {...stylex.props(styles.badges)}>
            {/* Condition Badge */}
            <div {...stylex.props(styles.badge, styles.condition)} title={rule.condition}>
              {rule.condition}
            </div>

            {/* Action Badge */}
            <div {...stylex.props(styles.badge, styles.action)}>
              <div
                {...stylex.props(styles.actionDot)}
                style={{ backgroundColor: ACTION_DOT_COLORS[ruleActionTone(rule.actionKind)] }}
              />
              <span>{rule.action}</span>
            </div>
          </div>

          {cardLabels.length > 0 && <RuleLabelPills labels={cardLabels} xstyle={styles.labels} />}

          {/* 4. Bottom Metadata Row (Last check / Last action) */}
          <div {...stylex.props(styles.meta)}>
            Last check {rule.lastCheck} · Last action {rule.lastRun}
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Linear Card Context Menu Popup */}
      <ContextMenuContent>
        <ContextMenuItem onClick={() => openEditRuleModal(rule.id)}>
          <div {...stylex.props(styles.menuLine)}>
            <span>Edit rule</span>
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Labels, as Linear's card menu: each one on or off, the menu stays open. */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <div {...stylex.props(styles.menuLine)}>
              <BuyerlyLabelIcon size={16} {...stylex.props(styles.menuIcon)} />
              <span>Labels</span>
            </div>
            <div {...stylex.props(styles.menuHint)}>
              <kbd {...stylex.props(styles.kbd)}>L</kbd>
              <span {...stylex.props(styles.arrow)}>▶</span>
            </div>
          </ContextMenuSubTrigger>

          <ContextMenuSubContent>
            {ruleLabels.length === 0 ? (
              <div {...stylex.props(styles.empty)}>
                No labels yet. Create one in Settings → Rules → Labels.
              </div>
            ) : (
              ruleLabels.map((label) => {
                const on = rule.labelIds.includes(label.id);
                return (
                  <ContextMenuItem
                    key={label.id}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onSelect={(event) => {
                      event.preventDefault();
                      void setRuleLabels(rule.id, on ? rule.labelIds.filter((id) => id !== label.id) : [...rule.labelIds, label.id]);
                    }}
                  >
                    <div {...stylex.props(styles.menuLabel)}>
                      <span {...stylex.props(styles.labelDot)} style={{ backgroundColor: label.color }} />
                      <span {...stylex.props(styles.labelName)}>{label.name}</span>
                    </div>
                    {on && <BuyerlyCheckIcon size={16} {...stylex.props(styles.check)} />}
                  </ContextMenuItem>
                );
              })
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Where the rule stands on each campaign it checks (#322). */}
        <ContextMenuItem onClick={() => dialogStore.openRuleStates(rule.id)}>
          <div {...stylex.props(styles.menuLine)}>
            <span>{ruleStatesTitle(rule)}</span>
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Delete Item */}
        <ContextMenuItem
          onClick={() => requestDeletion('rule', [rule.id])}
        >
          <div {...stylex.props(styles.menuLine)}>
            <BuyerlyTrashIcon size={16} {...stylex.props(styles.deleteIcon)} />
            <span>Delete</span>
          </div>
          <div {...stylex.props(styles.deleteKeys)}>
            <kbd {...stylex.props(styles.kbd)}>Ctrl</kbd>
            <kbd {...stylex.props(styles.kbd)}>Delete</kbd>
          </div>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
