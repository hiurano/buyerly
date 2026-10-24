import { makeStore, useStore } from './store';

export type AppTab = 'inbox' | 'accounts' | 'campaigns' | 'rules' | 'members' | 'teams' | 'team';
/** The search page has an address but is no app tab: Settings' back button never returns to it. */
export type ActiveTab = AppTab | 'preferences' | 'search';
/** Settings pages; most also have their own address under /<workspace>/settings. */
export type SettingsSection =
  | 'preferences'
  | 'profile'
  | 'notifications'
  | 'priority-notifications'
  | 'email-notifications'
  | 'telegram-notifications'
  | 'connected-accounts'
  | 'security'
  | 'workspace'
  | 'teams'
  /** Linear's "Create a new team" page, at /settings/new-team. */
  | 'new-team'
  /** One team's pages at /settings/teams/<KEY>[/general|/members|/accounts]; `settingsTeamPath` says which. */
  | 'team'
  | 'members'
  | 'workspace-security'
  /** Settings → Rules → Labels, at /settings/rule-labels (#383). */
  | 'rule-labels';
export type InterfaceTheme = 'system' | 'light' | 'dark';

function storedTheme(): InterfaceTheme {
  if (typeof window === 'undefined') return 'system';
  const theme = window.localStorage.getItem('buyerly-interface-theme');
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

/** The app's frame: the sidebar, which page is open, Settings' page and the theme. */
export class ShellStore {
  sidebarWidth = 244;
  isSidebarCollapsed = false;
  /** The sidebar drawer on a small screen; the collapsed setting above stays for desktop. */
  isSidebarOpen = false;
  /** The collapsed desktop sidebar shown over the content (hover, ⌘\), as in Linear. */
  isSidebarPeekOpen = false;
  /**
   * Opened by ⌘\, Linear's peek ignores the cursor over the backdrop until the
   * cursor visits the sidebar; opened by hover, leaving the sidebar closes it.
   */
  sidebarPeekSource: 'hover' | 'keyboard' = 'hover';
  activeTab: ActiveTab = 'campaigns';
  lastAppTab: AppTab = 'campaigns';
  /** The team whose Ads Manager, Ad accounts or Rules are on screen (/team/<KEY>/…); null for the workspace's own. */
  activeTeamKey: string | null = null;
  /** Ads Manager over the ad accounts you lead (/my-campaigns), as Linear's My issues. */
  myCampaigns = false;
  settingsSection: SettingsSection = 'preferences';
  /** The open team page, "<KEY>" or "<KEY>/<page>", while `settingsSection` is 'team'. */
  settingsTeamPath = '';
  interfaceTheme: InterfaceTheme = storedTheme();
  /** Ctrl/Cmd+K's "Create new label…": Settings → Rules → Labels opens its new row. */
  newRuleLabelRequest = 0;

  constructor() {
    makeStore(this);
  }

  setSidebarWidth(width: number) {
    this.sidebarWidth = Math.min(Math.max(width, 200), 400);
  }

  toggleSidebarCollapsed() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  setSidebarCollapsed(collapsed: boolean) {
    this.isSidebarCollapsed = collapsed;
  }

  resetSidebarWidth() {
    this.sidebarWidth = 244;
    this.isSidebarCollapsed = false;
  }

  setSidebarOpen(open: boolean) {
    this.isSidebarOpen = open;
  }

  toggleSidebarOpen() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  setSidebarPeekOpen(open: boolean, source: 'hover' | 'keyboard' = 'hover') {
    this.isSidebarPeekOpen = open;
    this.sidebarPeekSource = source;
  }

  setActiveTab(tab: ActiveTab) {
    this.activeTab = tab;
    if (tab !== 'preferences' && tab !== 'search') this.lastAppTab = tab;
  }

  /** Opening a team's page leaves My campaigns. */
  setActiveTeamKey(key: string | null) {
    this.activeTeamKey = key;
    this.myCampaigns = false;
  }

  /** Turning it on leaves any team's pages. */
  setMyCampaigns(on: boolean) {
    this.myCampaigns = on;
    if (on) this.activeTeamKey = null;
  }

  setSettingsSection(section: SettingsSection) {
    this.settingsSection = section;
  }

  /** Opens a team's settings page: "MED", "MED/general", "MED/members" or "MED/accounts". */
  openTeamSettings(path: string) {
    this.settingsSection = 'team';
    this.settingsTeamPath = path;
  }

  setInterfaceTheme(theme: InterfaceTheme) {
    this.interfaceTheme = theme;
  }

  requestNewRuleLabel() {
    this.newRuleLabelRequest += 1;
    this.settingsSection = 'rule-labels';
  }

  /** Settings → Rules → Labels has opened its new row. */
  takeNewRuleLabelRequest() {
    this.newRuleLabelRequest = 0;
  }
}

export const shellStore = new ShellStore();

export const useShellStore = <T,>(select: (store: ShellStore) => T): T => useStore(shellStore, select);
