import { GO_TO_KEYS, OPEN_KEYS } from '@/lib/shortcuts';

/**
 * One row of the keyboard shortcuts panel. `keys` are pressed together;
 * `then` is a second key pressed after them ("G, then I"). Modifiers are the
 * words `mod` (⌘ on a Mac, Ctrl elsewhere), `shift` and `alt`.
 */
export interface ShortcutEntry {
  label: string;
  keys: string[];
  then?: string;
  keywords?: string;
}

export interface ShortcutGroup {
  name: string;
  shortcuts: ShortcutEntry[];
}

/**
 * Every shortcut Buyerly handles, grouped and worded as Linear's panel
 * (General, Navigation, …, List / Board, Inbox, Filters). Only keys the app
 * really answers are listed; keep this in step when one is added.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    name: 'General',
    shortcuts: [
      { label: 'Open command menu', keys: ['mod', 'K'] },
      { label: 'Open search', keys: ['/'] },
      { label: 'Open help menu', keys: ['?'] },
      { label: 'View keyboard shortcuts', keys: ['mod', '/'] },
      { label: 'Switch workspace', keys: ['O'], then: 'W' },
      { label: 'Undo', keys: ['mod', 'Z'] },
      { label: 'Redo', keys: ['mod', 'shift', 'Z'] },
      { label: 'Mark as favorite', keys: ['alt', 'F'], keywords: 'star page' },
      { label: 'Log out', keys: ['alt', 'shift', 'Q'] },
    ],
  },
  {
    name: 'Navigation',
    shortcuts: [
      { label: 'Toggle left sidebar', keys: ['['] },
      { label: 'Toggle right sidebar', keys: [']'], keywords: 'details pane' },
      { label: 'Go to inbox', keys: ['G'], then: GO_TO_KEYS.inbox },
      { label: 'Go to campaigns', keys: ['G'], then: GO_TO_KEYS.campaigns, keywords: 'ads manager' },
      { label: 'Go to ad accounts', keys: ['G'], then: GO_TO_KEYS.accounts },
      { label: 'Go to rules', keys: ['G'], then: GO_TO_KEYS.rules },
      { label: 'Go to settings', keys: ['G'], then: GO_TO_KEYS.preferences, keywords: 'preferences' },
      { label: 'Open campaign', keys: ['O'], then: OPEN_KEYS.campaign },
      { label: 'Open ad set', keys: ['O'], then: OPEN_KEYS.adset },
      { label: 'Open ad', keys: ['O'], then: OPEN_KEYS.ad },
      { label: 'Open rule', keys: ['O'], then: OPEN_KEYS.rule },
      { label: 'Open ad account', keys: ['O'], then: OPEN_KEYS.account },
      { label: 'Open settings page', keys: ['O'], then: OPEN_KEYS.settings },
      { label: 'Open a favorite', keys: ['O'], then: OPEN_KEYS.favorite },
      { label: 'Focus notifications', keys: ['alt', 'T'], keywords: 'toast' },
      { label: 'Show display options', keys: ['shift', 'V'], keywords: 'view preferences' },
    ],
  },
  {
    name: 'Campaigns',
    shortcuts: [
      { label: 'Pause delivery', keys: ['P'], keywords: 'selection campaign ad set ad' },
      { label: 'Resume delivery', keys: ['R'], keywords: 'selection campaign ad set ad' },
      { label: 'Apply rule', keys: ['A'], keywords: 'selection campaign ad set' },
    ],
  },
  {
    name: 'Rules',
    shortcuts: [
      { label: 'New rule', keys: ['C'], keywords: 'create' },
      { label: 'Add labels', keys: ['L'], keywords: 'rule label' },
      { label: 'Pause rules', keys: ['P'], keywords: 'selection' },
      { label: 'Resume rules', keys: ['R'], keywords: 'selection' },
      { label: 'Delete rules', keys: ['⌫'], keywords: 'selection remove' },
    ],
  },
  {
    name: 'List / Board',
    shortcuts: [
      { label: 'Select item', keys: ['X'], keywords: 'list board' },
      { label: 'Select all items', keys: ['mod', 'A'], keywords: 'list board' },
      { label: 'Clear selection', keys: ['Esc'] },
      { label: 'Toggle layout view', keys: ['mod', 'B'], keywords: 'list board' },
    ],
  },
  {
    name: 'Inbox',
    shortcuts: [
      { label: 'Next notification', keys: ['J'], keywords: 'inbox down' },
      { label: 'Previous notification', keys: ['K'], keywords: 'inbox up' },
      { label: 'Delete notification', keys: ['⌫'], keywords: 'inbox' },
      { label: 'Delete all read notifications', keys: ['shift', '⌫'], keywords: 'inbox' },
      { label: 'Mark as read/unread', keys: ['U'], keywords: 'inbox' },
      { label: 'Snooze notification', keys: ['H'], keywords: 'inbox' },
    ],
  },
  {
    name: 'Filters',
    shortcuts: [{ label: 'Add filter', keys: ['F'] }],
  },
];

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

/** How a key is printed on its cap, as Linear's: ⌘ ⇧ ⌥ on a Mac, Ctrl and Alt elsewhere. */
export function keyCap(key: string): string {
  if (key === 'mod') return IS_MAC ? '⌘' : 'Ctrl';
  if (key === 'shift') return '⇧';
  if (key === 'alt') return IS_MAC ? '⌥' : 'Alt';
  return key;
}

/** The groups whose name, rows or keys match what was typed; empty text keeps them all. */
export function filterShortcutGroups(text: string, groups = SHORTCUT_GROUPS): ShortcutGroup[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups;
  return groups
    .map((group) => ({
      ...group,
      shortcuts: group.shortcuts.filter((entry) => {
        const haystack = [group.name, entry.label, entry.keywords ?? '', ...entry.keys.map(keyCap), entry.then ?? '']
          .join(' ')
          .toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((group) => group.shortcuts.length > 0);
}
