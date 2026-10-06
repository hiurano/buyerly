import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Settings, Wallet } from 'lucide-react';
import { useAppStore, type OpenPaletteKind } from '@/store/useAppStore';
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
import { filterSettingsGroups, type SettingsPage } from '@/lib/settingsPages';
import { openPaletteFor } from '@/lib/shortcuts';
import { LinearBoltIcon, LinearMetaIcon } from '@/icons/LinearIcons';
import { COMMAND_MENU_CLASSES, CommandMenuFooterKeys } from '@/ui/SelectionCommandMenu';
import { SearchResultFacts, StatusMark, formatAge, statusLabel } from '@/components/search/SearchView';
import { SettingsPageIcon } from '@/components/preferences/SettingsPageIcon';

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

/** The field's prompt, as Linear's "Open issue…"; the command menu lists them under the same words. */
export const OPEN_PALETTE_LABELS: Record<OpenPaletteKind, string> = {
  campaign: 'Open campaign…',
  adset: 'Open ad set…',
  ad: 'Open ad…',
  rule: 'Open rule…',
  account: 'Open ad account…',
  settings: 'Open settings…',
};

/** The mark in the field and on each command: the sidebar's page icons. */
export const OpenPaletteIcon: React.FC<{ kind: OpenPaletteKind; size?: number }> = ({ kind, size = 16 }) => {
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

/**
 * True once for the record "More actions" asked about ("kind:id"), which the
 * page then selects with its actions menu open; any other record clears the ask.
 */
export function takeRecordActions(key: string): boolean {
  const store = useAppStore.getState();
  if (store.recordActionsFor === null) return false;
  store.setRecordActionsFor(null);
  return store.recordActionsFor === key;
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
 * → shows it on the right ("Quick look") and ← hides it; Esc closes.
 */
export const OpenPalette: React.FC<OpenPaletteProps> = ({ workspace, navigate }) => {
  const kind = useAppStore((state) => state.openPalette);
  const setOpenPalette = useAppStore((state) => state.setOpenPalette);
  const choiceMade = useRef(false);
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
          className={`fixed inset-x-4 top-[13vh] z-[var(--layer-command-menu)] mx-auto flex max-h-[min(487px,84vh)] max-w-[720px] flex-col outline-none ${COMMAND_MENU_CLASSES.surface}`}
        >
          <Dialog.Title className="sr-only">{OPEN_PALETTE_LABELS[shownKind.current].replace('…', '')}</Dialog.Title>
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

/** Linear's footer hints are pill buttons: 24px, keys boxed beside the words. */
const FOOTER_HINT_CLASS = 'flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2 text-[12px] font-medium text-[var(--command-menu-text)] hover:bg-[var(--command-menu-row-selected-bg)] disabled:opacity-50 disabled:hover:bg-transparent';

interface PaletteBodyProps {
  kind: OpenPaletteKind;
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
  choose: (action: () => void) => void;
}

/** The palette's content, mounted per open so it starts empty. */
const PaletteBody: React.FC<PaletteBodyProps> = ({ kind, workspace, navigate, choose }) => {
  const scope = useAppStore((state) => state.workspaceScope);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setRecordActionsFor = useAppStore((state) => state.setRecordActionsFor);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [quickLook, setQuickLook] = useState(false);
  const text = query.trim();
  const recordKind = kind === 'settings' ? null : kind;
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
  const openSettings = (section: SettingsPage) => choose(() => {
    setSettingsSection(section);
    setActiveTab('preferences');
  });

  const records: SearchResult[] = recordKind ? (text ? (quick ?? []).slice(0, QUICK_RESULTS_LIMIT) : recent) : [];
  const settingsGroups = kind === 'settings' ? filterSettingsGroups(text) : [];
  // cmdk keeps a choice whose row is gone when results arrive; the first row takes over, as in Linear.
  const shownValues = [
    ...records.map(recordValue),
    ...settingsGroups.flatMap((group) => group.pages.map((page) => `settings:${page.section}`)),
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
      className={`flex min-h-0 flex-1 flex-col ${looked ? 'h-[min(487px,84vh)]' : ''}`}
      onKeyDown={(event) => {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        const atEnd = !input || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
        if (event.key === 'Enter' && event.altKey) {
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
      <div className={`relative ${COMMAND_MENU_CLASSES.field} ${looked ? 'border-b border-[var(--command-menu-border)]' : ''}`}>
        {/* Linear's field: its icon 12px in, the text from 36px. */}
        <span className="pointer-events-none absolute left-[18px] top-1.5 flex h-10 items-center text-[var(--command-menu-text)]" aria-hidden="true">
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
          className={`${COMMAND_MENU_CLASSES.input} pl-9`}
        />
      </div>
      <p role="status" className="sr-only">
        {searching ? 'Searching…' : shownValues.length === 0 ? 'No results found' : `Showing ${shownValues.length} items`}
      </p>
      {/* Linear shows nothing under the field until there is something to open. */}
      {shownValues.length > 0 && (
        <div className="flex min-h-0 flex-1">
          <Command.List
            className={`min-h-0 ${COMMAND_MENU_CLASSES.list} ${looked ? 'hidden max-h-none w-[304px] shrink-0 pt-1.5 sm:block' : 'flex-1'}`}
          >
            {records.length > 0 && (
              // Recently opened records come with no heading, as in Linear.
              <Command.Group heading={text ? `Quick results for "${text}"` : undefined} className={COMMAND_MENU_CLASSES.group}>
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
            {settingsGroups.map((group) => (
              <Command.Group key={group.heading || 'account'} heading={group.heading || undefined} className={COMMAND_MENU_CLASSES.group}>
                {group.pages.map((page) => (
                  <Command.Item
                    key={page.section}
                    value={`settings:${page.section}`}
                    aria-label={page.label}
                    onSelect={() => openSettings(page.section)}
                    className={COMMAND_MENU_CLASSES.item}
                  >
                    <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><SettingsPageIcon section={page.section} /></span>
                    <span className="min-w-0 flex-1 truncate">{page.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
          {looked && <QuickLook record={looked} />}
        </div>
      )}
      {records.length > 0 && (
        // Linear's footer: 35px under a rule, ↵ Open on the left, the record's other ways on the right.
        <div className="flex h-[35px] shrink-0 items-center gap-1 border-t border-[var(--command-menu-border)] px-1">
          <button
            type="button"
            className={FOOTER_HINT_CLASS}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => currentRecord && openRecord(currentRecord)}
          >
            <span className="sr-only">Enter</span>
            <CommandMenuFooterKeys keys={['↵']} />
            <span>Open</span>
          </button>
          <span className="ml-auto" />
          {hasActions && (
            <button
              type="button"
              className={FOOTER_HINT_CLASS}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => currentRecord && openRecord(currentRecord, true)}
            >
              <span className="sr-only">Alt Enter</span>
              <CommandMenuFooterKeys keys={['Alt', '↵']} />
              <span>More actions</span>
            </button>
          )}
          {looked ? (
            <button
              type="button"
              className={FOOTER_HINT_CLASS}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuickLook(false)}
            >
              <span className="sr-only">Arrow Left</span>
              <CommandMenuFooterKeys keys={['←']} />
              <span>Close</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!currentRecord}
              className={FOOTER_HINT_CLASS}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuickLook(true)}
            >
              <span>Quick look</span>
              <span className="sr-only">Arrow Right</span>
              <CommandMenuFooterKeys keys={['→']} />
            </button>
          )}
        </div>
      )}
    </Command>
  );
};

const recordValue = (record: SearchResult) => `record:${record.kind}:${record.id}`;

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
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {identifier && <span className="shrink-0 text-[var(--text-tertiary)]">{identifier}</span>}
      <span className="min-w-0 truncate">{record.name}</span>
      {where && <span className="min-w-0 shrink-[200000] truncate text-[var(--text-muted)]">{where}</span>}
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
    <section aria-label="Quick look" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
      <p className="text-[13px] font-medium text-[var(--text-tertiary)]">{recordIdentifier(record) || SEARCH_KIND_LABELS[record.kind]}</p>
      <h2 className="mt-1.5 select-text break-words text-[18px] font-medium leading-[21px] text-[var(--text-primary)]">{record.name}</h2>
      {(status || age) && (
        <p className="mt-4 flex items-center gap-1.5 text-[13px] font-[450] leading-[18px] text-[var(--text-tertiary)]">
          <StatusMark result={record} />
          {[status, age].filter(Boolean).join(' · ')}
        </p>
      )}
      <SearchResultFacts result={record} className="mt-4" labelWidth={96} />
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
