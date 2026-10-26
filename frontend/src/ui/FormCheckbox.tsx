import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';

export interface FormCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Secondary line under the label, for a consequence the label cannot carry. */
  hint?: string;
  disabled?: boolean;
  className?: string;
  /** StyleX overrides from the caller, applied last. */
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  root: {
    display: 'flex',
    cursor: 'pointer',
    userSelect: 'none',
    alignItems: 'flex-start',
    gap: 8,
  },
  disabled: {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
  input: {
    marginTop: 1,
    height: 14,
    width: 14,
    flexShrink: 0,
    cursor: 'pointer',
    borderRadius: 4,
    borderColor: colors['--color-border-secondary'],
    backgroundColor: 'transparent',
    accentColor: colors['--action-primary'],
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
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 12,
    color: colors['--text-secondary'],
  },
  hint: {
    fontSize: 11,
    color: colors['--text-tertiary'],
  },
});

/**
 * Labelled checkbox for forms and dialogs.
 *
 * `BuyerlyCheckbox` is built for data rows — it stays transparent until the row
 * is hovered or the box is checked — so it cannot carry a standing form
 * choice. This one is always visible, always labelled, and operable by
 * keyboard through the native input.
 */
export const FormCheckbox: React.FC<FormCheckboxProps> = ({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className = '',
  xstyle,
}) => (
  <label {...withClassName(stylex.props(styles.root, disabled && styles.disabled, xstyle), className)}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      {...stylex.props(styles.input)}
    />
    <span {...stylex.props(styles.text)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      {hint && <span {...stylex.props(styles.hint)}>{hint}</span>}
    </span>
  </label>
);
