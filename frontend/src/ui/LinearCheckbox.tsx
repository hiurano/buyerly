import React from 'react';

interface LinearCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export const LinearCheckbox: React.FC<LinearCheckboxProps> = ({
  checked,
  indeterminate = false,
  onChange,
  className = '',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onChange) {
      onChange(!checked);
    }
  };

  return (
    <div
      data-checked={checked || indeterminate ? 'true' : 'false'}
      onClick={handleClick}
      style={{
        opacity: checked || indeterminate ? 1 : undefined,
        cursor: 'default',
      }}
      className={`flex h-[22px] w-[18px] shrink-0 items-center justify-center opacity-0 transition-opacity duration-75 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 ${
        checked || indeterminate ? '!opacity-100' : ''
      }`}
    >
      <div
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '3px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor:
            checked || indeterminate
              ? '#eab308'
              : 'var(--checkbox-border-rest)',
          backgroundColor:
            checked || indeterminate
              ? '#eab308'
              : 'transparent',
          transition: 'background-color 80ms ease-out, border-color 80ms ease-out',
          cursor: 'default',
          userSelect: 'none',
        }}
        className={`hover:!border-[#eab308] ${className}`}
      >
        {/* Invisible Native Input for accessibility */}
        <input
          type="checkbox"
          tabIndex={-1}
          checked={checked}
          aria-checked={indeterminate ? 'mixed' : checked}
          aria-label="Select row"
          onChange={() => {}}
          className="sr-only"
        />

        {/* Exact Linear Checked SVG Checkmark (with high contrast dark fill on yellow) */}
        {checked && !indeterminate && (
          <div className="flex h-[9px] w-[10px] items-center justify-center text-[#09090a]">
            <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor">
              <path strokeWidth="0.2" d="M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879C8.11645 1.0688 8.11643 1.06882 8.11642 1.06883L3.46975 5.70757Z" />
            </svg>
          </div>
        )}

        {/* Exact Linear Indeterminate SVG Dash */}
        {indeterminate && (
          <div className="flex h-[2px] w-[6px] items-center justify-center text-[#09090a]">
            <svg width="6" height="2" viewBox="0 0 6 2" fill="currentColor">
              <rect y="0.25" width="6" height="1.5" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
