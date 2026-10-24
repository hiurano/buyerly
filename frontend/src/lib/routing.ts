import { useMemo, useSyncExternalStore } from 'react';
import type { ActiveTab, AdsManagerEntity, SettingsSection } from '@/store/useAppStore';

export type Route =
  | { kind: 'root' }
  | { kind: 'login' }
  /** Linear's /signup: the same email sign-in, titled "Create your workspace". */
  | { kind: 'signup' }
  | { kind: 'verify-email-link'; token: string }
  /** Linear's "Add an account…": log in to another account without leaving this one. */
  /** `inviteToken`: opened from an invitation page, which the login returns to. */
  | { kind: 'add-account'; inviteToken: string | null }
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
      /** With settingsSection 'team': "<KEY>" or "<KEY>/<page>". */
      teamPath?: string;
      /** With tab 'rules': a page of Rules other than the list, as Linear's team archive. */
      rulesPage?: RulesPage;
      /** Linear's team pages: Ads Manager, Ad accounts and Rules under /team/<KEY>/, for that team's ad accounts. */
      teamKey?: string;
      /** Ads Manager over the ad accounts you lead, as Linear's My issues (/my-campaigns/<level>). */
      mine?: boolean;
      /** With tab 'team': the tab of the team's Home (/team/<KEY>/overview, …/documents, …/members). */
      teamPage?: TeamHomePage;
    }
  | { kind: 'unknown' };

/** Rules pages beside the list: deleted rules and groups live at /rules/recently-deleted. */
export const RECENTLY_DELETED_RULES = 'recently-deleted';
export type RulesPage = typeof RECENTLY_DELETED_RULES;

const SYSTEM_ROOTS = new Set([
  // Root segments the server itself serves. Everything else is a workspace slug.
  'about',
  'api',
  'assets',
  'auth',
  'changelog',
  'connect',
  'create-workspace',
  'data-deletion',
  'docs',
  'health',
  'invite',
  'login',
  'privacy',
  'redoc',
  'signup',
  'static',
  'terms',
  'uploads',
]);

/*
 * Which navigation the tab is on: a number that changes on every pushState
 * the app makes and on Back and Forward. Components read the address through
 * it, never straight from window.location while rendering, which the React
 * Compiler takes for a constant (#492).
 */
let locationVersion = 0;
const getLocationVersion = () => locationVersion;
const locationListeners = new Set<() => void>();

