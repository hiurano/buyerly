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
  | 'desktop-notifications'
  | 'email-notifications'
  | 'telegram-notifications'
  | 'connected-accounts'
  | 'security'
  | 'workspace'
  | 'teams'
  /** Linear's "Create a new team" page, at /settings/new-team. */
  | 'new-team'
  /** One team's pages at /settings/teams/<KEY>[/general|/members|/accounts]; the address says which. */
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

/** The app's frame: the sidebar, the app page Settings returns to, and the theme. */
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
  /**
   * The app page last on screen: Settings and search go back to it, and the
   * sidebar keeps its team while they are open. The address says which page is
   * open (#495); this only remembers where it was.
   */
  lastAppPlace: { tab: AppTab; teamKey: string | null; mine: boolean } = { tab: 'campaigns', teamKey: null, mine: false };
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

  rememberAppPlace(tab: AppTab, teamKey: string | null, mine: boolean) {
    const place = this.lastAppPlace;
    if (place.tab === tab && place.teamKey === teamKey && place.mine === mine) return;
    this.lastAppPlace = { tab, teamKey, mine };
  }

  setInterfaceTheme(theme: InterfaceTheme) {
    this.interfaceTheme = theme;
  }

  /** Settings → Rules → Labels, opened by the caller, opens its new row. */
  requestNewRuleLabel() {
    this.newRuleLabelRequest += 1;
  }

  /** Settings → Rules → Labels has opened its new row. */
  takeNewRuleLabelRequest() {
    this.newRuleLabelRequest = 0;
  }
}

export const shellStore = new ShellStore();

export const useShellStore = <T,>(select: (store: ShellStore) => T): T => useStore(shellStore, select);
