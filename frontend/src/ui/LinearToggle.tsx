import React from 'react';
import { Tooltip } from './Tooltip';

interface LinearToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  tooltipContent?: string;
  disabled?: boolean;
  /** A write is in flight: the control is inert but not reported as disabled. */
  busy?: boolean;
  className?: string;
}

export const LinearToggle: React.FC<LinearToggleProps> = ({
  checked,
  onChange,
  tooltipContent,
  disabled = false,
  busy = false,
  className = '',
}) => {
  const interactive = Boolean(onChange) && !disabled && !busy;
  const toggle = () => {
    if (interactive && onChange) onChange(!checked);
  };
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  const defaultTooltip = checked ? 'Pause campaign' : 'Resume campaign';
  const accessibleLabel = tooltipContent || defaultTooltip;

  const toggleElement = (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-busy={busy || undefined}
      aria-label={accessibleLabel}
      tabIndex={interactive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      style={{
        width: '28px',
        height: '16px',
        borderRadius: '72px',
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : busy ? 'progress' : 'pointer',
        backgroundColor: checked
          ? '#eab308'
          : 'var(--toggle-unchecked-bg)',
        opacity: disabled ? 0.5 : busy ? 0.7 : 1,
        transition: 'background-color 0.15s ease-out',
        userSelect: 'none',
      }}
      className={`group/toggle hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring-color)] ${className}`}
    >
      {/* Invisible Native Input */}
      <input
        type="checkbox"
        tabIndex={-1}
        checked={checked}
        aria-checked={checked}
        aria-label={accessibleLabel}
        disabled={disabled}
        onChange={() => {}}
        className="sr-only"
      />

      {/* Thumb with Dual-Edge Stretch Transition */}
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          position: 'absolute',
          top: '2px',
          left: checked ? '14px' : '2px',
          transition: checked
            ? 'left 0.1s ease-out 0.03s, width 0.08s ease-out 0s'
            : 'left 0.1s ease-out 0s, width 0.08s ease-out 0.03s',
        }}
        className="shadow-sm"
      />
    </div>
  );

  if (tooltipContent !== undefined || defaultTooltip) {
    return (
      <Tooltip content={tooltipContent || defaultTooltip} side="top" sideOffset={6}>
        <div className="inline-flex items-center justify-center">
          {toggleElement}
        </div>
      </Tooltip>
    );
  }

  return toggleElement;
};
