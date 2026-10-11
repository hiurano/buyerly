import React from 'react';
import { LinearPlusIcon } from '@/icons/LinearIcons';
import { Tooltip } from '@/ui/Tooltip';

export interface HeaderCreateButtonProps {
  /** Short label, also the accessible name: "New rule", "Add account". */
  label: string;
  /** Tooltip text, e.g. "Create new rule". */
  tooltip: string;
  /** Key shown in the tooltip, when the action has one. */
  shortcut?: string;
  onClick: () => void;
}

/**
 * The page header's create action, like Linear's "New project": a round,
 * borderless 28px "+" that shows its label above 1024px and grows to a
 * finger-sized 40px target on touch screens. Shown at every width.
 */
export const HeaderCreateButton: React.FC<HeaderCreateButtonProps> = ({ label, tooltip, shortcut, onClick }) => (
  <Tooltip content={tooltip} shortcut={shortcut}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--text-tertiary)] outline-none transition-all hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] min-[1025px]:w-auto min-[1025px]:gap-[6px] min-[1025px]:pl-[8px] min-[1025px]:pr-[10px] [@media(hover:none)_and_(pointer:coarse)]:h-10 [@media(hover:none)_and_(pointer:coarse)]:min-w-10"
    >
      <LinearPlusIcon size={14} />
      <span aria-hidden="true" className="hidden whitespace-nowrap text-[12px] font-medium min-[1025px]:inline">
        {label}
      </span>
    </button>
  </Tooltip>
);
