import type { SettingsSection } from '@/store/useAppStore';
import type { Workspace } from './types';
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
  workspace: 'workspace name logo url address slug delete workspace',
  teams: 'teams team create team',
  members: 'members invite invitations people team users roles',
};

type SettingsPageGroup = { heading: string; pages: { section: SettingsPage; label: string }[] };

/** Linear's Administration pages; only a workspace owner or admin sees them. */
export const ADMINISTRATION_PAGES: SettingsPage[] = ['workspace', 'teams', 'members'];

export function canAdministerWorkspace(workspace: Pick<Workspace, 'role'>): boolean {
  return workspace.role === 'owner' || workspace.role === 'admin';
}

/**
 * The pages in the sidebar's order, under the sidebar's names, in Linear's
 * "Open settings…" groups: the account's own pages first with no heading,
 * then "Administration" in Linear's order: Workspace, Teams, Members.
 */
export const SETTINGS_PAGE_GROUPS: SettingsPageGroup[] = [
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
  {
    heading: 'Administration',
    pages: [
      { section: 'workspace', label: 'Workspace' },
      { section: 'teams', label: 'Teams' },
      { section: 'members', label: 'Members' },
    ],
  },
];

/** The groups this member may open: Administration only for an owner or admin. */
export function settingsGroupsFor(workspace: Pick<Workspace, 'role'>): SettingsPageGroup[] {
  return canAdministerWorkspace(workspace)
    ? SETTINGS_PAGE_GROUPS
    : SETTINGS_PAGE_GROUPS.filter((group) => group.heading !== 'Administration');
}

/**
 * The groups with only the pages matching what is typed, best first within a
 * group, matched as the command menu matches; empty groups drop out.
 */
export function filterSettingsGroups(text: string, groups: SettingsPageGroup[] = SETTINGS_PAGE_GROUPS): SettingsPageGroup[] {
  if (!text) return groups;
  return groups
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
