import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router';
import { CommandMenu } from '@/components/command/CommandMenu';
import { BuyerlyShortcutsPanel } from '@/components/help/BuyerlyShortcutsPanel';
import { favoritesStore } from '@/lib/favorites';
import { OpenPalette } from '@/components/command/OpenPalette';
import { searchPageTitle } from '@/lib/search';
import { pageTitle } from '@/lib/pageTitle';
import { useTeams } from '@/lib/teams';
import { WorkspaceSwitcher } from '@/components/command/WorkspaceSwitcher';
import { AppUtilityBar } from '@/components/layout/AppUtilityBar';
import { TooltipProvider } from '@/ui/Tooltip';
import { ToastRegion } from '@/ui/ToastRegion';
import { useUndoShortcuts } from '@/lib/undoHistory';
import { useNewVersionNotice } from '@/lib/appVersion';
import { ApiError, apiRequest } from '@/lib/api';
import { graphql } from '@/lib/graphql';
import type { LoginResult, SessionUser, Workspace } from '@/lib/types';
import {
  currentRoute,
  currentTab,
  isWorkspaceReturnRoute,
  openAppPath,
  openSettings,
  pathForTab,
  useAppNavigate,
  useRoute,
  type WorkspaceRoute,
} from '@/lib/routing';
import { appPlaceOf, openTab, useCurrentPage } from '@/lib/navigation';
import type { BuyerlyWorkspaceOutlet } from '@/components/layout/BuyerlyAppPages';
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
import { localDatabase, rememberSession, rememberedSession } from '@/models/localDatabase';
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
import { useSyncStatus } from '@/models/sync';
import { shellStore, useShellStore } from '@/models/shellStore';
import { useDetailsPaneStore } from '@/models/detailsPaneStore';
import { useViewStore } from '@/models/viewStore';
import * as stylex from '@stylexjs/stylex';
import { withClassName } from '@/ui/withClassName';

const RETURN_ROUTE_KEY = 'buyerly-return-route';

const styles = stylex.create({
  /** The window: the sidebar and the floating canvas side by side. */
  shell: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
  },
});

/**
 * The profile this tab's account had when last seen, for an address of one of
 * its workspaces: the app opens on it, with the workspace's local database,
 * before the server answers, as Linear opens (#496). The server's profile
 * replaces it as soon as it comes; a session it no longer knows signs out.
 */
function rememberedStart(): { user: SessionUser; accounts: BrowserAccount[] } | null {
  const route = currentRoute();
  if (route.kind !== 'workspace') return null;
  const held = rememberedSession();
  if (!held) return null;
  const account = chooseAccount(held.accounts, route.workspace);
  const users = Object.values(held.users);
  const user = account ? held.users[String(account.id)] : (users.length === 1 ? users[0] : undefined);
  if (!user?.onboarding_completed || !user.workspaces.some((workspace) => workspace.slug === route.workspace)) return null;
  if (account) {
    setKnownAccounts(held.accounts);
    setCurrentAccountId(account.id);
  }
  return { user, accounts: held.accounts };
}

/** Read once, when the app loads. */
const remembered = rememberedStart();

function activeWorkspace(user: SessionUser): Workspace | null {
  return user.active_workspace || user.workspaces.find((workspace) => workspace.is_active) || user.workspaces[0] || null;
}

/** Remembers the workspace as the one the account's next visit opens. */
function switchWorkspace(slug: string): Promise<unknown> {
  return graphql(
    'mutation WorkspaceSwitch($input: JSON!) { workspaceSwitch(input: $input) { success lastSyncId } }',
    { input: { slug } },
  );
}

/** What the App hands the workspace's routes once its profile and scope are ready. */
interface WorkspaceOutlet extends BuyerlyWorkspaceOutlet {
  workspace: Workspace;
  user: SessionUser;
  accounts: BrowserAccount[];
  /** Opens a workspace of another account logged in to this browser. */
  switchAccount: (accountId: number, slug: string) => void;
}

