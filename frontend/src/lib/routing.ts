import { useCallback, useMemo } from 'react';
import { matchRoutes, useLocation, useMatches, useNavigate, type Params, type RouteObject } from 'react-router';
import type { ActiveTab, SettingsSection } from '@/models/shellStore';
import type { AdsManagerEntity } from '@/models/viewStore';

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
      /** With tab 'accounts' and an account: its Activity tab (/accounts/<act_id>/activity), as a Linear project's. */
      accountPage?: AccountPageTab;
    }
  | { kind: 'unknown' };

export type WorkspaceRoute = Extract<Route, { kind: 'workspace' }>;

/** An ad account page's tabs past Overview, as a Linear project's. */
export type AccountPageTab = 'activity';

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
  'desktop-notifications': 'account/notifications/desktop',
  'email-notifications': 'account/notifications/email',
  'telegram-notifications': 'account/notifications/telegram',
  'connected-accounts': 'account/connections',
  security: 'account/security',
} as const satisfies Partial<Record<SettingsSection, string>>;

/** The tabs of a team's Home. */
export const TEAM_HOME_PAGES = ['overview', 'documents', 'members'] as const;
export type TeamHomePage = typeof TEAM_HOME_PAGES[number];

/** A team's pages under /settings/teams/<KEY>/, after its overview. */
export const TEAM_PAGES = ['general', 'members', 'accounts'] as const;

const ADS_MANAGER_LEVELS: AdsManagerEntity[] = ['campaigns', 'adsets', 'ads'];

/*
 * The app's routes, as Linear's React Router tree: workspace → (team) page →
 * record, Settings → its sections. Each route's `handle` says what it opens;
 * src/routes.tsx gives the routes their components. Kept apart from them so
 * code outside React (the API client, a toast's action) reads the address
 * through the same tree.
 */

/** What a route opens: a screen outside the workspace, or a page of it. */
export type BuyerlyRouteHandle =
  | { kind: Exclude<Route['kind'], 'workspace' | 'unknown'> }
  | {
      page: ActiveTab;
      entity?: AdsManagerEntity;
      inboxTab?: 'priority' | 'other';
      rulesPage?: RulesPage;
      teamPage?: TeamHomePage;
      accountPage?: AccountPageTab;
      settingsSection?: SettingsSection;
      /** With settingsSection 'team': the team's page after its overview. */
      teamSettingsPage?: typeof TEAM_PAGES[number];
      mine?: boolean;
    };

const handle = (value: BuyerlyRouteHandle) => value;

/**
 * Ads Manager, Ad accounts and Rules, at `prefix`: the workspace's own, a team's
 * copy (team/:teamKey/), as Linear's team Issues, and My campaigns. They sit
 * side by side under one layout, so a page keeps its state from one to another.
 */
function scopedPages(prefix: '' | 'team/:teamKey/' | 'my-campaigns'): RouteObject[] {
  const mine = prefix === 'my-campaigns';
  return [
    ...ADS_MANAGER_LEVELS.map((entity) => ({
      path: `${mine ? 'my-campaigns' : `${prefix}ads-manager`}/${entity}/:recordId?`,
      handle: handle({ page: 'campaigns', entity, mine }),
    })),
    ...(mine ? [] : [
      // The Ad accounts list, and one account's page at /accounts/{act_id} (#388).
      { path: `${prefix}accounts/:recordId/activity`, handle: handle({ page: 'accounts', accountPage: 'activity' }) },
      { path: `${prefix}accounts/:recordId?`, handle: handle({ page: 'accounts' }) },
      { path: `${prefix}rules/${RECENTLY_DELETED_RULES}`, handle: handle({ page: 'rules', rulesPage: RECENTLY_DELETED_RULES }) },
      { path: `${prefix}rules/:recordId?`, handle: handle({ page: 'rules' }) },
    ]),
  ];
}

const settingsRoutes: RouteObject[] = [
  { index: true, handle: handle({ page: 'preferences', settingsSection: 'preferences' }) },
  ...(Object.keys(SETTINGS_PATHS) as Array<keyof typeof SETTINGS_PATHS>).map((section) => ({
    path: SETTINGS_PATHS[section],
    handle: handle({ page: 'preferences', settingsSection: section }),
  })),
  { path: 'teams/:settingsTeam', handle: handle({ page: 'preferences', settingsSection: 'team' }) },
  ...TEAM_PAGES.map((page) => ({
    path: `teams/:settingsTeam/${page}`,
    handle: handle({ page: 'preferences', settingsSection: 'team', teamSettingsPage: page }),
  })),
];

