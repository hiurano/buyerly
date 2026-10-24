import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { AccountsView } from '@/components/accounts/AccountsView';
import { AccountPage } from '@/components/accounts/AccountPage';
import { RecentlyDeletedRulesPage } from '@/components/rules/RecentlyDeletedRulesPage';
import { CommandMenu } from '@/components/command/CommandMenu';
import { BuyerlyShortcutsPanel } from '@/components/help/BuyerlyShortcutsPanel';
import { useFavorites } from '@/lib/favorites';
import { OpenPalette } from '@/components/command/OpenPalette';
import { SearchView } from '@/components/search/SearchView';
import { WorkspaceMembersView } from '@/components/workspace/WorkspaceMembersView';
import { WorkspaceTeamsView } from '@/components/workspace/WorkspaceTeamsView';
import { TeamHomeView } from '@/components/teams/TeamHomeView';
import { searchPageTitle } from '@/lib/search';
import { pageTitle } from '@/lib/pageTitle';
import { useTeams } from '@/lib/teams';
import { WorkspaceSwitcher } from '@/components/command/WorkspaceSwitcher';
import { PreferencesView } from '@/components/preferences/PreferencesView';
import { AppUtilityBar } from '@/components/layout/AppUtilityBar';
import { TooltipProvider } from '@/ui/Tooltip';
import { ToastRegion } from '@/ui/ToastRegion';
import { useUndoShortcuts } from '@/lib/undoHistory';
import { useNewVersionNotice } from '@/lib/appVersion';
import { apiRequest } from '@/lib/api';
import type { LoginResult, SessionUser, Workspace } from '@/lib/types';
import { TEAM_HOME_PAGES, isRoutedSettingsSection, isWorkspaceReturnRoute, notifyLocationChanged, openAppPath, pathForTab, teamHomePath, useAddress, useLocationVersion, useRoute, type Route } from '@/lib/routing';
import { BuyerlyPageGate, BuyerlyPageSkeleton, useHeldPage } from '@/components/layout/BuyerlyPageSwitch';
import { BuyerlyPageScopeContext } from '@/lib/pageScope';
import { AuthLoading } from '@/components/auth/AuthFrame';
import { finishSplash } from '@/lib/splash';
import { LoginView } from '@/components/auth/LoginView';
import { VerifyEmailLinkView } from '@/components/auth/VerifyEmailLinkView';
import { InviteView } from '@/components/auth/InviteView';
import { NotFoundView } from '@/components/auth/NotFoundView';
import { CreateWorkspaceView } from '@/components/onboarding/CreateWorkspaceView';
import { WelcomeView } from '@/components/onboarding/WelcomeView';
import { MetaConnectInviteView, MetaConnectSuccessView } from '@/components/auth/MetaConnectInviteView';
import { ApprovalDialog } from '@/webmcp/ApprovalDialog';
import { CreateRuleModal } from '@/components/rules/CreateRuleModal';
import { useWebMcpTools } from '@/webmcp/register';
import { WorkspaceSessionProvider, type WorkspaceSession } from '@/lib/workspaceSession';
import { isSmallScreen } from '@/lib/useMediaQuery';
import { GO_TO_SETTINGS_SECTION, goToTargetFor } from '@/lib/shortcuts';
import { canOpenSettingsSection } from '@/lib/settingsPages';
import { logOut } from '@/lib/sessions';
import {
  chooseAccount,
  getCurrentAccountId,
  useCurrentAccountId,
  getKnownAccounts,
  setCurrentAccountId,
  setKnownAccounts,
  type BrowserAccount,
} from '@/lib/accounts';
import { useInboxStore } from '@/models/inboxStore';
import { useScopeStore, scopeStore } from '@/models/scopeStore';
import { shellStore, useShellStore } from '@/models/shellStore';
import { useDetailsPaneStore } from '@/models/detailsPaneStore';
import { useViewStore } from '@/models/viewStore';

const RETURN_ROUTE_KEY = 'buyerly-return-route';

function activeWorkspace(user: SessionUser): Workspace | null {
  return user.active_workspace || user.workspaces.find((workspace) => workspace.is_active) || user.workspaces[0] || null;
}

