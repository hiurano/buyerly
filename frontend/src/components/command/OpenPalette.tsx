import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Settings, Wallet } from 'lucide-react';
import { useAppStore, type OpenPaletteKind } from '@/store/useAppStore';
import type { Workspace } from '@/lib/types';
import {
  readOpenedRecords,
  rememberOpenedRecord,
  rememberSearchReturnPath,
  searchPagePath,
  searchResultPath,
  searchWorkspace,
  SEARCH_KIND_LABELS,
  type SearchKind,
  type SearchResult,
} from '@/lib/search';
import { SETTINGS_PAGES, SETTINGS_PAGE_KEYWORDS, type SettingsPage } from '@/lib/settingsPages';
import { bestCommandScore } from '@/lib/commandFilter';
import { openPaletteFor } from '@/lib/shortcuts';
import { LinearBoltIcon, LinearMetaIcon, LinearSearchIcon } from '@/icons/LinearIcons';
import { COMMAND_MENU_CLASSES, CommandMenuFooterKeys } from '@/ui/SelectionCommandMenu';
import { SearchResultFacts, StatusMark } from '@/components/search/SearchView';

/** Something else holds the keyboard while it is open: a dialog, a menu, another palette. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.linear-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '[cmdk-root]',
].join(', ');

function isTyping(): boolean {
  const element = document.activeElement as HTMLElement | null;
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT'
    || Boolean(element?.isContentEditable);
}

/** The field's prompt, as Linear's "Open issue…". */
const PLACEHOLDERS: Record<OpenPaletteKind, string> = {
  campaign: 'Open campaign…',
  adset: 'Open ad set…',
  ad: 'Open ad…',
  rule: 'Open rule…',
  account: 'Open ad account…',
  settings: 'Open settings…',
};

/** The command menu's label for each palette. */
export const OPEN_PALETTE_LABELS = PLACEHOLDERS;

/** Plural nouns for the empty states: "No recently opened campaigns". */
const PLURALS: Record<SearchKind, string> = {
  campaign: 'campaigns',
  adset: 'ad sets',
  ad: 'ads',
  rule: 'rules',
  account: 'ad accounts',
};

/** The mark in the field and on each command: the sidebar's page icons. */
export const OpenPaletteIcon: React.FC<{ kind: OpenPaletteKind; size?: number }> = ({ kind, size = 14 }) => {
  if (kind === 'settings') return <Settings size={size} strokeWidth={1.75} />;
  if (kind === 'account') return <Wallet size={size} strokeWidth={1.75} />;
  if (kind === 'rule') return <LinearBoltIcon size={size} />;
  return <LinearMetaIcon size={size} />;
};

/** What had focus when a palette opened; it gets focus back unless a choice moves it on. */
let returnFocusTo: HTMLElement | null = null;

/** Opens an "Open …" palette, from O then a letter or from the command menu. */
export function openOpenPalette(kind: OpenPaletteKind): void {
  const active = document.activeElement;
  returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null;
  useAppStore.getState().setOpenPalette(kind);
}

interface OpenPaletteProps {
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
}

/**
 * Linear's "Open issue…" family, one palette per kind of record on O then a
 * letter (lib/shortcuts.ts): where the command menu sits, nothing dimmed. With
 * nothing typed it lists the records of that kind opened last; typing searches
 * at once under "Quick results for …". ↵ opens the record on its row, → shows
 * it on the right ("Quick look"), ← or Esc hides it again.
 */