const workspacePageRoutes: RouteObject[] = [
  { index: true, handle: handle({ page: 'inbox' }) },
  { path: 'inbox/priority/:recordId?', handle: handle({ page: 'inbox', inboxTab: 'priority' }) },
  { path: 'inbox/other/:recordId?', handle: handle({ page: 'inbox', inboxTab: 'other' }) },
  { path: 'inbox/:recordId?', handle: handle({ page: 'inbox' }) },
  ...scopedPages(''),
  // Ads Manager's levels and records, over the ad accounts you lead.
  { path: 'my-campaigns', handle: handle({ page: 'campaigns', entity: 'campaigns', mine: true }) },
  ...scopedPages('my-campaigns'),
  // Linear's workspace Members and Teams pages, beside their Settings pages.
  { path: 'members', handle: handle({ page: 'members' }) },
  { path: 'teams', handle: handle({ page: 'teams' }) },
  // Linear's search page; the query, tab and filters live in `?q=…&type=…`.
  { path: 'search', handle: handle({ page: 'search' }) },
  // The team's Home, as Linear's: Overview, Documents (and one document), Members.
  { path: 'team/:teamKey', handle: handle({ page: 'team', teamPage: 'overview' }) },
  { path: 'team/:teamKey/overview', handle: handle({ page: 'team', teamPage: 'overview' }) },
  { path: 'team/:teamKey/documents/:recordId?', handle: handle({ page: 'team', teamPage: 'documents' }) },
  { path: 'team/:teamKey/members', handle: handle({ page: 'team', teamPage: 'members' }) },
  ...scopedPages('team/:teamKey/'),
];

/** The route tree without components; src/routes.tsx renders it. */
export const buyerlyRouteTree: RouteObject[] = [
  {
    id: 'root',
    children: [
      { index: true, handle: handle({ kind: 'root' }) },
      { path: 'login', handle: handle({ kind: 'login' }) },
      { path: 'signup', handle: handle({ kind: 'signup' }) },
      { path: 'create-workspace', handle: handle({ kind: 'create-workspace' }) },
      { path: 'auth/email/verify', handle: handle({ kind: 'verify-email-link' }) },
      { path: 'auth/add-account', handle: handle({ kind: 'add-account' }) },
      { path: 'invite/:token', handle: handle({ kind: 'invite' }) },
      { path: 'connect/meta/success', handle: handle({ kind: 'meta-connect-success' }) },
      { path: 'connect/meta/:token', handle: handle({ kind: 'meta-connect-invite' }) },
      { path: ':workspace/welcome', handle: handle({ kind: 'welcome' }) },
      {
        id: 'workspace',
        path: ':workspace',
        children: [
          { id: 'settings', path: 'settings', children: settingsRoutes },
          { id: 'pages', children: workspacePageRoutes },
        ],
      },
      { path: '*' },
    ],
  },
];

interface MatchLike {
  params: Params;
  handle?: unknown;
}

/** The route the matched branch of the tree opens. */
export function routeFromMatches(matches: readonly MatchLike[] | null, search: string): Route {
  const last = matches?.[matches.length - 1];
  const opened = last?.handle as BuyerlyRouteHandle | undefined;
  if (!last || !opened) return { kind: 'unknown' };
  const { params } = last;
  if ('kind' in opened) {
    switch (opened.kind) {
      case 'verify-email-link':
        return { kind: 'verify-email-link', token: new URLSearchParams(search).get('token') || '' };
      case 'add-account':
        return { kind: 'add-account', inviteToken: new URLSearchParams(search).get('invite') || null };
      case 'invite':
        return { kind: 'invite', token: params.token ?? '' };
      case 'meta-connect-invite':
        return { kind: 'meta-connect-invite', token: params.token ?? '' };
      case 'welcome':
        return SYSTEM_ROOTS.has(params.workspace ?? '') ? { kind: 'unknown' } : { kind: 'welcome', workspace: params.workspace ?? '' };
      default:
        return { kind: opened.kind };
    }
  }
  const workspace = params.workspace ?? '';
  if (SYSTEM_ROOTS.has(workspace)) return { kind: 'unknown' };
  const route: WorkspaceRoute = { kind: 'workspace', workspace, tab: opened.page };
  if (opened.entity) route.entity = opened.entity;
  if (opened.mine) route.mine = true;
  if (opened.inboxTab) route.inboxTab = opened.inboxTab;
  if (opened.rulesPage) route.rulesPage = opened.rulesPage;
  if (opened.teamPage) route.teamPage = opened.teamPage;
  if (opened.accountPage) route.accountPage = opened.accountPage;
  if (params.teamKey) route.teamKey = params.teamKey.toUpperCase();
  if (params.recordId) route.recordId = params.recordId;
  if (opened.settingsSection && opened.settingsSection !== 'preferences') route.settingsSection = opened.settingsSection;
  if (opened.settingsSection === 'team') {
    route.teamPath = opened.teamSettingsPage ? `${params.settingsTeam}/${opened.teamSettingsPage}` : params.settingsTeam;
  }
  return route;
}

/** The route of an address, outside React (the API client, a check made later). */
export function routeAt(location: { pathname: string; search: string }): Route {
  const matches = matchRoutes(buyerlyRouteTree, location.pathname);
  return routeFromMatches(matches?.map((match) => ({ params: match.params, handle: match.route.handle })) ?? null, location.search);
}

/** The route of the address on screen now; for event handlers and code outside React, never while rendering. */
export function currentRoute(): Route {
  return routeAt(window.location);
}

