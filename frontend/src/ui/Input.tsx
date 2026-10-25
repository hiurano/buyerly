import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const styles = stylex.create({
  input: {
    height: 36,
    minWidth: 0,
    borderRadius: radii['--control-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--color-border-secondary'],
      ':focus': colors['--focus-ring-color'],
    },
    backgroundColor: colors['--bg-canvas'],
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 14,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus': `0 0 0 1px ${colors['--focus-ring-color']}`,
    },
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    cursor: {
      default: null,
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: null,
      ':disabled': 0.5,
    },
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
});

/** Shared text input for authenticated product surfaces. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      {...withClassName(stylex.props(styles.input), `ui-input ${className}`.trim())}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
