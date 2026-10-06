import type { SettingsSection } from '@/store/useAppStore';
import { bestCommandScore } from './commandFilter';

/** The settings pages in the sidebar; the notification channels open from Notifications. */
export type SettingsPage = Exclude<SettingsSection, 'priority-notifications' | 'email-notifications' | 'telegram-notifications'>;

/** Keywords the settings search and "Open settings…" match against, per page. */
export const SETTINGS_PAGE_KEYWORDS: Record<SettingsPage, string> = {
  preferences: 'preferences interface theme appearance ai assistant agent webmcp chrome',
  profile: 'profile account email name avatar',
  notifications: 'notifications inbox priority inbox custom filters push email telegram',
  security: 'security access sessions devices auth log out logout revoke sign in',
  'connected-accounts': 'connected accounts telegram connect disconnect',
  members: 'members invite invitations people team users roles',
};

/**
 * The pages in the sidebar's order, under the sidebar's names, in Linear's
 * "Open settings…" groups: the account's own pages first with no heading,
 * then "Administration", where Linear lists Members.
 */
export const SETTINGS_PAGE_GROUPS: { heading: string; pages: { section: SettingsPage; label: string }[] }[] = [
  {
    heading: '',
    pages: [
      { section: 'preferences', label: 'Preferences' },
      { section: 'profile', label: 'Profile' },
      { section: 'notifications', label: 'Notifications' },
      { section: 'security', label: 'Security & access' },
      { section: 'connected-accounts', label: 'Connected accounts' },
    ],
  },
  { heading: 'Administration', pages: [{ section: 'members', label: 'Members' }] },
];

/**
 * The groups with only the pages matching what is typed, best first within a
 * group, matched as the command menu matches; empty groups drop out.
 */
export function filterSettingsGroups(text: string): typeof SETTINGS_PAGE_GROUPS {
  if (!text) return SETTINGS_PAGE_GROUPS;
  return SETTINGS_PAGE_GROUPS
    .map((group) => ({
      heading: group.heading,
      pages: group.pages
        .map((page, index) => ({ page, index, score: bestCommandScore(text, page.label, SETTINGS_PAGE_KEYWORDS[page.section].split(' ')) }))
        .filter((entry) => entry.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.index - b.index)
        .map((entry) => entry.page),
    }))
    .filter((group) => group.pages.length > 0);
}
