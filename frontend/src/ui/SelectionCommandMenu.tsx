import React from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import type { SelectionAction } from '@/ui/useRowSelection';

/**
 * Linear's command menu, shared by Ctrl/Cmd+K and the selection's actions so
 * the two read as one control: panel, field, groups, rows, keys and the note
 * that stands in for an empty list. Measured on Linear in both themes (#311).
 */
export const COMMAND_MENU_CLASSES = {
  /** The floating panel; each menu says where it sits and how wide it is. */
  surface: 'animate-scale-in overflow-hidden rounded-[12px] border border-[var(--command-menu-border)] bg-[var(--command-menu-bg)] shadow-[var(--command-menu-shadow)]',
  /** Around the field: Linear's 6px inset, with no rule under it. */
  field: 'shrink-0 px-1.5 pt-1.5',
  input: 'h-10 w-full bg-transparent px-3 text-[13px] text-[var(--text-secondary)] placeholder-[var(--text-muted)] outline-none',
  list: 'max-h-[min(404px,60vh)] overflow-y-auto px-1.5 pb-1.5',
  group: '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:leading-[14px] [&_[cmdk-group-heading]]:text-[var(--text-tertiary)]',
  /** 46px rows; the selected one gets a rounded fill inset 2px top and bottom. */
  item: 'relative mx-0 flex h-[46px] cursor-default select-none items-center gap-3 px-3 text-[13px] font-[450] text-[var(--command-menu-text)] outline-none before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-[2px] before:rounded-[8px] data-[selected=true]:before:bg-[var(--command-menu-row-selected-bg)] [&>*]:relative',
  /** Linear draws a row's icon in the row's own text color. */
  icon: 'flex h-4 w-4 shrink-0 items-center justify-center',
  /** A row's keys on the right. */
  kbd: 'inline-flex h-[23px] min-w-[20px] items-center justify-center rounded-[3px] border border-[var(--command-menu-kbd-border)] px-1 font-sans text-[12px] font-[450] leading-[13px] text-[var(--text-tertiary)]',
  note: 'px-3 py-6 text-center text-[12px] text-[var(--text-muted)]',
} as const;

/** The footer's smaller boxed keys: 19px high, 2px inside. */
export const CommandMenuFooterKeys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="flex items-center gap-[3px]" aria-hidden="true">
    {keys.map((key) => (
      <kbd
        key={key}
        className="inline-flex h-[19px] min-w-[18px] items-center justify-center rounded-[3px] border border-[var(--command-menu-kbd-border)] p-0.5 font-sans text-[12px] font-medium leading-none text-[var(--text-tertiary)]"
      >
        {key}
      </kbd>
    ))}
  </span>
);

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
        className={`w-full max-w-[720px] ${COMMAND_MENU_CLASSES.surface}`}
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
          <div className={COMMAND_MENU_CLASSES.field}>
            <Command.Input
              autoFocus
              placeholder="Type a command or search…"
              className={COMMAND_MENU_CLASSES.input}
            />
          </div>
          <Command.List className={COMMAND_MENU_CLASSES.list}>
            <Command.Empty className={COMMAND_MENU_CLASSES.note}>
              No matching actions.
            </Command.Empty>
            <Command.Group heading={scopeLabel} className={COMMAND_MENU_CLASSES.group}>
              {actions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.label}
                  onSelect={() => {
                    onOpenChange(false);
                    action.run();
                  }}
                  className={COMMAND_MENU_CLASSES.item}
                >
                  <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  <span className="flex shrink-0 items-center gap-[3px]">
                    {action.withModifier && <kbd className={COMMAND_MENU_CLASSES.kbd}>Ctrl</kbd>}
                    <kbd className={COMMAND_MENU_CLASSES.kbd}>
                      {action.shortcut.length === 1 ? action.shortcut.toUpperCase() : action.shortcut}
                    </kbd>
                  </span>
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
