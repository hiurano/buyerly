import type { ActiveTab, AdsManagerEntity, SettingsSection } from '@/store/useAppStore';

export type Route =
  | { kind: 'root' }
  | { kind: 'login' }
  | { kind: 'verify-email-link'; token: string }
  | { kind: 'create-workspace' }
  | { kind: 'invite'; token: string }
  | { kind: 'meta-connect-invite'; token: string }
  | { kind: 'meta-connect-success' }
  | { kind: 'welcome'; workspace: string }
  | {
      kind: 'workspace';
      workspace: string;
      tab: ActiveTab;
      entity?: AdsManagerEntity;
      recordId?: string;
      /** Priority inbox tab, as Linear keeps it in the address. */
      inboxTab?: 'priority' | 'other';
      settingsSection?: SettingsSection;
    }
  | { kind: 'unknown' };

const SYSTEM_ROOTS = new Set([
  // Root segments the server itself serves. Everything else is a workspace slug.
  'about',
  'api',
  'assets',
  'auth',
  'connect',
  'create-workspace',
  'data-deletion',
  'docs',
  'health',
  'invite',
  'login',
  'privacy',
  'redoc',
  'static',
  'terms',
  'uploads',
]);

export function parseRoute(location: Location = window.location): Route {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'root' };
  if (parts.length === 1 && parts[0] === 'login') return { kind: 'login' };
  if (parts.length === 1 && parts[0] === 'create-workspace') return { kind: 'create-workspace' };
  if (parts.length === 3 && parts[0] === 'auth' && parts[1] === 'email' && parts[2] === 'verify') {
    return { kind: 'verify-email-link', token: new URLSearchParams(location.search).get('token') || '' };
  }
  if (parts[0] === 'invite' && parts.length === 2) {
    return { kind: 'invite', token: parts[1] };
  }
  if (parts[0] === 'connect' && parts[1] === 'meta' && parts.length === 3 && parts[2] === 'success') {
    return { kind: 'meta-connect-success' };
  }
  if (parts[0] === 'connect' && parts[1] === 'meta' && parts.length === 3) {
    return { kind: 'meta-connect-invite', token: parts[2] };
  }
  if (SYSTEM_ROOTS.has(parts[0])) return { kind: 'unknown' };

  const workspace = parts[0];
  if (parts.length === 1) {
    return { kind: 'workspace', workspace, tab: 'inbox' };
  }
  if (parts[1] === 'welcome' && parts.length === 2) {
    return { kind: 'welcome', workspace };
  }
  if (parts[1] === 'inbox' && (parts[2] === 'priority' || parts[2] === 'other') && parts.length <= 4) {
    return { kind: 'workspace', workspace, tab: 'inbox', inboxTab: parts[2], recordId: parts[3] };
  }
  if (parts[1] === 'inbox' && parts.length <= 3) {
    return { kind: 'workspace', workspace, tab: 'inbox', recordId: parts[2] };
  }
  if (
    parts[1] === 'ads-manager'
    && parts.length >= 3
    && parts.length <= 4
    && ['campaigns', 'adsets', 'ads'].includes(parts[2])
  ) {
    return {
      kind: 'workspace',
      workspace,
      tab: 'campaigns',
      entity: parts[2] as AdsManagerEntity,
      recordId: parts[3],
    };
  }
  if (parts[1] === 'rules' && parts.length <= 3) {
    return { kind: 'workspace', workspace, tab: 'rules', recordId: parts[2] };
  }
  if (parts[1] === 'search' && parts.length === 2) {
    // Linear's search page; the query, tab and filters live in `?q=…&type=…`.
    return { kind: 'workspace', workspace, tab: 'search' };
  }
  if (parts[1] === 'settings' && parts.length === 2) {
    return { kind: 'workspace', workspace, tab: 'preferences' };
  }
  if (parts[1] === 'settings') {
    const subpath = parts.slice(2).join('/');
    const section = (Object.keys(SETTINGS_PATHS) as Array<keyof typeof SETTINGS_PATHS>)
      .find((key) => SETTINGS_PATHS[key] === subpath);
    if (section) return { kind: 'workspace', workspace, tab: 'preferences', settingsSection: section };
  }
  return { kind: 'unknown' };
}

/** Settings pages with their own address, at Linear's paths. */
export const SETTINGS_PATHS = {
  members: 'members',
  notifications: 'account/notifications',
  'priority-notifications': 'account/notifications/priority-filter',
  'email-notifications': 'account/notifications/email',
  'telegram-notifications': 'account/notifications/telegram',
  'connected-accounts': 'account/connections',
  security: 'account/security',
} as const satisfies Partial<Record<SettingsSection, string>>;

export function isRoutedSettingsSection(section: SettingsSection): section is keyof typeof SETTINGS_PATHS {
  return section in SETTINGS_PATHS;
}

export function pathForTab(
  workspace: string,
  tab: ActiveTab,
  entity: AdsManagerEntity = 'campaigns',
  settingsSection: SettingsSection = 'preferences',
): string {
  if (tab === 'campaigns') return `/${workspace}/ads-manager/${entity}`;
  if (tab === 'preferences') {
    return isRoutedSettingsSection(settingsSection)
      ? `/${workspace}/settings/${SETTINGS_PATHS[settingsSection]}`
      : `/${workspace}/settings`;
  }
  return `/${workspace}/${tab}`;
}

export function isWorkspaceReturnRoute(route: Route): boolean {
  return route.kind === 'workspace' || route.kind === 'welcome';
}
