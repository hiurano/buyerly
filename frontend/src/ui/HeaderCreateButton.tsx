import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { Tooltip } from '@/ui/Tooltip';

export interface HeaderCreateButtonProps {
  /** Short label, also the accessible name: "New rule", "Add account". */
  label: string;
  /** Tooltip text, e.g. "Create new rule". */
  tooltip: string;
  /** Key shown in the tooltip, when the action has one. */
  shortcut?: string;
  onClick: () => void;
}

const WIDE = '@media (min-width: 1025px)';
const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  button: {
    display: 'flex',
    height: {
      default: 28,
      [TOUCH]: 40,
    },
    width: {
      default: 28,
      [WIDE]: 'auto',
    },
    minWidth: {
      default: null,
      [TOUCH]: 40,
    },
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: {
      default: null,
      [WIDE]: 6,
    },
    paddingLeft: {
      default: null,
      [WIDE]: 8,
    },
    paddingRight: {
      default: null,
      [WIDE]: 10,
    },
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    transitionProperty: 'all',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  label: {
    display: {
      default: 'none',
      [WIDE]: 'inline',
    },
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 500,
  },
});

/**
 * The page header's create action, like Linear's "New project": a round,
 * borderless 28px "+" that shows its label above 1024px and grows to a
 * finger-sized 40px target on touch screens. Shown at every width.
 */
export const HeaderCreateButton: React.FC<HeaderCreateButtonProps> = ({ label, tooltip, shortcut, onClick }) => (
  <Tooltip content={tooltip} shortcut={shortcut}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      {...stylex.props(styles.button)}
    >
      <BuyerlyIcon name="add" size={14} />
      <span aria-hidden="true" {...stylex.props(styles.label)}>
        {label}
      </span>
    </button>
  </Tooltip>
);
