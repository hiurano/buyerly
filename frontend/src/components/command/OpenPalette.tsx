import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import type { Workspace } from '@/lib/types';
import {
  readOpenedRecords,
  rememberOpenedRecord,
  searchResultPath,
  searchWorkspace,
  SEARCH_KIND_LABELS,
  type SearchKind,
  type SearchResult,
} from '@/lib/search';
import { filterSettingsGroups, settingsGroupsFor, type SettingsPage } from '@/lib/settingsPages';
import { openPaletteFor } from '@/lib/shortcuts';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { useFavorites, type Favorite } from '@/lib/favorites';
import { favoriteIcon } from '@/components/sidebar/SidebarFavorites';
import { CommandMenuFooterKeys } from '@/ui/SelectionCommandMenu';
import { commandMenuStyles as menu } from './commandMenuStyles';
import { SearchResultFacts, StatusMark, formatAge, statusLabel } from '@/components/search/SearchView';
import { SettingsPageIcon } from '@/components/preferences/SettingsPageIcon';
import { commandMenuStore, useCommandMenuStore, type OpenPaletteKind } from '@/models/commandMenuStore';
import { useScopeStore } from '@/models/scopeStore';
import { openSettings as openSettingsPage } from '@/lib/routing';

/** Something else holds the keyboard while it is open: a dialog, a menu, another palette. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.buyerly-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '[cmdk-root]',
].join(', ');

function isTyping(): boolean {
  const element = document.activeElement as HTMLElement | null;
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT'
    || Boolean(element?.isContentEditable);
}

/** The field's prompt, as Linear's "Open issue…"; the command menu lists them under the same words. */
export const OPEN_PALETTE_LABELS: Record<OpenPaletteKind, string> = {
  campaign: 'Open campaign…',
  adset: 'Open ad set…',
  ad: 'Open ad…',
  rule: 'Open rule…',
  account: 'Open ad account…',
  settings: 'Open settings…',
  favorite: 'Open favorite…',
};

/** The mark in the field and on each command: the sidebar's page icons. */
export const OpenPaletteIcon: React.FC<{ kind: OpenPaletteKind; size?: number }> = ({ kind, size = 16 }) => {
  if (kind === 'settings') return <BuyerlyIcon name="settings" size={size} />;
  if (kind === 'favorite') return <BuyerlyIcon name="favorite" size={size} />;
  if (kind === 'account') return <BuyerlyIcon name="ad-accounts" size={size} />;
  if (kind === 'rule') return <BuyerlyIcon name="rules" size={size} />;
  return <BuyerlyIcon name="campaigns" size={size} />;
};

/** What had focus when a palette opened; it gets focus back unless a choice moves it on. */
let returnFocusTo: HTMLElement | null = null;

/**
 * Hands over where focus goes back to, once. A function, as the React Compiler
 * takes a module variable for a constant inside a component and would read it
 * after clearing it (#492).
 */
function takeReturnFocus(): HTMLElement | null {
  const target = returnFocusTo;
  returnFocusTo = null;
  return target;
}

/** Opens an "Open …" palette, from O then a letter or from the command menu. */
export function openOpenPalette(kind: OpenPaletteKind): void {
  const active = document.activeElement;
  returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null;
  commandMenuStore.setOpenPalette(kind);
}

/**
 * True once for the record "More actions" asked about ("kind:id"), which the
 * page then selects with its actions menu open; any other record clears the ask.
 */
export function takeRecordActions(key: string): boolean {
  const wanted = commandMenuStore.recordActionsFor;
  if (wanted === null) return false;
  commandMenuStore.setRecordActionsFor(null);
  return wanted === key;
}

interface OpenPaletteProps {
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
}

/**
 * Linear's "Open issue…" family, one palette per kind of record on O then a
 * letter (lib/shortcuts.ts), measured on Linear: where the command menu sits,
 * nothing dimmed, the kind's icon inside the field. With nothing typed it
 * lists the records of that kind opened last; typing searches at once under
 * "Quick results for …". Nothing to show leaves the field alone. ↵ opens the
 * record on its row, Alt+↵ opens it with its actions menu ("More actions"),
 * → shows it on the right ("Quick look") and ← hides it; Esc closes. O F
 * lists the favorites under "Navigation", each with the number that opens it.
 */
