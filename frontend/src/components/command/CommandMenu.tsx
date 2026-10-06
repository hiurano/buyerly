import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { ArrowRight, Maximize2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { pathForTab } from '@/lib/routing';
import type { Workspace } from '@/lib/types';
import { openSearchPage } from '@/components/search/openSearchPage';
import { StatusMark } from '@/components/search/SearchView';
import {
  rememberOpenedRecord,
  rememberSearchReturnPath,
  searchPagePath,
  searchResultPath,
  searchWorkspace,
  SEARCH_KIND_LABELS,
  type SearchResult,
} from '@/lib/search';
import { bestCommandScore } from '@/lib/commandFilter';
import { goToShortcut, openShortcut, OPEN_KEYS } from '@/lib/shortcuts';
import type { OpenPaletteKind } from '@/store/useAppStore';
import { OpenPaletteIcon, OPEN_PALETTE_LABELS, openOpenPalette } from './OpenPalette';
import { SETTINGS_PAGE_GROUPS, SETTINGS_PAGE_KEYWORDS } from '@/lib/settingsPages';
import { SettingsPageIcon } from '@/components/preferences/SettingsPageIcon';
import { isSmallScreen } from '@/lib/useMediaQuery';
import { LinearPlusIcon, LinearSearchIcon, LinearSidebarLeftToggleIcon } from '@/icons/LinearIcons';
import { COMMAND_MENU_CLASSES, CommandMenuFooterKeys } from '@/ui/SelectionCommandMenu';
import { usePageGroup, type PaletteCommand, type PaletteGroup } from './pageCommands';

/** Something else holds the keyboard while it is open: a dialog, a menu, another palette. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.linear-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '[cmdk-root]',
].join(', ');

/** Settings' own search field in its sidebar. */
const SETTINGS_SEARCH_SELECTOR = '.preferences-search-input';

/** Inputs that take no typed text, so `/` on them still opens search. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** `/` typed into a field is text, never a shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** What had focus when the menu opened; it gets focus back unless a choice moves it on. */
let returnFocusTo: HTMLElement | null = null;

/** Opens the command menu (Ctrl/Cmd+K), remembering where focus goes back to. */
export function openCommandMenu(): void {
  const store = useAppStore.getState();
  if (store.isCommandMenuOpen) return;
  const active = document.activeElement;
  returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null;
  store.setCommandMenuOpen(true);
}

interface CommandMenuProps {
  workspace: Workspace;
  /** Opens an address in the app; `replace` keeps history from repeating it. */
  navigate: (path: string, replace?: boolean) => void;
}

/**
 * Linear's command menu — Ctrl/Cmd+K from anywhere: the page's own commands,
 * then everyone's, matched letter by letter, and from two letters on the
 * workspace's records under "Quick results". Esc closes it and gives focus back
 * to what had it. It also owns `/` outside a text field, which opens the search page.
 */
export const CommandMenu: React.FC<CommandMenuProps> = ({ workspace, navigate }) => {
  const open = useAppStore((state) => state.isCommandMenuOpen);
  const setCommandMenuOpen = useAppStore((state) => state.setCommandMenuOpen);
  // A choice moves focus to its destination; only a dismissal gives it back.
  const choiceMade = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A row selection runs Ctrl/Cmd+K for its own actions first and stops it.
      if (event.defaultPrevented || event.isComposing) return;
      const isOpen = useAppStore.getState().isCommandMenuOpen;
      const modified = event.ctrlKey || event.metaKey;
      if (modified && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        // From a text field too, as in Linear; pressed again, it closes the menu.
        if (isOpen) {
          event.preventDefault();
          setCommandMenuOpen(false);
        } else if (!document.querySelector(OPEN_LAYER_SELECTOR)) {
          event.preventDefault();
          openCommandMenu();
        }
        return;
      }
      if (event.key !== '/' || modified || event.altKey || isOpen) return;
      if (isTypingTarget(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      event.preventDefault();
      // In Settings `/` searches the settings, as Linear's "Search settings /".
      if (useAppStore.getState().activeTab === 'preferences') {
        document.querySelector<HTMLInputElement>(SETTINGS_SEARCH_SELECTOR)?.focus();
        return;
      }
      openSearchPage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandMenuOpen]);

  // A menu still open when the workspace closes must not reopen in the next one.
  useEffect(() => () => setCommandMenuOpen(false), [setCommandMenuOpen]);

  const choose = (action: () => void) => {
    choiceMade.current = true;
    setCommandMenuOpen(false);
    action();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setCommandMenuOpen(next)}>
      <Dialog.Portal>
        {/* Linear dims nothing behind its command menu. */}
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // Radix would focus a trigger this menu does not have.
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
          <Dialog.Title className="sr-only">Command menu</Dialog.Title>
          <CommandPalette workspace={workspace} navigate={navigate} choose={choose} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** Quick results start at two letters, as in Linear; one letter only filters commands. */
const QUICK_RESULTS_MIN_LENGTH = 2;
const QUICK_RESULTS_LIMIT = 8;
const QUICK_RESULTS_DELAY_MS = 120;

const FOOTER_HINT_CLASS = 'flex h-6 items-center gap-1.5 px-2 text-[12px] font-medium text-[var(--text-secondary)]';

const arrowIcon = <ArrowRight size={14} strokeWidth={1.75} />;

const OPEN_PALETTE_KINDS = Object.keys(OPEN_KEYS) as OpenPaletteKind[];

interface CommandPaletteProps {
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
  choose: (action: () => void) => void;
}

/** The menu's content, mounted on every open so it starts empty. */
const CommandPalette: React.FC<CommandPaletteProps> = ({ workspace, navigate, choose }) => {
  const activeTab = useAppStore((state) => state.activeTab);
  const campaignFilterTab = useAppStore((state) => state.campaignFilterTab);
  const openCreateRuleModal = useAppStore((state) => state.openCreateRuleModal);
  const isSidebarCollapsed = useAppStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((state) => state.toggleSidebarCollapsed);
  const scope = useAppStore((state) => state.workspaceScope);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const lastAppTab = useAppStore((state) => state.lastAppTab);
  const pageGroup = usePageGroup();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const text = query.trim();
  const quick = useQuickResults(text);

  // The same address again re-opens it in place instead of repeating history.
  const go = (path: string) => navigate(path, `${window.location.pathname}${window.location.search}` === path);
  const slug = workspace.slug;
  const rulesPath = pathForTab(slug, 'rules');
  const advancedSearch = () => {
    if (!text) {
      openSearchPage();
      return;
    }
    if (useAppStore.getState().activeTab !== 'search') {
      rememberSearchReturnPath(`${window.location.pathname}${window.location.search}`);
    }
    go(searchPagePath(slug, { query: text, tab: 'all', statuses: [], accounts: [], order: 'relevance', includeDeleted: false }));
  };

  const inSettings = activeTab === 'preferences';
  // In Settings Linear's menu opens with the settings pages, grouped as in "Open settings…".
  const settingsGroups: PaletteGroup[] = inSettings
    ? SETTINGS_PAGE_GROUPS.map((group) => ({
      heading: group.heading,
      commands: group.pages.map((page) => ({
        id: `settings-${page.section}`,
        label: page.label,
        keywords: SETTINGS_PAGE_KEYWORDS[page.section].split(' '),
        icon: <SettingsPageIcon section={page.section} size={14} />,
        run: () => {
          setSettingsSection(page.section);
          setActiveTab('preferences');
        },
      })),
    }))
    : [];

  const groups: PaletteGroup[] = [
    ...settingsGroups,
    ...(pageGroup ? [pageGroup] : []),
    {
      heading: 'Rules',
      commands: [{
        id: 'create-rule',
        label: 'Create rule…',
        keywords: ['new rule', 'automation'],
        icon: <LinearPlusIcon size={14} />,
        // C creates a rule on the Rules page only, so the key shows there.
        shortcut: activeTab === 'rules' ? 'C' : undefined,
        run: () => {
          go(rulesPath);
          openCreateRuleModal();
        },
      }],
    },
    {
      heading: 'Filter',
      commands: [
        { id: 'search', label: 'Search workspace…', keywords: ['find', 'campaigns', 'rules'], icon: <LinearSearchIcon size={14} />, run: openSearchPage },
      ],
    },
    {
      heading: 'Navigation',
      commands: [
        { id: 'advanced-search', label: 'Go to advanced search', icon: <Maximize2 size={13} strokeWidth={1.75} />, shortcut: '/', run: advancedSearch },
        // Linear leaves out Go to inbox on Inbox itself.
        ...(activeTab === 'inbox'
          ? []
          : [{ id: 'inbox', label: 'Go to inbox', keywords: ['notifications', 'events'], icon: arrowIcon, shortcut: goToShortcut('inbox'), run: () => go(pathForTab(slug, 'inbox')) }]),
        { id: 'ads-manager', label: 'Go to Ads Manager', keywords: ['campaigns', 'ad sets', 'ads', 'meta'], icon: arrowIcon, shortcut: goToShortcut('campaigns'), run: () => go(pathForTab(slug, 'campaigns', campaignFilterTab)) },
        { id: 'rules', label: 'Go to rules', keywords: ['automation'], icon: arrowIcon, shortcut: goToShortcut('rules'), run: () => go(rulesPath) },
        { id: 'settings', label: 'Go to settings', keywords: ['preferences', 'profile', 'members', 'notifications'], icon: arrowIcon, shortcut: goToShortcut('preferences'), run: () => go(pathForTab(slug, 'preferences')) },
        // Linear's "Open issue…" and its siblings, each its own palette.
        ...OPEN_PALETTE_KINDS.map((kind) => ({
          id: `open-${kind}`,
          label: OPEN_PALETTE_LABELS[kind],
          keywords: ['open', 'jump', 'find'],
          icon: <OpenPaletteIcon kind={kind} size={14} />,
          shortcut: openShortcut(kind),
          run: () => openOpenPalette(kind),
        })),
        // The sidebar is a drawer on a phone; [ collapses it on a wider screen. Settings has its own.
        ...(isSmallScreen() || activeTab === 'preferences'
          ? []
          : [{
            id: 'toggle-sidebar',
            label: isSidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar',
            icon: <LinearSidebarLeftToggleIcon size={14} isOpen={!isSidebarCollapsed} />,
            shortcut: '[',
            run: toggleSidebarCollapsed,
          }]),
        // Linear's way out of Settings, also on Ctrl+Esc there.
        ...(inSettings
          ? [{ id: 'back-to-app', label: 'Back to app', icon: arrowIcon, shortcut: 'Ctrl Esc', run: () => setActiveTab(lastAppTab) }]
          : []),
      ],
    },
  ];

  const shownGroups = groups
    .map((group) => ({ ...group, commands: filterCommands(group.commands, text) }))
    .filter((group) => group.commands.length > 0);
  const showQuick = text.length >= QUICK_RESULTS_MIN_LENGTH && quick !== null;
  const results = showQuick ? quick.slice(0, QUICK_RESULTS_LIMIT) : [];
  const onRecord = selected.startsWith('result:');
  const shownCount = shownGroups.reduce((sum, group) => sum + group.commands.length, 0) + (showQuick ? results.length + 1 : 0);

  return (
    <Command
      label="Command menu"
      shouldFilter={false}
      loop
      vimBindings={false}
      value={selected}
      // cmdk clears the choice when the list empties; undefined would break the footer.
      onValueChange={(next) => setSelected(next ?? '')}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === '/') {
          event.preventDefault();
          choose(advancedSearch);
        }
      }}
    >
      <div className={COMMAND_MENU_CLASSES.field}>
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command or search…"
          className={COMMAND_MENU_CLASSES.input}
        />
      </div>
      <p role="status" className="sr-only">{text ? `Showing ${shownCount} items` : 'Showing all items'}</p>
      <Command.List className={`min-h-0 flex-1 ${COMMAND_MENU_CLASSES.list}`}>
        {shownGroups.map((group) => (
          <Command.Group key={group.heading || 'pages'} heading={group.heading || undefined} className={COMMAND_MENU_CLASSES.group}>
            {group.commands.map((command) => (
              <Command.Item
                key={command.id}
                value={`command:${command.id}`}
                aria-label={command.label}
                onSelect={() => choose(command.run)}
                className={COMMAND_MENU_CLASSES.item}
              >
                <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true">{command.icon}</span>
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.shortcut && <ShortcutKeys shortcut={command.shortcut} />}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        {showQuick && (
          <Command.Group heading={`Quick results for "${text}"`} className={COMMAND_MENU_CLASSES.group}>
            {results.map((result) => (
              <Command.Item
                key={`${result.kind}:${result.id}`}
                value={`result:${result.kind}:${result.id}`}
                aria-label={quickResultName(result)}
                onSelect={() => choose(() => {
                  rememberOpenedRecord(scope, result);
                  go(searchResultPath(slug, result));
                })}
                className={COMMAND_MENU_CLASSES.item}
              >
                <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><StatusMark result={result} /></span>
                <QuickResultLabel result={result} />
              </Command.Item>
            ))}
            <Command.Item
              value="search-entire-workspace"
              aria-label={results.length > 0 ? `Search entire workspace ${text}` : 'No results found, go to advanced search'}
              onSelect={() => choose(advancedSearch)}
              className={COMMAND_MENU_CLASSES.item}
            >
              <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><LinearSearchIcon size={14} /></span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0">{results.length > 0 ? 'Search entire workspace' : 'No results found'}</span>
                <span className="min-w-0 truncate text-[var(--text-muted)]">{results.length > 0 ? text : 'Go to advanced search'}</span>
              </span>
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
      {showQuick && (
        // Linear's footer: 35px under a rule, each hint a small button with its keys boxed.
        <div className="flex h-[35px] shrink-0 items-center gap-1.5 border-t border-[var(--command-menu-border)] px-1">
          <span className={FOOTER_HINT_CLASS}>
            <CommandMenuFooterKeys keys={['↵']} />
            <span>{onRecord ? 'Open' : 'Select'}</span>
          </span>
          <button
            type="button"
            className={`${FOOTER_HINT_CLASS} rounded-[6px] hover:bg-[var(--command-menu-row-selected-bg)]`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(advancedSearch)}
          >
            <span>Advanced search</span>
            <CommandMenuFooterKeys keys={['Ctrl', '/']} />
          </button>
        </div>
      )}
    </Command>
  );
};

/** Commands matching what is typed, best first; nothing typed keeps their order. */
function filterCommands(commands: PaletteCommand[], text: string): PaletteCommand[] {
  if (!text) return commands;
  return commands
    .map((command, index) => ({ command, index, score: bestCommandScore(text, command.label, command.keywords) }))
    .filter((entry): entry is { command: PaletteCommand; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

/** Where a result lives: its ad account, or an ad account's own ID; a rule lives in Rules. */
function quickResultWhere(result: SearchResult): string {
  if (result.kind === 'account') return result.id;
  return result.kind === 'rule' ? '' : result.account_name || result.account_id;
}

function quickResultName(result: SearchResult): string {
  const where = quickResultWhere(result);
  return `${SEARCH_KIND_LABELS[result.kind]} ${result.name}${where ? `, ${where}` : ''}`;
}

/** Linear's "Project › Test": the kind muted, then the name, then where it lives. */
const QuickResultLabel: React.FC<{ result: SearchResult }> = ({ result }) => {
  const where = quickResultWhere(result);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 text-[var(--text-tertiary)]">{SEARCH_KIND_LABELS[result.kind]}</span>
      <span className="shrink-0 text-[var(--text-muted)]" aria-hidden="true">›</span>
      <span className="min-w-0 truncate text-[var(--text-secondary)]">{result.name}</span>
      {where && <span className="min-w-0 shrink-[200000] truncate text-[var(--text-muted)]">{where}</span>}
    </span>
  );
};

/**
 * The workspace's records for what is typed, from GET /api/search; null until
 * the first answer for a query long enough. The last answer stays while the
 * next one loads, as in Linear.
 */
function useQuickResults(text: string): SearchResult[] | null {
  const [answer, setAnswer] = useState<{ query: string; results: SearchResult[] } | null>(null);

  useEffect(() => {
    if (text.length < QUICK_RESULTS_MIN_LENGTH) {
      setAnswer(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchWorkspace(
        { query: text, tab: 'all', statuses: [], accounts: [], order: 'relevance', includeDeleted: false },
        controller.signal,
      )
        .then((response) => setAnswer({ query: text, results: response.results }))
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ query: text, results: [] });
        });
    }, QUICK_RESULTS_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  return answer?.results ?? null;
}

const KEY_NAMES: Record<string, string> = { Shift: '⇧', Alt: 'Alt', Ctrl: 'Ctrl' };
const SEQUENCE_PREFIXES = new Set(['G', 'O', 'N']);

/** Linear's keys on the right: boxed, and "G then S" for a sequence. */
const ShortcutKeys: React.FC<{ shortcut: string }> = ({ shortcut }) => {
  const parts = shortcut.split(' ').map((part) => KEY_NAMES[part] ?? part);
  const sequence = parts.length === 2 && SEQUENCE_PREFIXES.has(parts[0]) && /^[A-Z]$/.test(parts[1]);
  return (
    <span className="flex shrink-0 items-center gap-[3px]" aria-label={sequence ? `${parts[0]} then ${parts[1]}` : parts.join(' ')}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {sequence && index === 1 && <span className="px-px text-[12px] font-[450] text-[var(--text-tertiary)]" aria-hidden="true">then</span>}
          <kbd
            aria-hidden="true"
            className={COMMAND_MENU_CLASSES.kbd}
          >
            {part}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
};
