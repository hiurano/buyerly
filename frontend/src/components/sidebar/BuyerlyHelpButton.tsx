import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { GO_TO_KEYS } from '@/lib/shortcuts';
import { matchesTyped } from '@/lib/inbox';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import changelogLatest from '@/lib/changelogLatest.json';
import { useCommandMenuStore } from '@/models/commandMenuStore';
import { openSettings } from '@/lib/routing';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  // Linear keeps the field off-screen until something is typed, then shows it as the first row.
  searchHidden: {
    position: 'absolute',
    top: 0,
    left: -100000,
  },
  // Flush with the menu's top edge, over its 6px padding; the rows follow 6px below.
  search: {
    marginTop: -6,
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    paddingTop: 0,
    paddingRight: 12,
    paddingBottom: 0,
    paddingLeft: 14,
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: colors['--help-menu-divider'],
  },
  input: {
    minWidth: 0,
    flexGrow: 1,
    height: 36,
    paddingTop: 10,
    paddingRight: 0,
    paddingBottom: 9,
    paddingLeft: 0,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 400,
    lineHeight: '19.5px',
    color: colors['--help-menu-fg'],
    caretColor: colors['--help-focus-ring'],
    '::placeholder': {
      color: colors['--help-menu-secondary'],
    },
  },
  key: {
    display: 'inline-flex',
    minWidth: 18,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    paddingTop: 2,
    paddingRight: 2,
    paddingBottom: 2,
    paddingLeft: 2,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors['--help-menu-divider'],
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 400,
    lineHeight: '12.1px',
    color: colors['--help-menu-secondary'],
  },
  searchOverEmpty: {
    marginBottom: 0,
  },
  // Linear's note has no padding under it: it takes the menu's.
  empty: {
    marginBottom: -6,
    display: 'flex',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingRight: 14,
    paddingBottom: 4,
    paddingLeft: 14,
    boxSizing: 'border-box',
    fontSize: 13,
    fontWeight: 450,
    color: colors['--help-menu-empty'],
  },
  row: {
    position: 'relative',
    display: 'flex',
    height: 32,
    alignItems: 'center',
    paddingTop: 0,
    paddingRight: 18,
    paddingBottom: 0,
    paddingLeft: 14,
    cursor: 'default',
    userSelect: 'none',
    fontSize: 13,
    fontWeight: 450,
    color: colors['--help-menu-fg'],
  },
  rowActive: {
    color: colors['--help-menu-fg-highlighted'],
  },
  // The rounded fill inside the row, as in every Linear menu.
  pill: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 6,
    right: 6,
    borderRadius: 8,
  },
  pillActive: {
    backgroundColor: colors['--help-menu-highlight'],
  },
  body: {
    position: 'relative',
    display: 'flex',
    minWidth: 0,
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  status: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
});

/**
 * Linear's "What's new" timeline: a dot on a dashed line that starts at the
 * first release and runs on to "Full changelog".
 */
type TimelinePart = 'first' | 'middle' | 'last' | 'only';

function TimelineMark({ part }: { part: TimelinePart }) {
  const [from, to] = part === 'first' ? [16, 32] : part === 'middle' ? [0, 32] : [0, 16];
  return (
    <svg className="buyerly-help-timeline" viewBox="0 0 16 32" aria-hidden="true">
      {part !== 'only' && <line x1="8" x2="8" y1={from} y2={to} strokeWidth="2" strokeDasharray="4 4" strokeDashoffset="2" />}
      <circle cx="8" cy="16" r="3" />
    </svg>
  );
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

/** Something else holds the keyboard: a dialog, a menu, a palette. */
const OPEN_LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]:not([data-state="closed"]), [cmdk-root]';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

interface HelpRow {
  id: string;
  label: string;
  /** The changelog's rows; the rest are Help. */
  news: boolean;
  icon: (part: TimelinePart) => React.ReactNode;
  keys?: React.ReactNode;
  run: () => void;
}

const openLink = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

function writeToUs() {
  window.location.href = 'mailto:contact@buyerly.app';
}

/**
 * How well a label answers the letters typed, as Linear ranks its help menu: the
 * letters in order are needed; the label's start beats a word's start, which
 * beats the letters together anywhere, which beats them scattered.
 */
function matchScore(label: string, typed: string): number {
  const text = label.toLowerCase();
  const query = typed.trim().toLowerCase();
  if (!matchesTyped(label, typed)) return 0;
  if (text.startsWith(query)) return 4;
  if (text.includes(` ${query}`)) return 3;
  if (text.includes(query)) return 2;
  return 1;
}