export const OpenPalette: React.FC<OpenPaletteProps> = ({ workspace, navigate }) => {
  const kind = useAppStore((state) => state.openPalette);
  const setOpenPalette = useAppStore((state) => state.setOpenPalette);
  const choiceMade = useRef(false);
  const escapeRef = useRef<() => boolean>(() => false);
  // The closing palette keeps its kind through the animation.
  const shownKind = useRef<OpenPaletteKind>('campaign');
  if (kind) shownKind.current = kind;

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
          onEscapeKeyDown={(event) => {
            if (escapeRef.current()) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocusTo;
            returnFocusTo = null;
            if (choiceMade.current) {
              choiceMade.current = false;
              return;
            }
            if (target?.isConnected) target.focus({ preventScroll: true });
          }}
          className={`fixed inset-x-4 top-[13vh] z-[var(--layer-command-menu)] mx-auto flex max-h-[min(450px,84vh)] max-w-[720px] flex-col outline-none ${COMMAND_MENU_CLASSES.surface}`}
        >
          <Dialog.Title className="sr-only">{PLACEHOLDERS[shownKind.current].replace('…', '')}</Dialog.Title>
          {kind && (
            <PaletteBody key={kind} kind={kind} workspace={workspace} navigate={navigate} choose={choose} escapeRef={escapeRef} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** Typing searches at once, as in Linear's palettes; a short pause keeps one request per word. */
const QUICK_RESULTS_DELAY_MS = 120;
const QUICK_RESULTS_LIMIT = 8;

const FOOTER_HINT_CLASS = 'flex h-6 items-center gap-1.5 px-2 text-[12px] font-medium text-[var(--text-secondary)]';

interface PaletteBodyProps {
  kind: OpenPaletteKind;
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
  choose: (action: () => void) => void;
  /** Takes Esc before the palette closes; true when it used it. */
  escapeRef: React.MutableRefObject<() => boolean>;
}

/** The palette's content, mounted per open so it starts empty. */
const PaletteBody: React.FC<PaletteBodyProps> = ({ kind, workspace, navigate, choose, escapeRef }) => {
  const scope = useAppStore((state) => state.workspaceScope);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [quickLook, setQuickLook] = useState(false);
  const text = query.trim();
  const recordKind = kind === 'settings' ? null : kind;
  const quick = useKindResults(recordKind, text);
  const [recent] = useState(() => (recordKind ? readOpenedRecords(scope, recordKind) : []));
  const slug = workspace.slug;

  const go = (path: string) => navigate(path, `${window.location.pathname}${window.location.search}` === path);
  const openRecord = (result: SearchResult) => choose(() => {
    rememberOpenedRecord(scope, result);
    go(searchResultPath(slug, result));
  });
  const openSettings = (section: SettingsPage) => choose(() => {
    setSettingsSection(section);
    setActiveTab('preferences');
  });
  const advancedSearch = () => choose(() => {
    if (useAppStore.getState().activeTab !== 'search') {
      rememberSearchReturnPath(`${window.location.pathname}${window.location.search}`);
    }
    go(searchPagePath(slug, { query: text, tab: recordKind ?? 'all', statuses: [], accounts: [], order: 'relevance', includeDeleted: false }));
  });

  const records: SearchResult[] = recordKind ? (text ? (quick ?? []).slice(0, QUICK_RESULTS_LIMIT) : recent) : [];
  const settingsPages = kind === 'settings' ? filterSettings(text) : [];
  const noResults = recordKind !== null && text !== '' && quick !== null && records.length === 0;
  // cmdk keeps a choice whose row is gone when results arrive; the first row takes over, as in Linear.
  const shownValues = [
    ...records.map(recordValue),
    ...(noResults ? [NO_RESULTS_VALUE] : []),
    ...settingsPages.map((page) => `settings:${page.section}`),
  ];
  const current = shownValues.includes(selected) ? selected : shownValues[0] ?? '';
  const looked = quickLook ? records.find((record) => recordValue(record) === current) ?? null : null;
  const onRecord = records.some((record) => recordValue(record) === current);
  const searching = recordKind !== null && text !== '' && quick === null;
  // Esc hides the quick look first; the next one closes the palette.
  escapeRef.current = () => {
    if (!looked) return false;
    setQuickLook(false);
    return true;
  };

  return (
    <Command
      label={PLACEHOLDERS[kind].replace('…', '')}
      shouldFilter={false}
      loop
      vimBindings={false}
      value={current}
      onValueChange={(next) => setSelected(next ?? '')}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        const atEnd = !input || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
        // → past the end of what is typed, so it still moves the caret inside the text.
        if (event.key === 'ArrowRight' && !looked && onRecord && atEnd) {
          event.preventDefault();
          setQuickLook(true);
        } else if (event.key === 'ArrowLeft' && looked) {
          event.preventDefault();
          setQuickLook(false);
        }
      }}
    >
      <div className={`flex items-center ${COMMAND_MENU_CLASSES.field}`}>
        <span className="flex h-10 shrink-0 items-center pl-3 text-[var(--text-tertiary)]" aria-hidden="true">
          <OpenPaletteIcon kind={kind} />
        </span>
        <Command.Input
          autoFocus
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setQuickLook(false);
          }}
          placeholder={PLACEHOLDERS[kind]}
          className={`${COMMAND_MENU_CLASSES.input} pl-2.5`}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <Command.List className={`min-h-0 flex-1 ${COMMAND_MENU_CLASSES.list} ${looked ? 'hidden w-[45%] flex-none sm:block' : ''}`}>
          {recordKind && !text && recent.length === 0 && (
            <p className={COMMAND_MENU_CLASSES.note}>{`No recently opened ${PLURALS[recordKind]}. Type to search.`}</p>
          )}
          {records.length > 0 && (
            <Command.Group heading={text ? `Quick results for "${text}"` : 'Recently opened'} className={COMMAND_MENU_CLASSES.group}>
              {records.map((record) => (
                <Command.Item
                  key={recordValue(record)}
                  value={recordValue(record)}
                  aria-label={recordName(record)}
                  onSelect={() => openRecord(record)}
                  className={COMMAND_MENU_CLASSES.item}
                >
                  <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><StatusMark result={record} /></span>
                  <RecordLabel record={record} />
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {noResults && (
            <Command.Item
              value={NO_RESULTS_VALUE}
              aria-label="No results found, go to advanced search"
              onSelect={advancedSearch}
              className={COMMAND_MENU_CLASSES.item}
            >
              <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><LinearSearchIcon size={14} /></span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0">No results found</span>
                <span className="min-w-0 truncate text-[var(--text-muted)]">Go to advanced search</span>
              </span>
            </Command.Item>
          )}
          {settingsPages.length > 0 && (
            <Command.Group heading="Settings" className={COMMAND_MENU_CLASSES.group}>
              {settingsPages.map((page) => (
                <Command.Item
                  key={page.section}
                  value={`settings:${page.section}`}
                  aria-label={page.label}
                  onSelect={() => openSettings(page.section)}
                  className={COMMAND_MENU_CLASSES.item}
                >
                  <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><Settings size={14} strokeWidth={1.75} /></span>
                  <span className="min-w-0 flex-1 truncate">{page.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        {looked && <QuickLook record={looked} />}
      </div>
      <p role="status" className="sr-only">
        {searching ? 'Searching…' : `Showing ${records.length + settingsPages.length} items`}
      </p>
      {/* Linear's footer: 35px under a rule, each hint with its keys boxed. */}
      <div className="flex h-[35px] shrink-0 items-center gap-1.5 border-t border-[var(--command-menu-border)] px-1">
        <span className={FOOTER_HINT_CLASS}>
          <CommandMenuFooterKeys keys={['↵']} />
          <span>Open</span>
        </span>
        {recordKind && (looked ? (
          <button
            type="button"
            className={`${FOOTER_HINT_CLASS} ml-auto rounded-[6px] hover:bg-[var(--command-menu-row-selected-bg)]`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setQuickLook(false)}
          >
            <CommandMenuFooterKeys keys={['←']} />
            <span>Close</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!onRecord}
            className={`${FOOTER_HINT_CLASS} ml-auto rounded-[6px] hover:bg-[var(--command-menu-row-selected-bg)] disabled:opacity-50 disabled:hover:bg-transparent`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setQuickLook(true)}
          >
            <span>Quick look</span>
            <CommandMenuFooterKeys keys={['→']} />
          </button>
        ))}
      </div>
    </Command>
  );
};

const NO_RESULTS_VALUE = 'advanced-search';

const recordValue = (record: SearchResult) => `record:${record.kind}:${record.id}`;

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

const RecordLabel: React.FC<{ record: SearchResult }> = ({ record }) => {
  const where = recordWhere(record);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 truncate">{record.name}</span>
      {where && <span className="min-w-0 shrink-[200000] truncate text-[var(--text-muted)]">{where}</span>}
    </span>
  );
};

/** Linear's Quick look: the record on the right, inside the palette. */
const QuickLook: React.FC<{ record: SearchResult }> = ({ record }) => (
  <section
    aria-label="Quick look"
    className="min-h-0 min-w-0 flex-1 overflow-y-auto border-[var(--command-menu-border)] px-5 pb-5 pt-3 sm:border-l"
  >
    <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)]">
      <StatusMark result={record} />
      {SEARCH_KIND_LABELS[record.kind]}
    </p>
    <h2 className="mt-1.5 select-text break-words text-[15px] font-semibold leading-5 text-[var(--text-primary)]">{record.name}</h2>
    <SearchResultFacts result={record} className="mt-4" labelWidth={96} />
  </section>
);

/** Settings pages matching what is typed, best first; nothing typed keeps the sidebar's order. */
function filterSettings(text: string): { section: SettingsPage; label: string }[] {
  if (!text) return SETTINGS_PAGES;
  return SETTINGS_PAGES
    .map((page, index) => ({ page, index, score: bestCommandScore(text, page.label, SETTINGS_PAGE_KEYWORDS[page.section].split(' ')) }))
    .filter((entry): entry is { page: (typeof SETTINGS_PAGES)[number]; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.page);
}

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
