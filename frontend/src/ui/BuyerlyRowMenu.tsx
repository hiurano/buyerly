import React from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/ui/ContextMenu';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/ui/DropdownMenu';

const styles = stylex.create({
  trigger: {
    display: 'contents',
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  disabled: {
    opacity: 0.5,
  },
});

/** One line of a row's menu; `'separator'` draws Linear's 12px divider. */
export type RowMenuEntry =
  | 'separator'
  | {
    label: string;
    icon?: React.ReactNode;
    /** Keys printed at the right, as Linear's: ['⇧', 'D']. */
    shortcut?: string[];
    disabled?: boolean;
    onSelect?: () => void;
    /** A submenu, opened from a trailing ▶. */
    items?: RowMenuEntry[];
  };

/** Drops separators at either end and doubled ones, left when entries are hidden. */
function tidy(entries: RowMenuEntry[]): RowMenuEntry[] {
  return entries.filter((entry, index, all) => (
    entry !== 'separator' || (index > 0 && index < all.length - 1 && all[index - 1] !== 'separator')
  ));
}

function EntryBody({ entry, submenu = false }: { entry: Exclude<RowMenuEntry, 'separator'>; submenu?: boolean }) {
  return (
    <>
      <span className="buyerly-row-menu-main">
        {entry.icon && <span className="buyerly-row-menu-icon">{entry.icon}</span>}
        <span {...stylex.props(styles.label)}>{entry.label}</span>
      </span>
      {(entry.shortcut || submenu) && (
        <span className="buyerly-row-menu-trail">
          {entry.shortcut && (
            <span className="buyerly-row-menu-keys" aria-label={entry.shortcut.join(' ')}>
              {entry.shortcut.map((key) => <kbd key={key}>{key}</kbd>)}
            </span>
          )}
          {submenu && <span className="buyerly-row-menu-chevron" aria-hidden="true">▶</span>}
        </span>
      )}
    </>
  );
}

function ContextEntries({ entries }: { entries: RowMenuEntry[] }) {
  return (
    <>
      {tidy(entries).map((entry, index) => {
        if (entry === 'separator') return <ContextMenuSeparator key={`separator-${index}`} className="buyerly-row-menu-separator" />;
        if (entry.items) {
          return (
            <ContextMenuSub key={entry.label}>
              <ContextMenuSubTrigger disabled={entry.disabled}>
                <EntryBody entry={entry} submenu />
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="buyerly-row-menu" alignOffset={-6.5} style={{ width: 'max-content', minWidth: 0, padding: '6px 0' }}>
                <ContextEntries entries={entry.items} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          );
        }
        return (
          <ContextMenuItem
            key={entry.label}
            disabled={entry.disabled}
            onSelect={entry.onSelect}
            xstyle={entry.disabled && styles.disabled}
          >
            <EntryBody entry={entry} />
          </ContextMenuItem>
        );
      })}
    </>
  );
}

/**
 * A row or card with Linear's right-click menu, measured on an issue on
 * 2026-10-24: rows 32px, a 16px icon and 8px gap, keys and a ▶ at the right,
 * 12px dividers with a 0.5px line, the menu as wide as its longest line.
 * The trigger takes no box of its own, so grid rows and cards keep their layout.
 */
export function BuyerlyRowContextMenu({ entries, children }: { entries: RowMenuEntry[]; children: React.ReactNode }) {
  if (entries.length === 0) return <>{children}</>;
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger {...stylex.props(styles.trigger)}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="buyerly-row-menu" style={{ width: 'max-content', minWidth: 0, marginLeft: 2 }}>
        <ContextEntries entries={entries} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same entries in a "…" dropdown, for rows that have one too (Ad accounts). */
export function DropdownEntries({ entries }: { entries: RowMenuEntry[] }) {
  return (
    <>
      {tidy(entries).map((entry, index) => (
        entry === 'separator'
          ? <DropdownMenuSeparator key={`separator-${index}`} />
          : (
            <DropdownMenuItem
              key={entry.label}
              disabled={entry.disabled}
              onSelect={entry.onSelect}
              xstyle={entry.disabled && styles.disabled}
            >
              <EntryBody entry={entry} />
            </DropdownMenuItem>
          )
      ))}
    </>
  );
}
