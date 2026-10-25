import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from './Tooltip';

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
      className={`buyerly-toggle ${size === 'settings' ? 'buyerly-toggle--settings ' : ''}${className}`.trim()}
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