interface WorkspaceApplicationProps {
  route: Extract<Route, { kind: 'workspace' }>;
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
  workspace: Workspace;
  user: SessionUser;
  accounts: BrowserAccount[];
  navigate: (path: string, replace?: boolean) => void;
  refreshUser: () => Promise<SessionUser>;
  /** Opens a workspace of another account logged in to this browser. */
  switchAccount: (accountId: number, slug: string) => void;
}

const WorkspaceApplication: React.FC<WorkspaceApplicationProps> = ({
  route,
  navigationKey,
  workspace,
  user,
  accounts,
  navigate,
  refreshUser,
  switchAccount,
}) => {
  const activeTab = useShellStore((state) => state.activeTab);
  const setActiveTab = useShellStore((state) => state.setActiveTab);
  const campaignFilterTab = useViewStore((state) => state.campaignFilterTab);
  const setCampaignFilterTab = useViewStore((state) => state.setCampaignFilterTab);
  const settingsSection = useShellStore((state) => state.settingsSection);
  const setSettingsSection = useShellStore((state) => state.setSettingsSection);
  const settingsTeamPath = useShellStore((state) => state.settingsTeamPath);
  const openTeamSettings = useShellStore((state) => state.openTeamSettings);
  const activeTeamKey = useShellStore((state) => state.activeTeamKey);
  const setActiveTeamKey = useShellStore((state) => state.setActiveTeamKey);
  const myCampaigns = useShellStore((state) => state.myCampaigns);
  const setMyCampaigns = useShellStore((state) => state.setMyCampaigns);
  const setWorkspaceName = useScopeStore((state) => state.setWorkspaceName);
  const toggleDetailsPane = useDetailsPaneStore((state) => state.toggleDetailsPane);
  const toggleSidebarCollapsed = useShellStore((state) => state.toggleSidebarCollapsed);
  const toggleSidebarOpen = useShellStore((state) => state.toggleSidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setSidebarOpen);
  const setSidebarPeekOpen = useShellStore((state) => state.setSidebarPeekOpen);
  const interfaceTheme = useShellStore((state) => state.interfaceTheme);
  const refreshInboxUnreadCount = useInboxStore((state) => state.refreshInboxUnreadCount);
  const inboxBadge = useInboxStore((store) => store.badgeCount);
  useUndoShortcuts();
  useNewVersionNotice();
  useWebMcpTools(workspace);
  // The open workspace, on the page: set after its WebMCP tools are offered (the hook's
  // effect above runs first), so whoever waits for it finds that workspace's tools.
  useEffect(() => {
    document.documentElement.dataset.workspace = workspace.slug;
  }, [workspace.slug]);
  // Admins and owners see "Set default for everyone" in Display options (#472).
  useEffect(() => {
    scopeStore.setWorkspaceRole(workspace.role);
  }, [workspace.role]);
  const session = useMemo<WorkspaceSession>(() => ({
    user,
    workspace,
    accounts,
    switchWorkspace: (slug, accountId) => {
      if (accountId !== undefined && user.id != null && accountId !== user.id) {
        switchAccount(accountId, slug);
        return;
      }
      if (slug === workspace.slug) return;
      // The address alone scopes the app and every API request to the chosen workspace.
      navigate(`/${slug}/inbox`);
      // Remembered so the next visit to Buyerly opens it; the switch above does not wait for it.
      apiRequest('/api/workspaces/switch', { method: 'POST', body: JSON.stringify({ slug }) })
        .then(() => refreshUser())
        .catch(() => {});
    },
    workspaceMoved: async (slug) => {
      await refreshUser();
      // In the same tick as the new profile, so the old address never reads as a lost workspace.
      navigate(pathForTab(slug, 'preferences', 'campaigns', 'workspace'), true);
    },
    openCreateWorkspace: () => navigate('/create-workspace'),
    openAddAccount: () => navigate('/auth/add-account'),
  }), [accounts, navigate, refreshUser, switchAccount, user, workspace]);
  /** When G was pressed; read straight from the listener, so G and a fast next key never race a render. */
  const goToPressedAt = useRef(0);
  const syncingRoute = useRef(true);
  /**
   * The address the shell opened itself for a tab change. When the route catches
   * up with it the tab is already right, or already further on: on a slow device
   * G A then G R can both land before the route renders, and taking the tab from
   * the route would pull it back to Ads Manager and drop G R.
   */
  const ownPath = useRef<string | null>(null);

  useEffect(() => {
    // Back, Forward and openAppPath are someone else's navigation.
    const forget = () => { ownPath.current = null; };
    window.addEventListener('popstate', forget);
    return () => window.removeEventListener('popstate', forget);
  }, []);

  useEffect(() => {
    // A member or guest has no Administration pages: their addresses open Settings itself.
    if (route.settingsSection && !canOpenSettingsSection({ role: workspace.role }, route.settingsSection)) {
      navigate(`/${workspace.slug}/settings`, true);
      return;
    }
    const caughtUp = ownPath.current !== null && ownPath.current === window.location.pathname;
    ownPath.current = null;
    if (caughtUp) return;
    syncingRoute.current = true;
    setWorkspaceName(workspace.name);
    // Settings and search keep the team they were opened from, for their way back.
    if (route.tab !== 'preferences' && route.tab !== 'search') {
      if (route.mine) setMyCampaigns(true);
      else setActiveTeamKey(route.teamKey ?? null);
    }
    setActiveTab(route.tab);
    if (route.entity) setCampaignFilterTab(route.entity);
    if (route.tab === 'preferences') {
      const { settingsSection: current } = shellStore;
      // Plain /settings keeps any open section that has no address of its own.
      if (route.settingsSection === 'team') openTeamSettings(route.teamPath ?? '');
      else if (route.settingsSection) setSettingsSection(route.settingsSection);
      else if (isRoutedSettingsSection(current)) setSettingsSection('preferences');
    }
    queueMicrotask(() => {
      syncingRoute.current = false;
    });
  }, [navigate, openTeamSettings, route.entity, route.settingsSection, route.mine, route.teamKey, route.teamPath, route.tab, setActiveTab, setActiveTeamKey, setMyCampaigns, setCampaignFilterTab, setSettingsSection, setWorkspaceName, workspace.name, workspace.role, workspace.slug]);

  useEffect(() => {
    // Linear closes the small-screen sidebar drawer on every navigation. Some
    // settings sections have no address of their own, so a section change counts too.
    // The desktop peek over the content closes the same way.
    setSidebarOpen(false);
    setSidebarPeekOpen(false);
  }, [route, activeTab, settingsSection, settingsTeamPath, setSidebarOpen, setSidebarPeekOpen]);

  useEffect(() => {
    if (syncingRoute.current) return;
    const desiredPath = pathForTab(
      workspace.slug, activeTab, campaignFilterTab, settingsSection, settingsTeamPath, undefined, activeTeamKey, myCampaigns,
    );
    // A record under the page (a notification, an account) and the team Home's other tabs keep their address.
    const underPage = ((activeTab === 'inbox' || activeTab === 'accounts') && window.location.pathname.startsWith(`${desiredPath}/`))
      || (activeTab === 'team' && activeTeamKey !== null && TEAM_HOME_PAGES.some((page) => (
        window.location.pathname.startsWith(teamHomePath(workspace.slug, activeTeamKey, page))
      )));
    if (window.location.pathname !== desiredPath && !underPage) {
      // The filters and period follow to the next level; an old link's ad account stays behind.
      const campaignSearch = new URLSearchParams(window.location.search);
      campaignSearch.delete('account');
      const campaignQuery = activeTab === 'campaigns' && /\/(ads-manager|my-campaigns)\//.test(window.location.pathname)
        && campaignSearch.toString() ? `?${campaignSearch}` : '';
      ownPath.current = desiredPath;
      navigate(desiredPath + campaignQuery);
    }
  }, [activeTab, activeTeamKey, campaignFilterTab, myCampaigns, navigate, settingsSection, settingsTeamPath, workspace.slug]);

  useEffect(() => {
    // Linear keeps the unread count fresh in the sidebar and the tab title.
    void refreshInboxUnreadCount();
    const interval = window.setInterval(() => void refreshInboxUnreadCount(), 60_000);
    const onFocus = () => void refreshInboxUnreadCount();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshInboxUnreadCount, workspace.slug]);

  // The tab's title is the page's name, as Linear's ("Members", "Team › Ads Manager").
  const { teams: titleTeams } = useTeams(workspace.id, 'all');
  useEffect(() => {
    // An account's page and a document name their record themselves once it has loaded.
    if ((activeTab === 'accounts' || activeTab === 'team') && route.recordId) return;
    document.title = activeTab === 'search'
      ? searchPageTitle(window.location.search)
      : pageTitle({
        activeTab,
        activeTeamKey,
        myCampaigns,
        settingsSection,
        settingsTeamPath,
        teamName: (key) => titleTeams?.find((team) => team.key === key)?.name ?? null,
        teamPage: route.tab === 'team' ? route.teamPage : undefined,
        rulesPage: route.tab === 'rules' ? route.rulesPage : undefined,
        inboxBadge,
      });
    // The search page's title follows its query, which only the address holds.
  }, [activeTab, activeTeamKey, inboxBadge, myCampaigns, navigationKey, route.recordId, route.rulesPage, route.tab, route.teamPage, settingsSection, settingsTeamPath, titleTeams]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) return;

      if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === '[') {
        event.preventDefault();
        if (isSmallScreen()) toggleSidebarOpen();
        else toggleSidebarCollapsed();
        return;
      }
      // Linear's "Open/Close navigation sidebar": shows the collapsed sidebar over the content.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === '\\' || event.code === 'Backslash')) {
        const { isSidebarCollapsed, isSidebarPeekOpen, activeTab: tab } = shellStore;
        if (isSmallScreen() || !isSidebarCollapsed || tab === 'preferences') return;
        event.preventDefault();
        setSidebarPeekOpen(!isSidebarPeekOpen, 'keyboard');
        return;
      }
      // Linear's "Open/Close details": Ctrl/Cmd+I, or ] beside the sidebar's [ — the pane of the view on screen.
      const detailsKey = ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyI')
        || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === ']');
      if (detailsKey) {
        const { activeTab: tab } = shellStore;
        const pane = tab === 'campaigns' ? 'adsManager' : tab === 'rules' ? 'rules' : null;
        if (!pane) return;
        event.preventDefault();
        toggleDetailsPane(pane);
        return;
      }

      const key = event.key.toLowerCase();
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        if (key === 'g') {
          goToPressedAt.current = Date.now();
          return;
        }
        if (Date.now() - goToPressedAt.current < 1500) {
          const target = goToTargetFor(key);
          if (target) {
            event.preventDefault();
            if (target === 'preferences') setSettingsSection(GO_TO_SETTINGS_SECTION);
            // G R from Recently deleted goes back to the list: the tab itself does not change.
            // G K from an account's page goes back to the Ad accounts list the same way.
            if ((target === 'rules' || target === 'accounts') && shellStore.activeTab === target) {
              openAppPath(pathForTab(workspace.slug, target));
            }
            setActiveTab(target);
            goToPressedAt.current = 0;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, setSettingsSection, toggleDetailsPane, setSidebarPeekOpen, toggleSidebarCollapsed, toggleSidebarOpen, workspace.slug]);

  // The member's favorites of this workspace, for the sidebar and every star.
  useEffect(() => {
    void useFavorites.getState().load(workspace.slug);
  }, [workspace.slug]);

  // index.html marks signed-out pages for their plain backdrop, as Linear's html.logged-out; signing in
  // without a reload must lift it, or the window behind the app stays that colour.
  useEffect(() => {
    document.documentElement.classList.remove('logged-out');
    return () => document.documentElement.classList.add('logged-out');
  }, []);

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme = interfaceTheme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : interfaceTheme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
      window.localStorage.setItem('buyerly-interface-theme', interfaceTheme);
    };
    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [interfaceTheme]);

  // The page in `main` follows the store and the address once it has its data (#490);
  // until then the previous page stays, as of its own navigation.
  const { pathname, search } = useAddress();
  const shown = useHeldPage({
    tab: activeTab,
    teamKey: activeTeamKey,
    mine: myCampaigns,
    entity: campaignFilterTab,
    inboxTab: route.tab === 'inbox' ? route.inboxTab ?? null : null,
    search,
    pathname,
    route,
    navigationKey,
    // Whether the store has caught up with the address yet (the sync above runs after the first paint).
    addressed: route.tab === activeTab
      && (route.tab === 'preferences' || route.tab === 'search' || (Boolean(route.mine) === myCampaigns && (route.mine || (route.teamKey ?? null) === activeTeamKey))),
  }, `${activeTab}:${activeTeamKey ?? ''}:${myCampaigns}:${campaignFilterTab}:${navigationKey}`, workspace.id);
  const page = shown.page;
  const pageRoute = page.route;
  const pageScope = useMemo(
    () => ({ teamKey: page.teamKey, entity: page.entity, pathname: page.pathname }),
    [page.teamKey, page.entity, page.pathname],
  );

  return (
    <WorkspaceSessionProvider value={session}>
      <TooltipProvider>
        <div className="app-shell flex h-screen w-screen overflow-hidden">
          {activeTab === 'preferences' ? (
            <PreferencesView user={user} workspace={workspace} onUserChanged={refreshUser} />
          ) : (
            <>
              <Sidebar />
              <main className="buyerly-floating-canvas">
                <BuyerlyPageScopeContext value={pageScope}>
                  <Suspense fallback={<BuyerlyPageSkeleton />}>
                    <BuyerlyPageGate ready={shown.ready}>
                      {page.tab === 'inbox' && (
                        <InboxView
                          openEventId={pageRoute.tab === 'inbox' ? pageRoute.recordId : undefined}
                          inboxTab={pageRoute.tab === 'inbox' ? pageRoute.inboxTab ?? null : null}
                          // The query keeps Inbox filters while notifications open and close.
                          onNavigate={(tab, eventId) => navigate(
                            `/${workspace.slug}/inbox${tab ? `/${tab}` : ''}${eventId === null ? '' : `/${eventId}`}`
                              + window.location.search,
                          )}
                          onOpenRecord={(path) => navigate(path)}
                        />
                      )}
                      {page.tab === 'accounts' && (pageRoute.tab === 'accounts' && pageRoute.recordId ? (
                        <AccountPage
                          accountId={pageRoute.recordId}
                          navigate={navigate}
                          navigationKey={page.navigationKey}
                        />
                      ) : (
                        <AccountsView navigate={navigate} navigationKey={page.navigationKey} />
                      ))}
                      {page.tab === 'campaigns' && (
                        <CampaignsView
                          key={page.mine ? 'mine' : 'all'}
                          mine={page.mine}
                          reveal={pageRoute.tab === 'campaigns' && pageRoute.entity && pageRoute.recordId
                            ? { entity: pageRoute.entity, id: pageRoute.recordId }
                            : undefined}
                          navigationKey={page.navigationKey}
                        />
                      )}
                      {page.tab === 'rules' && pageRoute.tab === 'rules' && pageRoute.rulesPage === 'recently-deleted' && (
                        <RecentlyDeletedRulesPage
                          rulesPath={pathForTab(workspace.slug, 'rules')}
                          onOpenRules={() => navigate(pathForTab(workspace.slug, 'rules'))}
                        />
                      )}
                      {page.tab === 'rules' && !pageRoute.rulesPage && (
                        <RulesView
                          revealId={pageRoute.tab === 'rules' ? pageRoute.recordId : undefined}
                          navigationKey={page.navigationKey}
                        />
                      )}
                      {page.tab === 'team' && pageRoute.tab === 'team' && (
                        <TeamHomeView page={pageRoute.teamPage ?? 'overview'} documentId={pageRoute.recordId} navigate={navigate} />
                      )}
                      {page.tab === 'members' && <WorkspaceMembersView />}
                      {page.tab === 'teams' && <WorkspaceTeamsView />}
                      {page.tab === 'search' && (
                        <SearchView workspace={workspace} navigate={navigate} navigationKey={page.navigationKey} />
                      )}
                    </BuyerlyPageGate>
                  </Suspense>
                </BuyerlyPageScopeContext>
              </main>
            </>
          )}
          <AppUtilityBar />
        </div>
        {/* Over Settings too, as in Linear: Security & access adds "Revoke all other sessions". */}
        <CommandMenu workspace={workspace} navigate={navigate} />
        <OpenPalette workspace={workspace} navigate={navigate} />
        <BuyerlyShortcutsPanel />
        <WorkspaceSwitcher />
        <ToastRegion />
        <ApprovalDialog />
        {/* The rule window opens from Rules, Ctrl/Cmd+K and Campaigns' "Apply rule…" (#387). */}
        <CreateRuleModal />
      </TooltipProvider>
    </WorkspaceSessionProvider>
  );
};

