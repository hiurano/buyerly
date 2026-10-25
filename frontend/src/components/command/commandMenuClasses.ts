/**
 * Linear's command menu as Tailwind classes, for Ctrl/Cmd+K and Open: panel,
 * field, groups, rows, keys and the note that stands in for an empty list.
 * Measured on Linear in both themes (#311). The selection's command menu
 * (src/ui/SelectionCommandMenu.tsx) draws the same look in StyleX; these go
 * when the command menus move to StyleX (#501).
 */
export const COMMAND_MENU_CLASSES = {
  /** The floating panel; each menu says where it sits and how wide it is. */
  surface: 'animate-scale-in overflow-hidden rounded-[12px] border border-[var(--command-menu-border)] bg-[var(--command-menu-bg)] [box-shadow:var(--command-menu-shadow)]',
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
