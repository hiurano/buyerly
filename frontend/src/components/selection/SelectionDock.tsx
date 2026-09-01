import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LinearCommandIcon, LinearCloseIcon } from '@/icons/LinearIcons';
import { Tooltip } from '@/ui/Tooltip';

export const SelectionDock: React.FC = () => {
  const { selectedCampaignIds, clearCampaignSelection } = useAppStore();
  const count = selectedCampaignIds.length;

  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-0 right-0 z-[94] flex justify-center pointer-events-none select-none">
      {/* Animated Floating Pill Container */}
      <div
        style={{
          height: '44px',
          borderRadius: '9999px',
          backgroundColor: 'var(--dock-bg)',
          border: '1px solid var(--color-border-secondary)',
          boxShadow: 'var(--dropdown-shadow)',
          padding: '8px',
          gap: '8px',
        }}
        className="pointer-events-auto flex items-center justify-center animate-scale-in"
      >
        {/* 1. "N selected" Badge */}
        <span
          style={{
            fontSize: '12px',
            lineHeight: '18px',
            color: 'var(--text-primary)',
            padding: '0px 2px 0px 12px',
          }}
          className="flex items-center"
        >
          <span className="font-medium">{count}</span>
          <span>&nbsp;selected</span>
        </span>

        {/* 2. Actions Button Group */}
        <div className="flex items-center gap-1.5">
          {/* "Actions" Command Button */}
          <Tooltip content="Open command menu" shortcut="⌘ K">
            <button
              type="button"
              aria-label="Open command menu"
              style={{
                height: '28px',
                borderRadius: '9999px',
                padding: '0px 10px',
                backgroundColor: 'var(--dock-btn-bg)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 500,
                gap: '6px',
              }}
              className="inline-flex items-center justify-center transition-colors duration-150 hover:bg-[var(--item-hover-bg)] outline-none"
            >
              <span className="flex h-[14px] w-[14px] items-center justify-center text-[var(--text-tertiary)]">
                <LinearCommandIcon size={14} />
              </span>
              <span>Actions</span>
            </button>
          </Tooltip>

          {/* "Clear selected" (Close 'X') Button */}
          <Tooltip content="Clear selected" shortcut="Esc">
            <button
              type="button"
              aria-label="Clear selected"
              onClick={clearCampaignSelection}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '9999px',
                backgroundColor: 'transparent',
                color: 'var(--text-tertiary)',
              }}
              className="inline-flex items-center justify-center transition-colors duration-150 hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] outline-none"
            >
              <span className="flex h-[12px] w-[12px] items-center justify-center">
                <LinearCloseIcon size={12} />
              </span>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
