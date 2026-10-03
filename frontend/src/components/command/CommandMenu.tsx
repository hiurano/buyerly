import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Image as ImageIcon, Layers, Megaphone, RotateCcw, Settings, Wallet } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { pathForTab, STATISTICS_ENABLED } from '@/lib/routing';
import {
  SEARCH_KINDS,
  searchResultPath,
  searchWorkspace,
  type SearchKind,
  type SearchResponse,
  type SearchResult,
} from '@/lib/search';
import type { Workspace } from '@/lib/types';
import { humanizeMetaStatus } from '@/components/campaigns/liveCampaigns';
import { COMMAND_MENU_CLASSES } from '@/ui/SelectionCommandMenu';
import {
  LinearBoltIcon,
  LinearChartIcon,
  LinearInboxIcon,
  LinearMetaIcon,
  LinearPlusIcon,
  LinearSearchIcon,
} from '@/icons/LinearIcons';

/** Pause after the last keystroke before the workspace is asked. */
const SEARCH_DELAY_MS = 200;

/** Something else holds the keyboard while it is open: a dialog, a menu, another palette. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.linear-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '[cmdk-root]',
].join(', ');

/** Inputs that take no typed text, so `/` on them still opens the menu. */
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

/** Opens Search workspace, remembering where focus goes back to. */
export function openCommandMenu(): void {
  const store = useAppStore.getState();
  if (store.isSearchOpen) return;
  const active = document.activeElement;
  returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null;
  store.setSearchOpen(true);
}

interface CommandMenuProps {
  workspace: Workspace;
  /** Opens an address in the app; `replace` keeps history from repeating it. */
  navigate: (path: string, replace?: boolean) => void;
}

/**
 * Search workspace, Linear's command menu, opened by the sidebar button, `/`
 * outside a text field, or Ctrl/Cmd+K from anywhere. It offers the screens to
 * go to and searches this workspace for campaigns, ad sets, ads, rules and ad
 * accounts — what GET /api/search covers, and nothing it cannot open. Esc
 * closes it and gives focus back to what had it.
 */
export const CommandMenu: React.FC<CommandMenuProps> = ({ workspace, navigate }) => {
  const open = useAppStore((state) => state.isSearchOpen);
  const setSearchOpen = useAppStore((state) => state.setSearchOpen);
  // A choice moves focus to its destination; only a dismissal gives it back.
  const choiceMade = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A row selection runs Ctrl/Cmd+K for its own actions first and stops it.
      if (event.defaultPrevented || event.isComposing) return;
      const isOpen = useAppStore.getState().isSearchOpen;
      const modified = event.ctrlKey || event.metaKey;
      if (modified && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        // From a text field too, as in Linear; pressed again, it closes the menu.
        if (isOpen) {
          event.preventDefault();
          setSearchOpen(false);
        } else if (!document.querySelector(OPEN_LAYER_SELECTOR)) {
          event.preventDefault();
          openCommandMenu();
        }
        return;
      }
      if (event.key !== '/' || modified || event.altKey || isOpen) return;
      if (isTypingTarget(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      event.preventDefault();
      openCommandMenu();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);

  // Settings renders no menu: one still open when this unmounts must not reopen on the way back.
  useEffect(() => () => setSearchOpen(false), [setSearchOpen]);

  const choose = (action: () => void) => {
    choiceMade.current = true;
    setSearchOpen(false);
    action();
  };

  return (
    <Dialog.Root open={open} onOpenChange={setSearchOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--layer-command-menu)] bg-[var(--modal-overlay-bg)]" />
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
          className={`fixed inset-x-4 top-[13vh] z-[var(--layer-command-menu)] mx-auto max-w-[720px] outline-none ${COMMAND_MENU_CLASSES.surface}`}
        >
          <Dialog.Title className="sr-only">Search workspace</Dialog.Title>
          <CommandPalette workspace={workspace} navigate={navigate} choose={choose} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

interface PaletteCommand {
  id: string;
  label: string;
  /** Other words that find it: "campaigns" finds Ads Manager. */
  keywords: string[];
  icon: React.ReactNode;
  run: () => void;
}

/** The answer on screen always belongs to the text in the field, never to an earlier one. */
type SearchState =
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; response: SearchResponse }
  | { status: 'error'; query: string; message: string };

const KIND_ICONS: Record<SearchKind, React.ReactNode> = {
  campaign: <Megaphone size={14} strokeWidth={1.75} />,
  adset: <Layers size={14} strokeWidth={1.75} />,
  ad: <ImageIcon size={14} strokeWidth={1.75} />,
  rule: <LinearBoltIcon size={14} />,
  account: <Wallet size={14} strokeWidth={1.75} />,
};

const RULE_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  needs_review: 'Needs review',
};