/** Linear's order while typing: matching changelog rows first, then a "Help" heading over the rest, each by score. */
function filterRows(rows: HelpRow[], query: string): HelpRow[] {
  const scored = rows
    .map((row, index) => ({ row, index, score: matchScore(row.label, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => Number(b.row.news) - Number(a.row.news) || b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.row);
}

/**
 * The Help button at the sidebar's foot and its menu, as Linear's (re-measured
 * in both themes on 2026-10-28, #558): a round 24px button with the tooltip
 * "Open help menu ?" above it, a 270px menu 4px above that; ? opens it. The
 * menu takes typing as Linear's action menus do: a "Help with…" row appears at
 * the top and the rows narrow to the letters typed, in order.
 * Of Linear's items Buyerly has Contact us, Keyboard shortcuts, Settings and
 * What's new (the two newest releases of the public changelog, then Full
 * changelog); Docs, Send flare, Linear status, Download apps and Slack
 * community have no counterpart.
 */
export function BuyerlyHelpButton() {
  const setShortcutsOpen = useCommandMenuStore((state) => state.setShortcutsOpen);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Opened from the keyboard, the first row starts highlighted; from the mouse, none does.
  const byKeyboardRef = useRef(false);

  const openMenu = (byKeyboard: boolean) => {
    byKeyboardRef.current = byKeyboard;
    setQuery('');
    setActiveId(byKeyboard ? 'contact' : null);
    setOpen(true);
  };

  const openFromKey = useEffectEvent(() => openMenu(true));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      event.preventDefault();
      openFromKey();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const rows: HelpRow[] = [
    {
      id: 'contact',
      label: 'Contact us',
      news: false,
      icon: () => <BuyerlyIcon name="contact" size={16} />,
      run: writeToUs,
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      news: false,
      icon: () => <BuyerlyIcon name="keyboard" size={16} />,
      keys: (
        <span className="buyerly-help-shortcut" aria-label={IS_MAC ? 'Command /' : 'Control /'}>
          <kbd>{IS_MAC ? '⌘' : 'Ctrl'}</kbd>
          <kbd>/</kbd>
        </span>
      ),
      run: () => setShortcutsOpen(true),
    },
    {
      id: 'settings',
      label: 'Settings',
      news: false,
      icon: () => <BuyerlyIcon name="settings" size={16} />,
      keys: (
        <span className="buyerly-help-shortcut" aria-label={`G, then ${GO_TO_KEYS.preferences}`}>
          <kbd>G</kbd>
          <span>then</span>
          <kbd>{GO_TO_KEYS.preferences}</kbd>
        </span>
      ),
      run: () => openSettings('preferences'),
    },
    ...changelogLatest.map((release): HelpRow => ({
      id: release.url,
      label: release.title,
      news: true,
      icon: (part) => <TimelineMark part={part} />,
      run: () => openLink(release.url),
    })),
    {
      id: 'changelog',
      label: 'Full changelog',
      news: true,
      icon: (part) => <TimelineMark part={part} />,
      run: () => openLink('/changelog'),
    },
  ];

  const searching = query.trim() !== '';
  const shown = searching ? filterRows(rows, query) : rows;
  const firstHelp = shown.find((row) => !row.news);
  const firstNews = shown.find((row) => row.news);
  const active = shown.find((row) => row.id === activeId) ?? null;

  const choose = (row: HelpRow) => {
    setOpen(false);
    row.run();
  };

  const move = (step: number) => {
    if (shown.length === 0) return;
    const index = active ? shown.indexOf(active) : -1;
    const next = index === -1 ? (step > 0 ? 0 : shown.length - 1) : (index + step + shown.length) % shown.length;
    setActiveId(shown[next].id);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      if (searching || shown.length === 0) return;
      event.preventDefault();
      setActiveId(shown[event.key === 'Home' ? 0 : shown.length - 1].id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active) choose(active);
    }
  };

  const listId = 'buyerly-help-list';
  const rowId = (row: HelpRow) => `buyerly-help-row-${shown.indexOf(row)}`;

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (next) openMenu(byKeyboardRef.current);
        else setOpen(false);
      }}
    >
      <Tooltip content="Open help menu" shortcut="?" side="top" align="start" alignOffset={2} disabled={open}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Open Help menu"
            className="buyerly-help-button"
            onPointerDown={() => { byKeyboardRef.current = false; }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') byKeyboardRef.current = true;
            }}
          >
            <BuyerlyIcon name="help" size={16} />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={4}
        alignOffset={2}
        role="dialog"
        aria-label="Help"
        className="buyerly-help-menu"
        style={{ width: 270 }}
        // Radix focuses the menu itself on opening; typing goes to the field from the start.
        onFocus={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus({ preventScroll: true });
        }}
      >
        <div {...stylex.props(searching ? styles.search : styles.searchHidden, shown.length === 0 && styles.searchOverEmpty)}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              const matches = next.trim() ? filterRows(rows, next) : rows;
              setActiveId(next.trim() && matches.length > 0 ? matches[0].id : null);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Help with…"
            aria-label="Help with…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={active ? rowId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            {...stylex.props(styles.input)}
          />
          {searching && <kbd aria-hidden="true" {...stylex.props(styles.key)}>?</kbd>}
        </div>
        {searching && (
          <span role="status" {...stylex.props(styles.status)}>
            {shown.length === 0 ? 'No matching actions' : `Showing ${shown.length} item${shown.length === 1 ? '' : 's'}`}
          </span>
        )}
        {shown.length === 0 ? (
          <div {...stylex.props(styles.empty)}>No matching actions</div>
        ) : (
          <div
            id={listId}
            role="listbox"
            aria-label="Help"
            onPointerLeave={() => setActiveId(null)}
          >
            {shown.map((row, index) => {
              const isActive = row === active;
              const heading = searching
                ? row === firstHelp && firstNews ? 'Help' : null
                : row === firstNews ? 'What’s new' : null;
              // The timeline runs through neighbouring changelog rows; a lone one is just its dot.
              const before = shown[index - 1]?.news ?? false;
              const after = shown[index + 1]?.news ?? false;
              const part: TimelinePart = before && after ? 'middle' : before ? 'last' : after ? 'first' : 'only';
              return (
                <React.Fragment key={row.id}>
                  {heading && <div role="presentation" className="buyerly-help-group">{heading}</div>}
                  <div
                    id={rowId(row)}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive || undefined}
                    {...stylex.props(styles.row, isActive && styles.rowActive)}
                    onPointerMove={() => { if (!isActive) setActiveId(row.id); }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(row)}
                  >
                    <div {...stylex.props(styles.pill, isActive && styles.pillActive)} />
                    <span {...stylex.props(styles.body)}>
                      <span className="buyerly-help-icon">{row.icon(part)}</span>
                      <span {...stylex.props(styles.label)}>{row.label}</span>
                      {row.keys}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
