import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { useIsSmallScreen } from '@/lib/useMediaQuery';
import { withClassName } from '@/ui/withClassName';
import { inheritedRuleIds } from '@/lib/rules';
import { RuleSelectorPopover } from './RuleSelectorPopover';
import type { RuleTargetLevel } from './RuleSelectorPopover';
import { useRulesStore } from '@/models/rulesStore';
import { colors } from '@/styles/tokens.stylex';

interface RuleAttachmentCellProps {
  /** The row's ad account, where its rules are attached. */
  accountId: string;
  level: RuleTargetLevel;
  entityId: string;
  attachedRuleIds: string[];
  /** Parent campaign of an ad set row, whose campaign rules reach it too. */
  campaignId?: string;
  /** Called before the picker opens, so the row can take focus. */
  onOpen?: () => void;
}

/** Lets the row's keyboard shortcut open the picker the cell owns. */
export interface RuleAttachmentCellHandle {
  open: () => void;
}

const LABEL_FONT = '"Inter Variable", "SF Pro Display", -apple-system, sans-serif';

const styles = stylex.create({
  cell: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
  },
  // Pinned to the right edge on a narrow screen, where this column is past the scroll.
  cellSticky: {
    position: 'sticky',
    right: 0,
    zIndex: 1,
    alignSelf: 'stretch',
  },
  pill: {
    position: 'relative',
    display: 'inline-flex',
    height: 22,
    alignItems: 'center',
    paddingTop: 0,
    paddingRight: 8,
    paddingBottom: 0,
    paddingLeft: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    cursor: 'pointer',
    outline: 'none',
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    // A 6px wider hit area around the pill.
    '::after': {
      content: '""',
      position: 'absolute',
      top: -6,
      right: -6,
      bottom: -6,
      left: -6,
    },
  },
  attached: {
    gap: 5,
    backgroundColor: colors['--item-hover-bg'],
    transitionProperty: 'border-color, background-color',
    transitionDuration: '0.15s',
  },
  // "+ Rule": dashed, and only its text lights up on hover.
  add: {
    gap: 4,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    transitionProperty: 'opacity, border-color, background-color, color',
    transitionDuration: '0.15s',
  },
  boltSlot: {
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bolt: {
    color: '#eab308',
  },
  label: {
    fontFamily: LABEL_FONT,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  // Only inherited rules: the row has none of its own.
  labelInherited: {
    color: colors['--text-secondary'],
  },
  labelOwn: {
    color: colors['--text-primary'],
  },
});

/**
 * The Rules cell of a campaign or ad set row: how many rules are aimed at this
 * entity, and the picker to change that. Shared so both levels stay identical.
 */
export const RuleAttachmentCell = forwardRef<
  RuleAttachmentCellHandle,
  RuleAttachmentCellProps
>(({ accountId, level, entityId, attachedRuleIds, campaignId, onOpen }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const isSmall = useIsSmallScreen();

  // Rules on the whole ad account (or an ad set's campaign) check this row as
  // well (#300): counted, so "+ Rule" never claims a checked row has none.
  const scopes = useRulesStore((state) => state.attachedRuleScopes[accountId]);
  const order = useRulesStore((state) => state.attachedRuleOrder[accountId]);
  const rules = useRulesStore((state) => state.rules);
  const inheritedCount = useMemo(() => {
    const ruleLevels = Object.fromEntries(rules.map((rule) => [rule.id, rule.preset.level]));
    return inheritedRuleIds(scopes ?? {}, order ?? [], ruleLevels, level, campaignId)
      .filter((ruleId) => !attachedRuleIds.includes(ruleId)).length;
  }, [scopes, order, rules, level, campaignId, attachedRuleIds]);

  const ownCount = attachedRuleIds.length;
  const attachedCount = ownCount + inheritedCount;
  const reachTitle = inheritedCount === 0
    ? undefined
    : [
        ownCount > 0 && `${ownCount} on this ${level === 'campaign' ? 'campaign' : 'ad set'}`,
        `${inheritedCount} through the ${level === 'adset' ? 'ad account or campaign' : 'ad account'}`,
      ].filter(Boolean).join(' · ');

  const open = (event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
      setAnchorRect(event.currentTarget.getBoundingClientRect());
    } else if (cellRef.current) {
      setAnchorRect(cellRef.current.getBoundingClientRect());
    }
    onOpen?.();
    setIsOpen(true);
  };

  useImperativeHandle(ref, () => ({ open: () => open() }), []);

  return (
    <div
      ref={cellRef}
      {...withClassName(stylex.props(styles.cell, isSmall && styles.cellSticky), isSmall ? 'buyerly-data-sticky' : undefined)}
    >
      {attachedCount > 0 ? (
        <button
          type="button"
          onClick={open}
          data-rule-cell="true"
          data-inherited-rules={inheritedCount || undefined}
          title={reachTitle}
          {...stylex.props(styles.pill, styles.attached)}
        >
          <div {...stylex.props(styles.boltSlot)}>
            <BuyerlyIcon name="rules" size={12} className={stylex.props(styles.bolt).className} />
          </div>
          <span {...stylex.props(styles.label, ownCount > 0 ? styles.labelOwn : styles.labelInherited)}>
            {attachedCount} {attachedCount === 1 ? 'rule' : 'rules'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          data-rule-cell="true"
          {...stylex.props(styles.pill, styles.add)}
          title="Add rule"
        >
          <BuyerlyIcon name="add" size={10} />
          <span {...stylex.props(styles.label)}>
            Rule
          </span>
        </button>
      )}

      <RuleSelectorPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRect={anchorRect}
        accountId={accountId}
        level={level}
        entityIds={[entityId]}
        campaignId={campaignId}
      />
    </div>
  );
});

RuleAttachmentCell.displayName = 'RuleAttachmentCell';