/** The route of the address on screen, read again on every navigation. */
export function useRoute(): Route {
  const matches = useMatches();
  const { search } = useLocation();
  return useMemo(() => routeFromMatches(matches, search), [matches, search]);
}

const navigationNumbers = new WeakMap<object, number>();
let lastNavigationNumber = 0;

/** A number of its own for each location the router moves to, Back and Forward included. */
function navigationNumber(location: object): number {
  let number = navigationNumbers.get(location);
  if (number === undefined) {
    lastNavigationNumber += 1;
    number = lastNavigationNumber;
    navigationNumbers.set(location, number);
  }
  return number;
}

/**
 * Changes on every navigation, Back and Forward included: pages read the
 * address's query again then (#492).
 */
export function useNavigationKey(): number {
  return navigationNumber(useLocation());
}

/** The path and query on screen, read again on every navigation. */
export function useAddress(): { pathname: string; search: string } {
  const { pathname, search } = useLocation();
  return useMemo(() => ({ pathname, search }), [pathname, search]);
}

/** The Settings page on screen: its section, and with 'team' which team page. */
export function useSettingsPage(): { section: SettingsSection; teamPath: string } {
  const route = useRoute();
  const section = route.kind === 'workspace' ? route.settingsSection ?? 'preferences' : 'preferences';
  const teamPath = route.kind === 'workspace' ? route.teamPath ?? '' : '';
  return useMemo(() => ({ section, teamPath }), [section, teamPath]);
}

/** The tab on screen; for event handlers. */
export function currentTab(): ActiveTab | null {
  const route = currentRoute();
  return route.kind === 'workspace' ? route.tab : null;
}

/** A team's Home tab, or one of its documents. */
export const teamHomePath = (workspace: string, teamKey: string, page: TeamHomePage = 'overview', documentId?: number | string) =>
  `/${workspace}/team/${teamKey}/${page}${documentId !== undefined ? `/${documentId}` : ''}`;

function hasSettingsPath(section: SettingsSection): section is keyof typeof SETTINGS_PATHS {
  return section in SETTINGS_PATHS;
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
    return pathForTab(`${workspace}/team/${teamKey}`, tab, entity, 'preferences', '', rulesPage);
  }
  if (tab === 'campaigns') return `/${workspace}/ads-manager/${entity}`;
  if (tab === 'rules' && rulesPage) return `/${workspace}/rules/${rulesPage}`;
  if (tab === 'preferences') return settingsPath(workspace, settingsSection, teamPath);
  return `/${workspace}/${tab}`;
}

/** A Settings page's address; a team's pages take "<KEY>" or "<KEY>/<page>". */
export function settingsPath(workspace: string, section: SettingsSection = 'preferences', teamPath = ''): string {
  if (section === 'team') {
    return teamPath ? `/${workspace}/settings/teams/${teamPath}` : `/${workspace}/settings/teams`;
  }
  return hasSettingsPath(section) ? `/${workspace}/settings/${SETTINGS_PATHS[section]}` : `/${workspace}/settings`;
}

/** Rules' Recently deleted page, as Linear's "Go to recently deleted issues". */
export function recentlyDeletedRulesPath(workspace: string): string {
  return pathForTab(workspace, 'rules', 'campaigns', 'preferences', '', RECENTLY_DELETED_RULES);
}

/** The data router the app runs in; src/routes.tsx sets it once. */
export const appRouter: { current: { navigate: (to: string, options?: { replace?: boolean }) => Promise<void> } | null } = {
  current: null,
};

/**
 * Opens an address of this app from outside a component (a toast's action, a
 * shortcut): the router moves to it, as a link would.
 */
export function openAppPath(path: string, replace = false): void {
  if (`${window.location.pathname}${window.location.search}` === path) return;
  void appRouter.current?.navigate(path, { replace });
}

/** The app's navigation, for components: a push, or with `replace` a replacement of this entry. */
export function useAppNavigate(): (path: string, replace?: boolean) => void {
  const navigate = useNavigate();
  return useCallback((path: string, replace = false) => {
    void navigate(path, { replace });
  }, [navigate]);
}

/** Opens a page of Settings; a team's pages take "<KEY>" or "<KEY>/<page>". */
export function openSettings(section: SettingsSection = 'preferences', teamPath = ''): void {
  const route = currentRoute();
  if (route.kind !== 'workspace') return;
  openAppPath(settingsPath(route.workspace, section, teamPath));
}

/** A team's settings page: "MED", "MED/general", "MED/members" or "MED/accounts". */
export function openTeamSettings(teamPath: string): void {
  openSettings('team', teamPath);
}

/** Recently deleted of the workspace on screen: the "View recently deleted" of a toast. */
export function openRecentlyDeletedRules(): void {
  const route = currentRoute();
  if (route.kind === 'workspace') openAppPath(recentlyDeletedRulesPath(route.workspace));
}

export function isWorkspaceReturnRoute(route: Route): boolean {
  return route.kind === 'workspace' || route.kind === 'welcome';
}
