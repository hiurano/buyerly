import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `danger` is only for the confirming button of a destructive action. */
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'compact' | 'default';
  /** 40px tall on a touch screen, for a button a finger taps. */
  touchHeight?: boolean;
  /** Styles from the parent, applied last. */
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    fontSize: 12,
    fontWeight: 500,
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    outline: {
      default: null,
      ':focus-visible': '2px solid transparent',
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 2,
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    cursor: {
      default: null,
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: null,
      ':disabled': 0.5,
    },
  },
  primary: {
    borderColor: 'transparent',
    backgroundColor: {
      default: colors['--button-primary-bg'],
      ':hover': colors['--button-primary-hover-bg'],
    },
    color: colors['--button-primary-text'],
  },
  secondary: {
    borderColor: colors['--color-border-secondary'],
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  danger: {
    borderColor: 'transparent',
    backgroundColor: {
      default: colors['--action-danger'],
      ':hover': colors['--action-danger-hover'],
    },
    color: colors['--action-danger-text'],
  },
  compact: {
    height: 28,
    paddingLeft: 12,
    paddingRight: 12,
  },
  regular: {
    height: 32,
    paddingLeft: 14,
    paddingRight: 14,
  },
  // 40px under a finger, for the callers that ask for it.
  compactTouch: {
    height: {
      default: 28,
      '@media (hover: none) and (pointer: coarse)': 40,
    },
  },
  regularTouch: {
    height: {
      default: 32,
      '@media (hover: none) and (pointer: coarse)': 40,
    },
  },
});

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'default', touchHeight = false, xstyle, className = '', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        {...withClassName(
          stylex.props(
            styles.root,
            styles[variant],
            size === 'compact' ? styles.compact : styles.regular,
            touchHeight && (size === 'compact' ? styles.compactTouch : styles.regularTouch),
            xstyle,
          ),
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
