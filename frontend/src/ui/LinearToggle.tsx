import React from 'react';
import { Tooltip } from './Tooltip';

interface LinearToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltipContent?: string;
  disabled?: boolean;
  className?: string;
}

export const LinearToggle: React.FC<LinearToggleProps> = ({
  checked,
  onChange,
  tooltipContent,
  disabled = false,
  className = '',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      onChange(!checked);
    }
  };

  const defaultTooltip = checked ? 'Pause campaign' : 'Resume campaign';

  const toggleElement = (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={-1}
      onClick={handleClick}
      style={{
        width: '28px',
        height: '16px',
        borderRadius: '72px',
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: checked
          ? '#eab308'
          : 'var(--toggle-unchecked-bg)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.15s ease-out',
        userSelect: 'none',
      }}
      className={`group/toggle hover:brightness-110 ${className}`}
    >
      {/* Invisible Native Input */}
      <input
        type="checkbox"
        tabIndex={-1}
        checked={checked}
        aria-checked={checked}
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
