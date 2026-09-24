import React from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import type { SelectionAction } from '@/ui/useRowSelection';

interface SelectionCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the actions apply to, e.g. "3 campaigns". */
  scopeLabel: string;
  actions: SelectionAction[];
}

/**
 * Linear's command menu scoped to the current selection: a search field, the
 * selection named as the group heading, and each action with the letter that
 * also runs it from the list. Typing filters; Esc closes and keeps the selection.
 */
export const SelectionCommandMenu: React.FC<SelectionCommandMenuProps> = ({
  open,
  onOpenChange,
  scopeLabel,
  actions,
}) => {
  if (!open) return null;

  // Portalled: the list's own stacking context must not let the app sidebar paint over it.
  return createPortal(
    <div
      className="fixed inset-0 z-[var(--layer-command-menu)] flex items-start justify-center px-4 pt-[13vh]"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        className="animate-scale-in w-full max-w-[720px] overflow-hidden rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] shadow-[var(--command-menu-shadow)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Command
          label={`Actions for ${scopeLabel}`}
          loop
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
        >
          <Command.Input
            autoFocus
            placeholder="Type a command or search…"
            className="h-10 w-full bg-transparent px-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
          />
          <Command.List className="max-h-[min(400px,60vh)] overflow-y-auto pb-1.5">
            <Command.Empty className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
              No matching actions.
            </Command.Empty>
            <Command.Group
              heading={scopeLabel}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[var(--text-tertiary)]"
            >
              {actions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.label}
                  onSelect={() => {
                    onOpenChange(false);
                    action.run();
                  }}
                  className="mx-0 flex h-[46px] cursor-default items-center gap-3 rounded-[var(--control-border-radius)] px-3 text-[13px] text-[var(--text-primary)] data-[selected=true]:bg-[var(--data-row-hover-bg)]"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-tertiary)]" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  {action.withModifier && (
                    <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[var(--color-border-secondary)] px-1 font-sans text-[11px] text-[var(--text-tertiary)]">
                      Ctrl
                    </kbd>
                  )}
                  <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[var(--color-border-secondary)] px-1 font-sans text-[11px] text-[var(--text-tertiary)]">
                    {action.shortcut.length === 1 ? action.shortcut.toUpperCase() : action.shortcut}
                  </kbd>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  );
};
