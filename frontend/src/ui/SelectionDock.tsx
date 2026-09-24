import React from 'react';
import { LinearCommandIcon, LinearCloseIcon } from '@/icons/LinearIcons';
import { Tooltip } from '@/ui/Tooltip';

interface SelectionDockProps {
  count: number;
  onOpenActions: () => void;
  onClear: () => void;
}

/**
 * Linear's selection dock. It is placed inside the list it acts on (the
 * nearest positioned ancestor), centred over that list rather than the window,
 * and lets clicks through everywhere except the pill itself.
 */
export const SelectionDock: React.FC<SelectionDockProps> = ({ count, onOpenActions, onClear }) => {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-2 right-2 z-[94] flex select-none justify-center">
      <div
        role="toolbar"
        aria-label={`${count} selected`}
        className="selection-dock-enter pointer-events-auto flex h-11 items-center gap-2 rounded-full border border-[var(--dock-border)] bg-[var(--dock-bg)] p-2 shadow-[var(--dropdown-shadow)]"
      >
        <span className="pl-3 pr-0.5 text-[12px] leading-[18px] text-[var(--text-primary)] tabular-nums" aria-live="polite">
          {count}&nbsp;selected
        </span>

        <Tooltip content="Open command menu" shortcut="Ctrl K">
          <button
            type="button"
            aria-label="Open command menu"
            onClick={onOpenActions}
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-[var(--color-border-secondary)] bg-[var(--dock-bg)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] outline-none transition-colors duration-150 hover:bg-[var(--item-hover-bg)] focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center text-[var(--text-tertiary)]" aria-hidden="true">
              <LinearCommandIcon size={14} />
            </span>
            Actions
          </button>
        </Tooltip>

        <Tooltip content="Clear selected" shortcut="Esc">
          <button
            type="button"
            aria-label="Clear selected"
            onClick={onClear}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--dock-clear-btn-bg)] text-[var(--text-primary)] outline-none transition-colors duration-150 hover:bg-[var(--item-hover-bg)] focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
          >
            <LinearCloseIcon size={12} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
