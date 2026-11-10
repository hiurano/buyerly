import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { Tooltip } from './Tooltip';
import css from './BuyerlyToggle.module.css';

const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

interface BuyerlyToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Accessible name; falls back to the tooltip text. */
  label?: string;
  tooltipContent?: string;
  disabled?: boolean;
  /** A write is in flight: the control is inert but not reported as disabled. */
  busy?: boolean;
  className?: string;
  /** "settings": Linear's larger settings switch (30x20); otherwise its Display options one (22x14). */
  size?: 'default' | 'settings';
}

const styles = stylex.create({
  /* BuyerlyToggle, the only switch: one size everywhere, as in Linear's Display
     options (22×14, knob 10, inset 2). Colours come from tokens.stylex.ts. */
  toggle: {
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
    width: 22,
    height: 14,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 72,
    backgroundColor: colors['--toggle-unchecked-bg'],
    cursor: 'pointer',
    userSelect: 'none',
    transition: {
      default: 'background-color 150ms ease-out, opacity 150ms ease-out',
      [REDUCED_MOTION]: 'none',
    },
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': colors['--focus-ring-color'] },
    outlineOffset: { default: null, ':focus-visible': 2 },
  },
  uncheckedInteractive: {
    backgroundColor: {
      default: colors['--toggle-unchecked-bg'],
      ':hover': colors['--toggle-unchecked-hover-bg'],
    },
  },
  checked: {
    backgroundColor: colors['--toggle-checked-bg'],
  },
  checkedInteractive: {
    backgroundColor: {
      default: colors['--toggle-checked-bg'],
      ':hover': colors['--toggle-checked-hover-bg'],
    },
  },
  settings: {
    width: 30,
    height: 20,
    /* Linear's switch sits in a 36px box, so it ends 6px before the row's padding. */
    marginRight: 6,
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  busy: {
    opacity: 0.7,
    cursor: 'progress',
  },
  tooltipTarget: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** The only switch in Buyerly, in Linear's two sizes (Display options, settings); colours in tokens.css. */
export const BuyerlyToggle: React.FC<BuyerlyToggleProps> = ({
  checked,
  onChange,
  label,
  tooltipContent,
  disabled = false,
  busy = false,
  className = '',
  size = 'default',
}) => {
  const interactive = Boolean(onChange) && !disabled && !busy;
  const isSettings = size === 'settings';
  const canHover = !disabled && !busy;
  const toggle = () => {
    if (interactive && onChange) onChange(!checked);
  };

  const toggleElement = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      aria-label={label ?? tooltipContent}
      tabIndex={interactive ? 0 : -1}
      {...withClassName(stylex.props(
          styles.toggle,
          !checked && canHover && styles.uncheckedInteractive,
          checked && (canHover ? styles.checkedInteractive : styles.checked),
          isSettings && styles.settings,
          disabled && styles.disabled,
          busy && styles.busy,
        ), css.toggle, isSettings && css.settings, className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
    />
  );

  if (tooltipContent) {
    return (
      <Tooltip content={tooltipContent} side="top" sideOffset={6}>
        <div {...stylex.props(styles.tooltipTarget)}>
          {toggleElement}
        </div>
      </Tooltip>
    );
  }

  return toggleElement;
};