/** Call after changing the address with the History API. */
export function notifyLocationChanged(): void {
  locationVersion += 1;
  locationListeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') window.addEventListener('popstate', notifyLocationChanged);

function subscribeLocation(listener: () => void) {
  locationListeners.add(listener);
  return () => locationListeners.delete(listener);
}

export function useLocationVersion(): number {
  return useSyncExternalStore(subscribeLocation, getLocationVersion);
}

/** The route of the address on screen, read again on every navigation. */
export function useRoute(): Route {
  const version = useLocationVersion();
  return useMemo(() => routeAt(version), [version]);
}

/** The path and query on screen, read again on every navigation. */
export function useAddress(): { pathname: string; search: string } {
  const version = useLocationVersion();
  return useMemo(() => addressAt(version), [version]);
}

const addressAt = (_version: number) => ({ pathname: window.location.pathname, search: window.location.search });

/** The route as of a navigation; `version` makes that the read's input. */
export const routeAt = (_version: number) => parseRoute();

/**
 * The address's query as of a navigation. `navigationKey` changes on every
 * one, Back and Forward included; passing it makes that the read's input, so
 * the React Compiler reads the address again then rather than once (#492).
 */
export const searchAt = (_navigationKey: number) => window.location.search;

export function parseRoute(location: Location = window.location): Route {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'root' };
  if (parts.length === 1 && parts[0] === 'login') return { kind: 'login' };
  if (parts.length === 1 && parts[0] === 'signup') return { kind: 'signup' };
  if (parts.length === 1 && parts[0] === 'create-workspace') return { kind: 'create-workspace' };
  if (parts.length === 3 && parts[0] === 'auth' && parts[1] === 'email' && parts[2] === 'verify') {
    return { kind: 'verify-email-link', token: new URLSearchParams(location.search).get('token') || '' };
  }
  if (parts.length === 2 && parts[0] === 'auth' && parts[1] === 'add-account') {
    return { kind: 'add-account', inviteToken: new URLSearchParams(location.search).get('invite') || null };
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
  if (parts[1] === 'team' && parts.length >= 3) {
    const teamKey = parts[2].toUpperCase();
    // The team's Home, as Linear's: Overview, Documents (and one document), Members.
    if (parts.length === 3) return { kind: 'workspace', workspace, tab: 'team', teamKey, teamPage: 'overview' };
    const homePage = TEAM_HOME_PAGES.find((page) => page === parts[3]);
    if (homePage && (parts.length === 4 || (homePage === 'documents' && parts.length === 5))) {
      return { kind: 'workspace', workspace, tab: 'team', teamKey, teamPage: homePage, recordId: parts[4] };
    }
    // /<workspace>/team/<KEY>/<page>: the workspace page of that name, for the team.
    if (!TEAM_SCOPED_ROOTS.includes(parts[3])) return { kind: 'unknown' };
    const inner = parseRoute({ pathname: `/${[workspace, ...parts.slice(3)].join('/')}`, search: location.search } as Location);
    return inner.kind === 'workspace' ? { ...inner, teamKey } : inner;
  }
  if (parts[1] === 'my-campaigns' && parts.length <= 4) {
    // Ads Manager's levels and records, over the ad accounts you lead.
    const inner = parseRoute({
      pathname: `/${[workspace, 'ads-manager', ...(parts.length > 2 ? parts.slice(2) : ['campaigns'])].join('/')}`,
      search: location.search,
    } as Location);
    return inner.kind === 'workspace' ? { ...inner, mine: true } : inner;
  }
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
  if (parts[1] === 'accounts' && parts.length <= 3) {
    // The Ad accounts list, and one account's page at /accounts/{act_id} (#388).
    let recordId = parts[2];
    try {
      recordId = recordId ? decodeURIComponent(recordId) : recordId;
    } catch { /* A broken escape stays as typed and finds no account. */ }
    return { kind: 'workspace', workspace, tab: 'accounts', recordId };
  }
  if (parts[1] === 'rules' && parts[2] === RECENTLY_DELETED_RULES && parts.length === 3) {
    return { kind: 'workspace', workspace, tab: 'rules', rulesPage: RECENTLY_DELETED_RULES };
  }
  if (parts[1] === 'rules' && parts.length <= 3) {
    return { kind: 'workspace', workspace, tab: 'rules', recordId: parts[2] };
  }
  if ((parts[1] === 'members' || parts[1] === 'teams') && parts.length === 2) {
    // Linear's workspace Members and Teams pages, beside their Settings pages.
    return { kind: 'workspace', workspace, tab: parts[1] === 'members' ? 'members' : 'teams' };
  }
  if (parts[1] === 'search' && parts.length === 2) {
    // Linear's search page; the query, tab and filters live in `?q=…&type=…`.
    return { kind: 'workspace', workspace, tab: 'search' };
  }
  if (parts[1] === 'settings' && parts.length === 2) {
    return { kind: 'workspace', workspace, tab: 'preferences' };
  }
  if (
    parts[1] === 'settings'
    && parts[2] === 'teams'
    && (parts.length === 4 || (parts.length === 5 && (TEAM_PAGES as readonly string[]).includes(parts[4])))
  ) {
    return { kind: 'workspace', workspace, tab: 'preferences', settingsSection: 'team', teamPath: parts.slice(3).join('/') };
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
  workspace: 'workspace',
  teams: 'teams',
  'new-team': 'new-team',
  members: 'members',
  'workspace-security': 'security',
  'rule-labels': 'rule-labels',
  profile: 'account/profile',
  notifications: 'account/notifications',
  'priority-notifications': 'account/notifications/priority-filter',
  'email-notifications': 'account/notifications/email',
  'telegram-notifications': 'account/notifications/telegram',
  'connected-accounts': 'account/connections',
  security: 'account/security',
} as const satisfies Partial<Record<SettingsSection, string>>;

/** The tabs of a team's Home. */
export const TEAM_HOME_PAGES = ['overview', 'documents', 'members'] as const;
export type TeamHomePage = typeof TEAM_HOME_PAGES[number];

/** A team's Home tab, or one of its documents. */
export const teamHomePath = (workspace: string, teamKey: string, page: TeamHomePage = 'overview', documentId?: number | string) =>
  `/${workspace}/team/${teamKey}/${page}${documentId !== undefined ? `/${documentId}` : ''}`;

/** Workspace pages a team has its own copy of, as Linear's team Issues and Projects. */
const TEAM_SCOPED_ROOTS = ['ads-manager', 'accounts', 'rules'];

/** A team's pages under /settings/teams/<KEY>/, after its overview. */
export const TEAM_PAGES = ['general', 'members', 'accounts'] as const;

function hasSettingsPath(section: SettingsSection): section is keyof typeof SETTINGS_PATHS {
  return section in SETTINGS_PATHS;
}

/** Settings sections whose address the app keeps in the URL. */
export function isRoutedSettingsSection(section: SettingsSection): boolean {
  return hasSettingsPath(section) || section === 'team';
}

export function pathForTab(
  workspace: string,
  tab: ActiveTab,
  entity: AdsManagerEntity = 'campaigns',
  settingsSection: SettingsSection = 'preferences',
  teamPath = '',
  rulesPage?: RulesPage,
  teamKey: string | null = null,
  mine = false,
): string {
  if (mine && tab === 'campaigns') return `/${workspace}/my-campaigns/${entity}`;
  if (teamKey && tab === 'team') return teamHomePath(workspace, teamKey);
  if (teamKey && (tab === 'campaigns' || tab === 'accounts' || tab === 'rules')) {
    return pathForTab(`${workspace}/team/${teamKey}`, tab, entity);
  }
  if (tab === 'campaigns') return `/${workspace}/ads-manager/${entity}`;
  if (tab === 'rules' && rulesPage) return `/${workspace}/rules/${rulesPage}`;
  if (tab === 'preferences') {
    if (settingsSection === 'team') {
      return teamPath ? `/${workspace}/settings/teams/${teamPath}` : `/${workspace}/settings/teams`;
    }
    return hasSettingsPath(settingsSection)
      ? `/${workspace}/settings/${SETTINGS_PATHS[settingsSection]}`
      : `/${workspace}/settings`;
  }
  return `/${workspace}/${tab}`;
}

/** Rules' Recently deleted page, as Linear's "Go to recently deleted issues". */
export function recentlyDeletedRulesPath(workspace: string): string {
  return pathForTab(workspace, 'rules', 'campaigns', 'preferences', '', RECENTLY_DELETED_RULES);
}

/**
 * Opens an address of this app from outside a component (a toast's action):
 * the App follows the history the same way it follows Back and Forward.
 */
export function openAppPath(path: string): void {
  if (`${window.location.pathname}${window.location.search}` === path) return;
  window.history.pushState({}, '', path);
  notifyLocationChanged();
}

/** Recently deleted of the workspace on screen: the "View recently deleted" of a toast. */
export function openRecentlyDeletedRules(): void {
  const route = parseRoute();
  if (route.kind === 'workspace') openAppPath(recentlyDeletedRulesPath(route.workspace));
}

export function isWorkspaceReturnRoute(route: Route): boolean {
  return route.kind === 'workspace' || route.kind === 'welcome';
}
