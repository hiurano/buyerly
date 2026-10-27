import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import * as stylex from '@stylexjs/stylex';
import { colors, layout } from '@/styles/tokens.stylex';
import type { SelectionAction } from '@/ui/useRowSelection';
import { withClassName } from '@/ui/withClassName';

/** The sans stack the app's controls use. */
const SANS = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const kbd = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors['--command-menu-kbd-border'],
  fontSize: 12,
  color: colors['--text-tertiary'],
} as const;

/**
 * Linear's command menu, shared by Ctrl/Cmd+K and the selection's actions so
 * the two read as one control: panel, field, rows, keys and the note that
 * stands in for an empty list. Measured on Linear in both themes (#311).
 */
const styles = stylex.create({
  backdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: layout['--layer-command-menu'],
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: '13vh',
  },
  /** The floating panel. */
  surface: {
    width: '100%',
    maxWidth: 720,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--command-menu-border'],
    backgroundColor: colors['--command-menu-bg'],
    boxShadow: colors['--command-menu-shadow'],
  },
  /** Around the field: Linear's 6px inset, with no rule under it. */
  field: {
    flexShrink: 0,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
  },
  input: {
    height: 40,
    width: '100%',
    backgroundColor: 'transparent',
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    color: colors['--text-secondary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  list: {
    maxHeight: 'min(404px, 60vh)',
    overflowY: 'auto',
    paddingLeft: 6,
    paddingRight: 6,
    paddingBottom: 6,
  },
  /** 46px rows; the selected one gets a rounded fill inset 2px top and bottom. */
  item: {
    position: 'relative',
    marginLeft: 0,
    marginRight: 0,
    display: 'flex',
    height: 46,
    cursor: 'default',
    userSelect: 'none',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    fontWeight: 450,
    color: colors['--command-menu-text'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::before': {
      content: "''",
      pointerEvents: 'none',
      position: 'absolute',
      left: 0,
      right: 0,
      top: 2,
      bottom: 2,
      borderRadius: 8,
      backgroundColor: {
        default: null,
        ':is([data-selected=true])': colors['--command-menu-row-selected-bg'],
      },
    },
  },
  /** Linear draws a row's icon in the row's own text color. */
  icon: {
    position: 'relative',
    display: 'flex',
    height: 16,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'relative',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  keys: {
    position: 'relative',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 3,
  },
  /** A row's keys on the right. */
  kbd: {
    ...kbd,
    height: 23,
    minWidth: 20,
    borderRadius: 3,
    paddingLeft: 4,
    paddingRight: 4,
    fontFamily: SANS,
    fontWeight: 450,
    lineHeight: '13px',
  },
  note: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 24,
    paddingBottom: 24,
    textAlign: 'center',
    fontSize: 12,
    color: colors['--text-muted'],
  },
  footerKeys: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  /** The footer's smaller boxed keys: 19px high, 2px inside. */
  footerKbd: {
    ...kbd,
    height: 19,
    minWidth: 18,
    borderRadius: 4,
    padding: 2,
    fontFamily: SANS,
    fontWeight: 500,
    lineHeight: 1,
  },
  scope: {
    display: 'flex',
    flexShrink: 0,
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 12,
  },
  scopeChip: {
    display: 'flex',
    height: 22,
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    backgroundColor: colors['--command-menu-chip-bg'],
    paddingLeft: 6,
    paddingRight: 6,
    fontSize: 12,
    color: colors['--command-menu-text'],
  },
  scopePrefix: {
    flexShrink: 0,
    fontWeight: 500,
  },
  scopeLabel: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  scopeClear: {
    marginLeft: 2,
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
  },
  scopeClearKey: {
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
  },
});

/** The footer's smaller boxed keys: 19px high, 2px inside. */
export const CommandMenuFooterKeys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span {...stylex.props(styles.footerKeys)} aria-hidden="true">
    {keys.map((key) => (
      <kbd key={key} {...stylex.props(styles.footerKbd)}>
        {key}
      </kbd>
    ))}
  </span>
);

/** What a scoped menu acts on: one record as "RUL-07 ⋅ Name", or a count. */
export interface CommandMenuScope {
  /** Linear's identifier before the dot, when the record has one. */
  prefix?: string;
  label: string;
}

/**
 * Linear's scope chip over a scoped command menu: the record, or how many,
 * in a 22px pill with ⌫ that drops the scope.
 */
export const CommandMenuScopeChip: React.FC<{ scope: CommandMenuScope; onClear: () => void }> = ({ scope, onClear }) => (
  <div {...stylex.props(styles.scope)}>
    <span {...stylex.props(styles.scopeChip)}>
      {scope.prefix && <span {...stylex.props(styles.scopePrefix)}>{`${scope.prefix} ⋅`}</span>}
      <span {...stylex.props(styles.scopeLabel)}>{scope.label}</span>
      <button
        type="button"
        aria-label="Remove scope"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
        {...stylex.props(styles.scopeClear)}
      >
        <kbd {...stylex.props(styles.scopeClearKey)} aria-hidden="true">⌫</kbd>
      </button>
    </span>
  </div>
);

interface SelectionCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the actions apply to: one record by name, or "3 campaigns". */
  scope: CommandMenuScope;
  actions: SelectionAction[];
  /** ⌫ on the chip, or Backspace in an empty field: the same menu without the scope. */
  onClearScope?: () => void;
}

/**
 * Linear's command menu scoped to the current selection: the scope chip over
 * the field, then each action with the letter that also runs it from the
 * list, with no group heading. Typing filters; Esc closes and keeps the selection.
 */
export const SelectionCommandMenu: React.FC<SelectionCommandMenuProps> = ({
  open,
  onOpenChange,
  scope,
  actions,
  onClearScope,
}) => {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  if (!open) return null;

  const clearScope = () => {
    onOpenChange(false);
    onClearScope?.();
  };
  const scopeName = scope.prefix ? `${scope.prefix} ${scope.label}` : scope.label;

  // Portalled: the list's own stacking context must not let the app sidebar paint over it.
  return createPortal(
    <div
      {...stylex.props(styles.backdrop)}
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        {...withClassName(stylex.props(styles.surface), 'animate-scale-in')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Command
          label={`Actions for ${scopeName}`}
          loop
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
            } else if (event.key === 'Backspace' && !query && onClearScope) {
              event.preventDefault();
              clearScope();
            }
          }}
        >
          <CommandMenuScopeChip scope={scope} onClear={clearScope} />
          <div {...stylex.props(styles.field)}>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command or search…"
              {...stylex.props(styles.input)}
            />
          </div>
          <Command.List {...stylex.props(styles.list)}>
            <Command.Empty {...stylex.props(styles.note)}>
              No matching actions.
            </Command.Empty>
            {actions.map((action) => (
              <Command.Item
                key={action.id}
                value={action.label}
                onSelect={() => {
                  onOpenChange(false);
                  action.run();
                }}
                {...stylex.props(styles.item)}
              >
                <span {...stylex.props(styles.icon)} aria-hidden="true">
                  {action.icon}
                </span>
                <span {...stylex.props(styles.label)}>{action.label}</span>
                <span {...stylex.props(styles.keys)}>
                  {action.withModifier && <kbd {...stylex.props(styles.kbd)}>Ctrl</kbd>}
                  <kbd {...stylex.props(styles.kbd)}>
                    {action.shortcut.length === 1 ? action.shortcut.toUpperCase() : action.shortcut}
                  </kbd>
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  );
};