/** The line under a result's name: where it lives. */
function resultContext(result: SearchResult): string {
  if (result.kind === 'account') return result.id;
  if (result.kind === 'rule') return '';
  return [result.parent_name, result.account_name].filter(Boolean).join(' · ');
}

/** Delivery or run state in words, never by colour alone. */
function resultStatus(result: SearchResult): string {
  if (result.kind === 'account' || !result.status) return '';
  if (result.kind === 'rule') return RULE_STATUS_LABELS[result.status] ?? '';
  return humanizeMetaStatus(result.status);
}

interface CommandPaletteProps {
  workspace: Workspace;
  navigate: (path: string, replace?: boolean) => void;
  choose: (action: () => void) => void;
}

/** The menu's content, mounted on every open so it starts empty. */
const CommandPalette: React.FC<CommandPaletteProps> = ({ workspace, navigate, choose }) => {
  const campaignFilterTab = useAppStore((state) => state.campaignFilterTab);
  const openCreateRuleModal = useAppStore((state) => state.openCreateRuleModal);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const text = query.trim();

  useEffect(() => {
    if (!text) return undefined;
    setSearch({ status: 'loading', query: text });
    const controller = new AbortController();
    const inScope = useAppStore.getState().captureScope();
    const timer = window.setTimeout(() => {
      searchWorkspace(text, controller.signal)
        .then((response) => {
          if (!controller.signal.aborted && inScope()) setSearch({ status: 'ready', query: text, response });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || !inScope()) return;
          const message = error instanceof Error && error.message ? error.message : 'Something went wrong.';
          setSearch({ status: 'error', query: text, message });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, attempt]);

  const current: SearchState | null = !text
    ? null
    : search?.query === text
      ? search
      : { status: 'loading', query: text };

  // The same address again re-opens it in place instead of repeating history.
  const go = (path: string) => navigate(path, `${window.location.pathname}${window.location.search}` === path);
  const slug = workspace.slug;
  const rulesPath = pathForTab(slug, 'rules');
  const commands: PaletteCommand[] = [
    { id: 'inbox', label: 'Go to Inbox', keywords: ['notifications', 'events'], icon: <LinearInboxIcon size={14} />, run: () => go(pathForTab(slug, 'inbox')) },
    { id: 'ads-manager', label: 'Go to Ads Manager', keywords: ['campaigns', 'ad sets', 'ads', 'meta'], icon: <LinearMetaIcon size={14} />, run: () => go(pathForTab(slug, 'campaigns', campaignFilterTab)) },
    { id: 'rules', label: 'Go to Rules', keywords: ['automation'], icon: <LinearBoltIcon size={14} />, run: () => go(rulesPath) },
    ...(STATISTICS_ENABLED
      ? [{ id: 'statistics', label: 'Go to Statistics', keywords: ['metrics', 'analytics'], icon: <LinearChartIcon size={14} />, run: () => go(pathForTab(slug, 'statistics')) }]
      : []),
    { id: 'settings', label: 'Go to Settings', keywords: ['preferences', 'profile', 'members', 'notifications'], icon: <Settings size={14} strokeWidth={1.75} />, run: () => go(pathForTab(slug, 'preferences')) },
    {
      id: 'create-rule',
      label: 'Create rule…',
      keywords: ['new rule', 'automation'],
      icon: <LinearPlusIcon size={14} />,
      run: () => {
        go(rulesPath);
        openCreateRuleModal();
      },
    },
  ];
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const shownCommands = commands.filter((command) => {
    const haystack = [command.label, ...command.keywords].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });

  const response = current?.status === 'ready' ? current.response : null;
  const groups = response
    ? SEARCH_KINDS.map(({ kind, heading }) => ({
      kind,
      heading: response.truncated.includes(kind) ? `${heading} · first ${response.limit}` : heading,
      results: response.results.filter((result) => result.kind === kind),
    })).filter((group) => group.results.length > 0)
    : [];

  const scope = workspace.name;
  const resultCount = response?.results.length ?? 0;
  const hasRows = shownCommands.length > 0 || groups.length > 0 || current?.status === 'error';
  const note = !current
    ? `Search campaigns, ad sets, ads, rules and ad accounts in ${scope}.`
    : current.status === 'loading'
      ? `Searching ${scope}…`
      : current.status === 'error'
        ? `Couldn't search ${scope}. ${current.message}`
        : resultCount === 0
          ? `No campaigns, ad sets, ads, rules or ad accounts in ${scope} match “${current.query}”.`
          : `${resultCount} ${resultCount === 1 ? 'result' : 'results'} in ${scope}.`;

  return (
    <Command label="Search workspace" shouldFilter={false} loop vimBindings={false}>
      <div className="flex items-center gap-2 border-b border-[var(--color-border-primary)] pl-3 pr-2.5">
        <span className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true">
          <LinearSearchIcon size={16} />
        </span>
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command or search…"
          className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
        />
        <Dialog.Close
          aria-label="Close search"
          className="shrink-0 rounded-[4px] border border-[var(--color-border-secondary)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--text-tertiary)] outline-none hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
        >
          Esc
        </Dialog.Close>
      </div>
      <Command.List
        className={hasRows ? `${COMMAND_MENU_CLASSES.list} pt-1.5` : undefined}
        aria-busy={current?.status === 'loading'}
      >
        {shownCommands.length > 0 && (
          <Command.Group heading="Commands" className={COMMAND_MENU_CLASSES.group}>
            {shownCommands.map((command) => (
              <Command.Item
                key={command.id}
                value={`command:${command.id}`}
                onSelect={() => choose(command.run)}
                className={COMMAND_MENU_CLASSES.item}
              >
                <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true">{command.icon}</span>
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {groups.map((group) => (
          <Command.Group key={group.kind} heading={group.heading} className={COMMAND_MENU_CLASSES.group}>
            {group.results.map((result) => {
              const context = resultContext(result);
              const status = resultStatus(result);
              return (
                <Command.Item
                  key={`${result.kind}:${result.id}`}
                  value={`${result.kind}:${result.id}`}
                  onSelect={() => choose(() => go(searchResultPath(slug, result)))}
                  className={COMMAND_MENU_CLASSES.item}
                >
                  <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true">{KIND_ICONS[result.kind]}</span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="min-w-0 shrink truncate">{result.name}</span>
                    {context && (
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-tertiary)]">{context}</span>
                    )}
                  </span>
                  {status && <span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">{status}</span>}
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
        {current?.status === 'error' && (
          <Command.Group heading="Search" className={COMMAND_MENU_CLASSES.group}>
            <Command.Item
              value="search:retry"
              onSelect={() => setAttempt((value) => value + 1)}
              className={COMMAND_MENU_CLASSES.item}
            >
              <span className={COMMAND_MENU_CLASSES.icon} aria-hidden="true"><RotateCcw size={14} strokeWidth={1.75} /></span>
              <span className="min-w-0 flex-1 truncate">Retry search</span>
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
      <p
        role="status"
        className={
          resultCount > 0
            ? 'sr-only'
            : `${COMMAND_MENU_CLASSES.note} ${hasRows ? 'border-t border-[var(--color-border-primary)]' : ''}`
        }
      >
        {note}
      </p>
    </Command>
  );
};