export const App: React.FC = () => {
  const locationVersion = useLocationVersion();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<BrowserAccount[]>([]);
  const route = useRoute();

  // While the tab moves to another account, the old account's profile must not
  // scope a screen: requests already name the new account.
  const currentAccountId = useCurrentAccountId();
  const userIsCurrentAccount = !user || currentAccountId === null || user.id == null || user.id === currentAccountId;
  const resolvedWorkspace = user && route.kind === 'workspace'
    ? user.workspaces.find(item => item.slug === route.workspace) : null;
  const desiredScope = resolvedWorkspace && user?.onboarding_completed && userIsCurrentAccount
    ? `${user.username}:${resolvedWorkspace.id}` : null;
  const workspaceScope = useScopeStore((state) => state.workspaceScope);
  useLayoutEffect(() => {
    scopeStore.setWorkspaceScope(desiredScope, resolvedWorkspace?.slug);
  }, [desiredScope, resolvedWorkspace?.slug]);
  // The reload splash goes once a screen other than the boot loader is on the page (#433).
  useLayoutEffect(() => {
    if (!document.querySelector('[data-boot-loading]')) finishSplash();
  });

  const navigate = useCallback((path: string, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', path);
    notifyLocationChanged();
  }, []);

  const loadAccounts = useCallback(async () => {
    setKnownAccounts(await apiRequest<BrowserAccount[]>('/api/auth/accounts'));
    const list = getKnownAccounts();
    // Unchanged accounts keep their identity, so a refresh re-renders nothing.
    setAccounts((previous) => (JSON.stringify(previous) === JSON.stringify(list) ? previous : list));
    return list;
  }, []);

  const refreshUser = useCallback(async () => {
    const accountId = getCurrentAccountId();
    const nextUser = await apiRequest<SessionUser>('/api/me');
    // A late answer for an account this tab has since left never reaches the screen.
    if (getCurrentAccountId() === accountId && (accountId === null || nextUser.id == null || nextUser.id === accountId)) {
      setUser(nextUser);
    }
    // Switch workspace lists every account's workspaces; keep them fresh too.
    loadAccounts().catch(() => {});
    return nextUser;
  }, [loadAccounts]);

  /** The tab's account changed (switch, logout elsewhere): load its profile once. */
  const syncingAccount = useRef<number | null | undefined>(undefined);
  const syncAccount = useCallback(() => {
    const target = getCurrentAccountId();
    if (syncingAccount.current === target) return;
    syncingAccount.current = target;
    refreshUser()
      .catch(async () => {
        // That account is no longer logged in here: fall back to another one, or log in.
        const list = await loadAccounts().catch(() => [] as BrowserAccount[]);
        const next = chooseAccount(list);
        setCurrentAccountId(next ? next.id : null);
        scopeStore.setWorkspaceScope(null);
        if (!next) {
          setUser(null);
          return;
        }
        await refreshUser().catch(() => setUser(null));
      })
      .finally(() => {
        if (syncingAccount.current === target) syncingAccount.current = undefined;
      });
  }, [loadAccounts, refreshUser]);

  const switchAccount = useCallback((accountId: number, slug: string) => {
    setCurrentAccountId(accountId);
    // Drop the old account's data at once; its late answers are discarded by scope.
    scopeStore.setWorkspaceScope(null);
    navigate(`/${slug}/inbox`);
    // Remembered for that account, as a switch within one account is.
    apiRequest('/api/workspaces/switch', { method: 'POST', body: JSON.stringify({ slug }) }).catch(() => {});
  }, [navigate]);

  /** A login makes its account this tab's account (Add an account, invite, email link). */
  const adoptLogin = useCallback(async (result: LoginResult) => {
    await loadAccounts().catch(() => {});
    if (result.account_id) setCurrentAccountId(result.account_id);
    scopeStore.setWorkspaceScope(null);
  }, [loadAccounts]);

  const enterUserDestination = useCallback((nextUser: SessionUser, explicitPath?: string | null) => {
    if (explicitPath) {
      navigate(explicitPath, true);
      return;
    }
    const workspace = activeWorkspace(nextUser);
    if (!workspace) {
      navigate('/create-workspace', true);
      return;
    }
    if (!nextUser.onboarding_completed) {
      navigate(`/${workspace.slug}/welcome`, true);
      return;
    }
    const returnRoute = window.sessionStorage.getItem(RETURN_ROUTE_KEY);
    window.sessionStorage.removeItem(RETURN_ROUTE_KEY);
    navigate(returnRoute || `/${workspace.slug}/inbox`, true);
  }, [navigate]);

  const handleAuthenticated = useCallback(async (result: LoginResult) => {
    await adoptLogin(result);
    const nextUser = await refreshUser();
    enterUserDestination(nextUser, result.redirect_url);
  }, [adoptLogin, enterUserDestination, refreshUser]);


  useEffect(() => {
    if (route.kind === 'verify-email-link') return;
    (async () => {
      // Pick this tab's account among those logged in here; the address wins
      // when it names a workspace of another account.
      const list = await loadAccounts().catch(() => [] as BrowserAccount[]);
      const slug = route.kind === 'workspace' || route.kind === 'welcome' ? route.workspace : null;
      const account = chooseAccount(list, slug);
      setCurrentAccountId(account ? account.id : null);
      await refreshUser();
    })().catch(() => setUser(null));
    // Session bootstrap runs once; explicit auth mutations refresh it.
  }, []);

  useEffect(() => {
    if (user === undefined || route.kind === 'verify-email-link' || route.kind === 'invite' || route.kind === 'meta-connect-invite' || route.kind === 'meta-connect-success' || route.kind === 'unknown') return;

    if (user === null) {
      if (route.kind !== 'login' && route.kind !== 'signup') {
        if (isWorkspaceReturnRoute(route)) {
          window.sessionStorage.setItem(RETURN_ROUTE_KEY, window.location.pathname + window.location.search);
        }
        navigate('/login', true);
      }
      return;
    }

    // The tab moved to another account; wait for its profile before routing.
    const currentId = getCurrentAccountId();
    if (currentId !== null && user.id != null && user.id !== currentId) {
      syncAccount();
      return;
    }
    // An address of another logged-in account's workspace opens that account (Linear).
    if (route.kind === 'workspace' && !user.workspaces.some((item) => item.slug === route.workspace)) {
      const owner = accounts.find((account) => account.workspaces.some((item) => item.slug === route.workspace));
      if (owner && owner.id !== user.id) {
        setCurrentAccountId(owner.id);
        scopeStore.setWorkspaceScope(null);
        syncAccount();
        return;
      }
    }

    // Add an account is open to any logged-in account, also one without a workspace yet.
    if (route.kind === 'add-account') return;

    const workspace = activeWorkspace(user);
    if (!workspace) {
      if (route.kind !== 'create-workspace') navigate('/create-workspace', true);
      return;
    }
    if (!user.onboarding_completed) {
      const welcomePath = `/${workspace.slug}/welcome`;
      if (route.kind !== 'welcome' || route.workspace !== workspace.slug) navigate(welcomePath, true);
      return;
    }
    if (route.kind === 'root' || route.kind === 'login' || route.kind === 'signup' || route.kind === 'welcome') {
      navigate(`/${workspace.slug}/inbox`, true);
      return;
    }
    if (route.kind === 'workspace' && !user.workspaces.some((item) => item.slug === route.workspace)) {
      navigate(`/${workspace.slug}/inbox`, true);
    }
  }, [accounts, navigate, route, syncAccount, user]);

  if (route.kind === 'verify-email-link') {
    return (
      <VerifyEmailLinkView
        token={route.token}
        onAuthenticated={handleAuthenticated}
        onBackToLogin={() => {
          setUser(null);
          navigate('/login', true);
        }}
      />
    );
  }

  if (user === undefined) return <AuthLoading />;

  if (route.kind === 'unknown') {
    const workspace = user ? activeWorkspace(user) : null;
    return <NotFoundView homePath={workspace ? `/${workspace.slug}/inbox` : '/login'} />;
  }

  if (route.kind === 'invite') {
    return (
      <InviteView
        token={route.token}
        user={user}
        onAuthenticated={async (result) => {
          await adoptLogin(result);
          await refreshUser();
          navigate(result.redirect_url || `/invite/${route.token}`, true);
        }}
        onAccepted={async (workspaceSlug, onboardingCompleted) => {
          const nextUser = await refreshUser();
          setUser(nextUser);
          navigate(onboardingCompleted ? `/${workspaceSlug}/inbox` : `/${workspaceSlug}/welcome`, true);
        }}
        onSignedOut={async (thenLogIn) => {
          // Only the open account logged out. Going on to log in as the invited
          // email shows the login; otherwise another account still logged in
          // here takes over the page, else it shows the logged-out invitation.
          scopeStore.setWorkspaceScope(null);
          const list = await loadAccounts().catch(() => [] as BrowserAccount[]);
          const next = thenLogIn ? null : chooseAccount(list);
          setCurrentAccountId(next ? next.id : null);
          if (!next) {
            setUser(null);
            return;
          }
          await refreshUser().catch(() => setUser(null));
        }}
        onAddAccount={() => navigate(`/auth/add-account?invite=${encodeURIComponent(route.token)}`)}
        onBack={() => navigate('/', true)}
      />
    );
  }

  if (route.kind === 'meta-connect-invite') return <MetaConnectInviteView token={route.token} />;
  if (route.kind === 'meta-connect-success') return <MetaConnectSuccessView />;

  if (user === null) {
    return (
      <LoginView
        key={route.kind === 'signup' ? 'signup' : 'login'}
        mode={route.kind === 'signup' ? 'signup' : 'login'}
        onSwitchMode={(path) => navigate(path)}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const workspace = activeWorkspace(user);
  if (route.kind === 'add-account') {
    // Linear's "Add an account": the same email login, while this account stays logged in.
    const inviteToken = route.inviteToken;
    const invitePath = inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : null;
    return (
      <LoginView
        title="Add an account"
        loggedInAs={user.email || user.username}
        inviteToken={inviteToken || undefined}
        onBack={() => navigate(invitePath || (workspace ? `/${workspace.slug}/inbox` : '/'))}
        onAuthenticated={invitePath
          ? async (result) => {
            // From an invitation: the new account returns to it and accepts it there.
            await adoptLogin(result);
            await refreshUser();
            navigate(result.redirect_url || invitePath, true);
          }
          : handleAuthenticated}
      />
    );
  }
  if (workspace && user.onboarding_completed && route.kind === 'create-workspace') {
    // Linear's "Create or join a workspace…" from the workspace menu.
    return (
      <CreateWorkspaceView
        user={user}
        onBack={() => navigate(`/${workspace.slug}/inbox`)}
        onCreated={async (createdWorkspace) => {
          await refreshUser();
          navigate(`/${createdWorkspace.slug}/inbox`, true);
        }}
      />
    );
  }
  if (!workspace) {
    return (
      <CreateWorkspaceView
        user={user}
        onCreated={async (createdWorkspace) => {
          await refreshUser();
          navigate(`/${createdWorkspace.slug}/welcome`, true);
        }}
        onSignedOut={async () => {
          // Only this account logs out; another one logged in here opens instead.
          await logOut();
        }}
      />
    );
  }

  if (!user.onboarding_completed) {
    return (
      <WelcomeView
        user={user}
        workspace={workspace}
        onUserChanged={setUser}
        onCompleted={async () => {
          await refreshUser();
          navigate(`/${workspace.slug}/inbox`, true);
        }}
      />
    );
  }

  if (route.kind !== 'workspace') return <AuthLoading label="Opening your workspace…" />;
  if (!resolvedWorkspace || !desiredScope || workspaceScope !== desiredScope) return <AuthLoading />;
  const routeWorkspace = resolvedWorkspace;
  return (
    <WorkspaceApplication
      key={desiredScope}
      route={route}
      navigationKey={locationVersion}
      workspace={routeWorkspace}
      user={user}
      accounts={accounts}
      navigate={navigate}
      refreshUser={refreshUser}
      switchAccount={switchAccount}
    />
  );
};
