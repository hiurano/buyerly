import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';

const HOVER = '@media (any-hover: hover) and (any-pointer: fine)';
const TOUCH = '@media (hover: none) and (pointer: coarse)';

/** Linear's round 28px header icon button (`.buyerly-icon-btn`). Apply it before the caller's own styles. */
export const iconButton = stylex.create({
  root: {
    boxSizing: 'border-box',
    margin: 0,
    paddingTop: 0,
    paddingRight: 2,
    paddingBottom: 0,
    paddingLeft: 2,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    width: 28,
    minWidth: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: {
      default: 'transparent',
      [HOVER]: {
        default: 'transparent',
        ':hover': colors['--item-hover-bg'],
      },
      ':active': colors['--item-active-bg'],
    },
    color: {
      default: colors['--text-tertiary'],
      [HOVER]: {
        default: colors['--text-tertiary'],
        ':hover': colors['--text-primary'],
      },
    },
    cursor: 'pointer',
    userSelect: 'none',
    outline: 'none',
    transition: 'background-color 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), color 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  },
  hoverInstant: {
    [HOVER]: {
      ':hover': { transitionDuration: '0s' },
    },
    ':active': { transitionDuration: '0s' },
  },
  headerTarget: {
    [TOUCH]: { width: 32, minWidth: 32, height: 32 },
  },
});
