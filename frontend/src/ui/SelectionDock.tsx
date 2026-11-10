import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Tooltip } from '@/ui/Tooltip';
import { withClassName } from '@/ui/withClassName';
import '@/ui/animations.css';

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
    // No border, as Linear's (01.11): the shadow alone lifts it.
    borderRadius: 9999,
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
  // Linear's secondary pill: a raised fill with a 0.5px ring and soft shadow, a step lighter under the pointer.
  actions: {
    display: 'inline-flex',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: {
      default: colors['--dock-button-bg'],
      ':hover': colors['--dock-button-hover-bg'],
    },
    paddingLeft: 10,
    paddingRight: 10,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: colors['--dock-button-ring'],
      ':hover': colors['--dock-button-ring-hover'],
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
    color: colors['--dock-button-fg'],
  },
  clear: {
    display: 'inline-flex',
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    // Bare until the pointer is on it, as Linear's.
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--dock-clear-hover-bg'],
    },
    color: {
      default: colors['--dock-button-fg'],
      ':hover': colors['--text-primary'],
    },
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
            <BuyerlyIcon name="close" size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
