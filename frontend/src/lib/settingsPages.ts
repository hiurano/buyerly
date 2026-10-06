import type { SettingsSection } from '@/store/useAppStore';

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

/** The pages in the sidebar's order, under the sidebar's names. */
export const SETTINGS_PAGES: { section: SettingsPage; label: string }[] = [
  { section: 'preferences', label: 'Preferences' },
  { section: 'profile', label: 'Profile' },
  { section: 'notifications', label: 'Notifications' },
  { section: 'security', label: 'Security & access' },
  { section: 'connected-accounts', label: 'Connected accounts' },
  { section: 'members', label: 'Members' },
];