/** The workspace's layout route: its session, shortcuts and menus around Settings or the app's pages. */
export const WorkspaceApplication: React.FC = () => {
  const outlet = useOutletContext<WorkspaceOutlet>();
  const { workspace, user, accounts, refreshUser, switchAccount } = outlet;
  const navigate = useAppNavigate();
  const routeNow = useRoute();
  const route: WorkspaceRoute = routeNow.kind === 'workspace' ? routeNow : { kind: 'workspace', workspace: workspace.slug, tab: 'inbox' };
  const { pathname, search } = useLocation();
  const { teamKey: activeTeamKey, mine: myCampaigns } = useCurrentPage();
  const setCampaignFilterTab = useViewStore((state) => state.setCampaignFilterTab);
  const rememberAppPlace = useShellStore((state) => state.rememberAppPlace);
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
  useEffect(() => {
    setWorkspaceName(workspace.name);
  }, [setWorkspaceName, workspace.name]);
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
      switchWorkspace(slug)
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

  useEffect(() => {
    // A member or guest has no Administration pages: their addresses open Settings itself.
    if (route.settingsSection && !canOpenSettingsSection({ role: workspace.role }, route.settingsSection)) {
      navigate(`/${workspace.slug}/settings`, true);
    }
  }, [navigate, route.settingsSection, workspace.role, workspace.slug]);

  useEffect(() => {
    // Settings and search go back to the app page they were opened from, and keep its team.
    const place = appPlaceOf(route);
    if (place) rememberAppPlace(place.tab, place.teamKey, place.mine);
    // Ads Manager opens on the level last on screen.
    if (route.entity) setCampaignFilterTab(route.entity);
  }, [rememberAppPlace, route, setCampaignFilterTab]);

  useEffect(() => {
    // Linear closes the small-screen sidebar drawer on every navigation.
    // The desktop peek over the content closes the same way.
    setSidebarOpen(false);
    setSidebarPeekOpen(false);
  }, [pathname, setSidebarOpen, setSidebarPeekOpen]);

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
  const activeTab = route.tab;
  useEffect(() => {
    // An account's page and a document name their record themselves once it has loaded.
    if ((activeTab === 'accounts' || activeTab === 'team') && route.recordId) return;
    document.title = activeTab === 'search'
      // The search page's title follows its query, which only the address holds.
      ? searchPageTitle(search)
      : pageTitle({
        activeTab,
        activeTeamKey,
        myCampaigns,
        settingsSection: route.settingsSection ?? 'preferences',
        settingsTeamPath: route.teamPath ?? '',
        teamName: (key) => titleTeams?.find((team) => team.key === key)?.name ?? null,
        teamPage: route.teamPage,
        rulesPage: route.rulesPage,
        inboxBadge,
      });
  }, [activeTab, activeTeamKey, inboxBadge, myCampaigns, route.recordId, route.rulesPage, route.settingsSection, route.teamPage, route.teamPath, search, titleTeams]);

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
        const { isSidebarCollapsed, isSidebarPeekOpen } = shellStore;
        if (isSmallScreen() || !isSidebarCollapsed || currentTab() === 'preferences') return;
        event.preventDefault();
        setSidebarPeekOpen(!isSidebarPeekOpen, 'keyboard');
        return;
      }
      // Linear's "Open/Close details": Ctrl/Cmd+I, or ] beside the sidebar's [ — the pane of the view on screen.
      const detailsKey = ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyI')
        || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === ']');
      if (detailsKey) {
        const tab = currentTab();
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
            if (target === 'preferences') openSettings(GO_TO_SETTINGS_SECTION);
            // G R from Recently deleted goes back to the list: the tab itself does not change.
            // G K from an account's page goes back to the Ad accounts list the same way.
            else if ((target === 'rules' || target === 'accounts') && currentTab() === target) {
              openAppPath(pathForTab(workspace.slug, target));
            } else openTab(target);
            goToPressedAt.current = 0;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDetailsPane, setSidebarPeekOpen, toggleSidebarCollapsed, toggleSidebarOpen, workspace.slug]);

  // The member's favorites of this workspace, for the sidebar and every star.
  useEffect(() => {
    void favoritesStore.load(workspace.slug);
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

  return (
    <WorkspaceSessionProvider value={session}>
      <TooltipProvider>
        <div {...withClassName(stylex.props(styles.shell), 'app-shell')}>
          {/* Settings, or the sidebar and the page on screen. */}
          <Outlet context={outlet} />
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
  const [user, setUser] = useState<SessionUser | null | undefined>(remembered ? remembered.user : undefined);
  const [accounts, setAccounts] = useState<BrowserAccount[]>(remembered ? remembered.accounts : []);
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
  // Where the sync engine stands (#507), on <html> for the browser checks and anyone inspecting the page.
  const syncStatus = useSyncStatus();
  useEffect(() => {
    document.documentElement.dataset.sync = syncStatus;
  }, [syncStatus]);
  // The profile is kept for the next start; with no account signed in, nothing this browser kept stays (#496).
  useEffect(() => {
    if (user) rememberSession(user, accounts);
    else if (user === null) void localDatabase.wipe(null);
  }, [accounts, user]);
  // The reload splash goes once a screen other than the boot loader is on the page (#433).
  useLayoutEffect(() => {
    if (!document.querySelector('[data-boot-loading]')) finishSplash();
  });

  const navigate = useAppNavigate();

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
    switchWorkspace(slug).catch(() => {});
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
    })().catch((error: unknown) => {
      // Offline, the profile last seen stays; a session the server refuses signs out.
      if (remembered && !(error instanceof ApiError)) return;
      setUser(null);
    });
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
  const outlet: WorkspaceOutlet = { workspace: resolvedWorkspace, user, accounts, refreshUser, switchAccount };
  // The workspace's routes, from scratch for each account and workspace.
  return <Outlet key={desiredScope} context={outlet} />;
};
