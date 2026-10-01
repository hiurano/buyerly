import React from 'react';
import { Tooltip } from './Tooltip';

interface LinearToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** `default` for rows and settings, `small` inside view menus (Display options). */
  size?: 'default' | 'small';
  /** Accessible name; falls back to the tooltip text. */
  label?: string;
  tooltipContent?: string;
  disabled?: boolean;
  /** A write is in flight: the control is inert but not reported as disabled. */
  busy?: boolean;
  className?: string;
}

/** The only switch in Buyerly; sizes measured in Linear, colours in tokens.css. */
export const LinearToggle: React.FC<LinearToggleProps> = ({
  checked,
  onChange,
  size = 'default',
  label,
  tooltipContent,
  disabled = false,
  busy = false,
  className = '',
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
      data-size={size}
      className={`linear-toggle ${className}`.trim()}
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
        <div className="inline-flex items-center justify-center">
          {toggleElement}
        </div>
      </Tooltip>
    );
  }

  return toggleElement;
};
