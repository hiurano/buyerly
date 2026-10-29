import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Tooltip } from '@/ui/Tooltip';
import { withClassName } from '@/ui/withClassName';

interface SelectionDockProps {
  count: number;
  onOpenActions: () => void;
  onClear: () => void;
}

const styles = stylex.create({
  frame: {
    pointerEvents: 'none',
    position: 'absolute',
    bottom: 16,
    left: 8,
    right: 8,
    zIndex: 94,
    display: 'flex',
    userSelect: 'none',
    justifyContent: 'center',
  },
  dock: {
    pointerEvents: 'auto',
    display: 'flex',
    height: 44,
    alignItems: 'center',
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--dock-border'],
    backgroundColor: colors['--dock-bg'],
    padding: 8,
    boxShadow: colors['--dropdown-shadow'],
  },
  count: {
    paddingLeft: 12,
    paddingRight: 2,
    fontSize: 12,
    lineHeight: '18px',
    color: colors['--text-primary'],
    fontVariantNumeric: 'tabular-nums',
  },
  actions: {
    display: 'inline-flex',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: {
      default: colors['--dock-bg'],
      ':hover': colors['--item-hover-bg'],
    },
    paddingLeft: 10,
    paddingRight: 10,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 1px ${colors['--focus-ring-color']}`,
    },
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  actionsIcon: {
    display: 'flex',
    height: 14,
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--text-tertiary'],
  },
  clear: {
    display: 'inline-flex',
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: {
      default: colors['--dock-clear-btn-bg'],
      ':hover': colors['--item-hover-bg'],
    },
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 1px ${colors['--focus-ring-color']}`,
    },
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
});

/**
 * Linear's selection dock. It is placed inside the list it acts on (the
 * nearest positioned ancestor), centred over that list rather than the window,
 * and lets clicks through everywhere except the pill itself.
 */
export const SelectionDock: React.FC<SelectionDockProps> = ({ count, onOpenActions, onClear }) => {
  if (count === 0) return null;

  return (
    <div {...stylex.props(styles.frame)}>
      <div
        role="toolbar"
        aria-label={`${count} selected`}
        {...withClassName(stylex.props(styles.dock), 'selection-dock-enter')}
      >
        <span {...stylex.props(styles.count)} aria-live="polite">
          {count}&nbsp;selected
        </span>

        <Tooltip content="Open command menu" shortcut="Ctrl K">
          <button
            type="button"
            aria-label="Open command menu"
            onClick={onOpenActions}
            {...stylex.props(styles.actions)}
          >
            <span {...stylex.props(styles.actionsIcon)} aria-hidden="true">
              <BuyerlyIcon name="command" size={14} />
            </span>
            Actions
          </button>
        </Tooltip>

        <Tooltip content="Clear selected" shortcut="Esc">
          <button
            type="button"
            aria-label="Clear selected"
            onClick={onClear}
            {...stylex.props(styles.clear)}
          >
            <BuyerlyIcon name="close" size={12} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