export const OpenPalette: React.FC<OpenPaletteProps> = ({ workspace, navigate }) => {
  const kind = useCommandMenuStore((state) => state.openPalette);
  const setOpenPalette = useCommandMenuStore((state) => state.setOpenPalette);
  const choiceMade = useRef(false);
  // The closing palette keeps its kind through the animation.
  const [shownKind, setShownKind] = useState<OpenPaletteKind>('campaign');
  if (kind && kind !== shownKind) setShownKind(kind);

  useEffect(() => {
    let oPressed = false;
    let timer: ReturnType<typeof setTimeout>;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || isTyping() || document.querySelector(OPEN_LAYER_SELECTOR)) {
        oPressed = false;
        return;
      }
      const key = event.key.toLowerCase();
      const target = oPressed ? openPaletteFor(key) : null;
      if (target) {
        // Before the page's own letters: O then C opens campaigns, never C's "Create rule".
        event.preventDefault();
        event.stopImmediatePropagation();
        oPressed = false;
        clearTimeout(timer);
        openOpenPalette(target);
        return;
      }
      oPressed = key === 'o';
      clearTimeout(timer);
      if (oPressed) timer = setTimeout(() => { oPressed = false; }, 1500);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      clearTimeout(timer);
    };
  }, []);

  // A palette still open when the workspace closes must not reopen in the next one.
  useEffect(() => () => setOpenPalette(null), [setOpenPalette]);

  const choose = (action: () => void) => {
    choiceMade.current = true;
    setOpenPalette(null);
    action();
  };

  return (
    <Dialog.Root open={kind !== null} onOpenChange={(next) => { if (!next) setOpenPalette(null); }}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = takeReturnFocus();
            if (choiceMade.current) {
              choiceMade.current = false;
              return;
            }
            if (target?.isConnected) target.focus({ preventScroll: true });
          }}
          {...withClassName(stylex.props(menu.dialog, styles.dialog, menu.surface), 'animate-scale-in')}
        >
          <Dialog.Title {...stylex.props(menu.srOnly)}>{OPEN_PALETTE_LABELS[shownKind].replace('…', '')}</Dialog.Title>
          {kind && (
            <PaletteBody key={kind} kind={kind} workspace={workspace} navigate={navigate} choose={choose} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** Typing searches at once, as in Linear's palettes; a short pause keeps one request per word. */
const QUICK_RESULTS_DELAY_MS = 120;
const QUICK_RESULTS_LIMIT = 8;

const styles = stylex.create({
  dialog: {
    maxHeight: 'min(487px, 84vh)',
  },
  palette: {
    display: 'flex',
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    flexDirection: 'column',
  },
  /** Quick look takes the palette's full height. */
  paletteLooked: {
    height: 'min(487px, 84vh)',
  },
  field: {
    position: 'relative',
  },
  fieldLooked: {
    borderBottomWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--command-menu-border'],
  },
  /** Linear's field: its icon 12px in, the text from 36px. */
  fieldIcon: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 18,
    top: 6,
    display: 'flex',
    height: 40,
    alignItems: 'center',
    color: colors['--command-menu-text'],
  },
  input: {
    paddingLeft: 36,
  },
  body: {
    display: 'flex',
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  list: {
    minHeight: 0,
  },
  listFull: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  /** Beside Quick look the list keeps 304px, and on a phone gives the room to it. */
  listLooked: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'block',
    },
    maxHeight: 'none',
    width: 304,
    flexShrink: 0,
    paddingTop: 6,
  },
  /** Linear's footer: 35px under a rule, ↵ Open on the left, the record's other ways on the right. */
  footer: {
    display: 'flex',
    height: 35,
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--command-menu-border'],
    paddingLeft: 4,
    paddingRight: 4,
  },
  footerGap: {
    marginLeft: 'auto',
  },
  /** Linear's footer hints are pill buttons: 24px, keys boxed beside the words. */
  hint: {
    display: 'flex',
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--command-menu-text'],
    backgroundColor: {
      default: null,
      ':hover': colors['--command-menu-row-selected-bg'],
      ':disabled:hover': 'transparent',
    },
    opacity: {
      default: null,
      ':disabled': 0.5,
    },
  },
  recordLabel: {
    position: 'relative',
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 8,
  },
  identifier: {
    flexShrink: 0,
    color: colors['--text-tertiary'],
  },
  truncate: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  /** Where a record lives gives way first, before its name. */
  where: {
    flexShrink: 200000,
    color: colors['--text-muted'],
  },
  quickLook: {
    minHeight: 0,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingLeft: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingTop: 16,
  },
  lookKind: {
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  lookTitle: {
    marginTop: 6,
    userSelect: 'text',
    overflowWrap: 'break-word',
    fontSize: 18,
    fontWeight: 500,
    lineHeight: '21px',
    color: colors['--text-primary'],
  },
  lookStatus: {
    marginTop: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 450,
    lineHeight: '18px',
    color: colors['--text-tertiary'],
  },
  lookFacts: {
    marginTop: 16,
  },
});

interface PaletteBodyProps {
  kind: OpenPaletteKind;
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
  choose: (action: () => void) => void;
}

/** The palette's content, mounted per open so it starts empty. */
const PaletteBody: React.FC<PaletteBodyProps> = ({ kind, workspace, navigate, choose }) => {
  const scope = useScopeStore((state) => state.workspaceScope);
  const setRecordActionsFor = useCommandMenuStore((state) => state.setRecordActionsFor);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [quickLook, setQuickLook] = useState(false);
  const text = query.trim();
  const recordKind = kind === 'settings' || kind === 'favorite' ? null : kind;
  const quick = useKindResults(recordKind, text);
  const [recent] = useState(() => (recordKind ? readOpenedRecords(scope, recordKind) : []));
  const slug = workspace.slug;
  // An ad account has no row of its own to act on, so it has no "More actions".
  const hasActions = recordKind !== null && recordKind !== 'account';

  const go = (path: string) => navigate(path, `${window.location.pathname}${window.location.search}` === path);
  const openRecord = (result: SearchResult, withActions = false) => choose(() => {
    rememberOpenedRecord(scope, result);
    setRecordActionsFor(withActions ? `${result.kind}:${result.id}` : null);
    go(searchResultPath(slug, result));
  });
  const openSettings = (section: SettingsPage) => choose(() => openSettingsPage(section));

  const records: SearchResult[] = recordKind ? (text ? (quick ?? []).slice(0, QUICK_RESULTS_LIMIT) : recent) : [];
  const settingsGroups = kind === 'settings' ? filterSettingsGroups(text, settingsGroupsFor(workspace)) : [];
  const favorites = useFavorites((state) => state.favorites);
  // Each favorite keeps its place in the sidebar, the number that opens it.
  const shownFavorites = kind === 'favorite'
    ? favorites.map((favorite, index) => ({ favorite, number: index + 1 }))
      .filter(({ favorite }) => favorite.title.toLowerCase().includes(text.toLowerCase()))
    : [];
  const openFavorite = (favorite: Favorite) => choose(() => go(`/${slug}/${favorite.path}`));
  // cmdk keeps a choice whose row is gone when results arrive; the first row takes over, as in Linear.
  const shownValues = [
    ...records.map(recordValue),
    ...settingsGroups.flatMap((group) => group.pages.map((page) => `settings:${page.section}`)),
    ...shownFavorites.map(({ favorite }) => favoriteValue(favorite)),
  ];
  const current = shownValues.includes(selected) ? selected : shownValues[0] ?? '';
  const currentRecord = records.find((record) => recordValue(record) === current) ?? null;
  const looked = quickLook ? currentRecord : null;
  const searching = recordKind !== null && text !== '' && quick === null;

  return (
    <Command
      label={OPEN_PALETTE_LABELS[kind].replace('…', '')}
      shouldFilter={false}
      loop
      vimBindings={false}
      value={current}
      onValueChange={(next) => setSelected(next ?? '')}
      {...stylex.props(styles.palette, looked && styles.paletteLooked)}
      onKeyDown={(event) => {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        const atEnd = !input || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
        const numbered = kind === 'favorite' && !text && /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey
          ? favorites[Number(event.key) - 1]
          : undefined;
        if (numbered) {
          // Linear's O F: with nothing typed, a favorite's number opens it.
          event.preventDefault();
          openFavorite(numbered);
        } else if (event.key === 'Enter' && event.altKey) {
          event.preventDefault();
          if (currentRecord && hasActions) openRecord(currentRecord, true);
        } else if (event.key === 'ArrowRight' && !looked && currentRecord && atEnd) {
          // → past the end of what is typed, so it still moves the caret inside the text.
          event.preventDefault();
          setQuickLook(true);
        } else if (event.key === 'ArrowLeft' && looked) {
          event.preventDefault();
          setQuickLook(false);
        }
      }}
    >
      <div {...stylex.props(menu.field, styles.field, looked && styles.fieldLooked)}>
        {/* Linear's field: its icon 12px in, the text from 36px. */}
        <span {...stylex.props(styles.fieldIcon)} aria-hidden="true">
          <OpenPaletteIcon kind={kind} />
        </span>
        <Command.Input
          autoFocus
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setQuickLook(false);
          }}
          placeholder={OPEN_PALETTE_LABELS[kind]}
          {...stylex.props(menu.input, styles.input)}
        />
      </div>
      <p role="status" {...stylex.props(menu.srOnly)}>
        {searching ? 'Searching…' : shownValues.length === 0 ? 'No results found' : `Showing ${shownValues.length} items`}
      </p>
      {/* Linear shows nothing under the field until there is something to open. */}
      {shownValues.length > 0 && (
        <div {...stylex.props(styles.body)}>
          <Command.List
            {...stylex.props(menu.list, styles.list, looked ? styles.listLooked : styles.listFull)}
          >
            {records.length > 0 && (
              // Recently opened records come with no heading, as in Linear.
              <Command.Group heading={text ? `Quick results for "${text}"` : undefined} className="buyerly-command-group">
                {records.map((record) => (
                  <Command.Item
                    key={recordValue(record)}
                    value={recordValue(record)}
                    aria-label={recordName(record)}
                    onSelect={() => openRecord(record)}
                    {...stylex.props(menu.item)}
                  >
                    <span {...stylex.props(menu.icon)} aria-hidden="true"><StatusMark result={record} /></span>
                    <RecordLabel record={record} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {settingsGroups.map((group) => (
              <Command.Group key={group.heading || 'account'} heading={group.heading || undefined} className="buyerly-command-group">
                {group.pages.map((page) => (
                  <Command.Item
                    key={page.section}
                    value={`settings:${page.section}`}
                    aria-label={page.label}
                    onSelect={() => openSettings(page.section)}
                    {...stylex.props(menu.item)}
                  >
                    <span {...stylex.props(menu.icon)} aria-hidden="true"><SettingsPageIcon section={page.section} /></span>
                    <span {...stylex.props(menu.label)}>{page.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            {shownFavorites.length > 0 && (
              <Command.Group heading="Navigation" className="buyerly-command-group">
                {shownFavorites.map(({ favorite, number }) => (
                  <Command.Item
                    key={favorite.path}
                    value={favoriteValue(favorite)}
                    aria-label={favorite.title}
                    onSelect={() => openFavorite(favorite)}
                    {...stylex.props(menu.item)}
                  >
                    <span {...stylex.props(menu.icon)} aria-hidden="true">{favoriteIcon(favorite)}</span>
                    <span {...stylex.props(menu.label)}>{favorite.title}</span>
                    {number <= 9 && <kbd {...withClassName(stylex.props(menu.part), 'buyerly-favorite-number')} aria-hidden="true">{number}</kbd>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
          {looked && <QuickLook record={looked} />}
        </div>
      )}
      {records.length > 0 && (
        // Linear's footer: 35px under a rule, ↵ Open on the left, the record's other ways on the right.
        <div {...stylex.props(styles.footer)}>
          <button
            type="button"
            {...stylex.props(styles.hint)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => currentRecord && openRecord(currentRecord)}
          >
            <span {...stylex.props(menu.srOnly)}>Enter</span>
            <CommandMenuFooterKeys keys={['↵']} />
            <span>Open</span>
          </button>
          <span {...stylex.props(styles.footerGap)} />
          {hasActions && (
            <button
              type="button"
              {...stylex.props(styles.hint)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => currentRecord && openRecord(currentRecord, true)}
            >
              <span {...stylex.props(menu.srOnly)}>Alt Enter</span>
              <CommandMenuFooterKeys keys={['Alt', '↵']} />
              <span>More actions</span>
            </button>
          )}
          {looked ? (
            <button
              type="button"
              {...stylex.props(styles.hint)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuickLook(false)}
            >
              <span {...stylex.props(menu.srOnly)}>Arrow Left</span>
              <CommandMenuFooterKeys keys={['←']} />
              <span>Close</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!currentRecord}
              {...stylex.props(styles.hint)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuickLook(true)}
            >
              <span>Quick look</span>
              <span {...stylex.props(menu.srOnly)}>Arrow Right</span>
              <CommandMenuFooterKeys keys={['→']} />
            </button>
          )}
        </div>
      )}
    </Command>
  );
};

const recordValue = (record: SearchResult) => `record:${record.kind}:${record.id}`;
const favoriteValue = (favorite: Favorite) => `favorite:${favorite.path}`;

/** A rule's identifier, as the Rules list writes it (RUL-07); Meta's records have none. */
function recordIdentifier(record: SearchResult): string {
  return record.kind === 'rule' ? `RUL-${record.id.padStart(2, '0')}` : '';
}

/** Where a record lives: its campaign or ad set, else its ad account; an ad account shows its ID. */
function recordWhere(record: SearchResult): string {
  if (record.kind === 'account') return record.id;
  if (record.kind === 'rule') return '';
  return record.parent_name || record.account_name || record.account_id;
}

function recordName(record: SearchResult): string {
  const where = recordWhere(record);
  return `${record.name}${where ? `, ${where}` : ''}`;
}

/** Linear's row: the identifier muted, then the title; ours adds where the record lives. */
const RecordLabel: React.FC<{ record: SearchResult }> = ({ record }) => {
  const identifier = recordIdentifier(record);
  const where = recordWhere(record);
  return (
    <span {...stylex.props(styles.recordLabel)}>
      {identifier && <span {...stylex.props(styles.identifier)}>{identifier}</span>}
      <span {...stylex.props(styles.truncate)}>{record.name}</span>
      {where && <span {...stylex.props(styles.truncate, styles.where)}>{where}</span>}
    </span>
  );
};

/**
 * Linear's Quick look, measured: the identifier (here the kind) muted at
 * 13px, the title at 18px, a muted line of status and age, then the record.
 */
const QuickLook: React.FC<{ record: SearchResult }> = ({ record }) => {
  const status = statusLabel(record);
  const age = formatAge(record);
  return (
    <section aria-label="Quick look" {...stylex.props(styles.quickLook)}>
      <p {...stylex.props(styles.lookKind)}>{recordIdentifier(record) || SEARCH_KIND_LABELS[record.kind]}</p>
      <h2 {...stylex.props(styles.lookTitle)}>{record.name}</h2>
      {(status || age) && (
        <p {...stylex.props(styles.lookStatus)}>
          <StatusMark result={record} />
          {[status, age].filter(Boolean).join(' · ')}
        </p>
      )}
      <SearchResultFacts result={record} xstyle={styles.lookFacts} labelWidth={96} />
    </section>
  );
};

/**
 * Records of one kind for what is typed, from GET /api/search?kind=…; null
 * until the first answer. The last answer stays while the next one loads.
 */
function useKindResults(kind: SearchKind | null, text: string): SearchResult[] | null {
  const [answer, setAnswer] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    if (!kind || !text) {
      setAnswer(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchWorkspace(
        { query: text, tab: kind, statuses: [], accounts: [], order: 'relevance', includeDeleted: false },
        controller.signal,
      )
        .then((response) => setAnswer(response.results))
        .catch(() => {
          if (!controller.signal.aborted) setAnswer([]);
        });
    }, QUICK_RESULTS_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, text]);

  return answer;
}
