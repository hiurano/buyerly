import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Settings } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { pathForTab, STATISTICS_ENABLED } from '@/lib/routing';
import type { Workspace } from '@/lib/types';
import { openSearchPage } from '@/components/search/openSearchPage';
import { COMMAND_MENU_CLASSES } from '@/ui/SelectionCommandMenu';
import {
  LinearBoltIcon,
  LinearChartIcon,
  LinearInboxIcon,
  LinearMetaIcon,
  LinearPlusIcon,
  LinearSearchIcon,
} from '@/icons/LinearIcons';

/** Something else holds the keyboard while it is open: a dialog, a menu, another palette. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]:not(.linear-menu-exit)',
  '[role="alertdialog"]',
  '[role="menu"]:not([data-state="closed"])',
  '[cmdk-root]',
].join(', ');

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
 * Linear's command menu — Ctrl/Cmd+K from anywhere — runs commands and
 * searches nothing; Esc closes it and gives focus back to what had it. It also
 * owns `/` outside a text field, which opens the search page.
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
      openSearchPage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandMenuOpen]);

  // Settings renders no menu: one still open when this unmounts must not reopen on the way back.
  useEffect(() => () => setCommandMenuOpen(false), [setCommandMenuOpen]);

  const choose = (action: () => void) => {
    choiceMade.current = true;
    setCommandMenuOpen(false);
    action();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setCommandMenuOpen(next)}>
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
          <Dialog.Title className="sr-only">Command menu</Dialog.Title>
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
  const text = query.trim();

  // The same address again re-opens it in place instead of repeating history.
  const go = (path: string) => navigate(path, `${window.location.pathname}${window.location.search}` === path);
  const slug = workspace.slug;
  const rulesPath = pathForTab(slug, 'rules');
  const commands: PaletteCommand[] = [
    { id: 'search', label: 'Search workspace…', keywords: ['find', 'campaigns', 'rules'], icon: <LinearSearchIcon size={14} />, run: openSearchPage },
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

  return (
    <Command label="Command menu" shouldFilter={false} loop vimBindings={false}>
      <div className="flex items-center gap-2 border-b border-[var(--color-border-primary)] pl-3 pr-2.5">
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command…"
          className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
        />
        <kbd className="shrink-0 rounded-[4px] border border-[var(--color-border-secondary)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--text-tertiary)]">
          Esc
        </kbd>
      </div>
      <Command.List className={shownCommands.length > 0 ? `${COMMAND_MENU_CLASSES.list} pt-1.5` : undefined}>
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
      </Command.List>
      {shownCommands.length === 0 && (
        <p role="status" className={COMMAND_MENU_CLASSES.note}>{`No commands match “${text}”.`}</p>
      )}
    </Command>
  );
};
