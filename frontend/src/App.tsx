import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { CommandMenu } from '@/components/command/CommandMenu';
import { OpenPalette } from '@/components/command/OpenPalette';
import { SearchView } from '@/components/search/SearchView';
import { searchPageTitle } from '@/lib/search';
import { WorkspaceSwitcher } from '@/components/command/WorkspaceSwitcher';
import { PreferencesView } from '@/components/preferences/PreferencesView';
import { AppUtilityBar } from '@/components/layout/AppUtilityBar';
import { TooltipProvider } from '@/ui/Tooltip';
import { ToastRegion } from '@/ui/ToastRegion';
import { useUndoShortcuts } from '@/lib/undoHistory';
import { useNewVersionNotice } from '@/lib/appVersion';
import { selectInboxBadgeCount, useAppStore } from '@/store/useAppStore';
import { apiRequest } from '@/lib/api';
import type { LoginResult, SessionUser, Workspace } from '@/lib/types';
import { isRoutedSettingsSection, isWorkspaceReturnRoute, parseRoute, pathForTab, type Route } from '@/lib/routing';
import { AuthLoading } from '@/components/auth/AuthFrame';
import { LoginView } from '@/components/auth/LoginView';
import { VerifyEmailLinkView } from '@/components/auth/VerifyEmailLinkView';
import { InviteView } from '@/components/auth/InviteView';
import { NotFoundView } from '@/components/auth/NotFoundView';
import { CreateWorkspaceView } from '@/components/onboarding/CreateWorkspaceView';
import { WelcomeView } from '@/components/onboarding/WelcomeView';
import { MetaConnectInviteView, MetaConnectSuccessView } from '@/components/auth/MetaConnectInviteView';
import { ApprovalDialog } from '@/webmcp/ApprovalDialog';
import { useWebMcpTools } from '@/webmcp/register';
import { WorkspaceSessionProvider, type WorkspaceSession } from '@/lib/workspaceSession';
import { isSmallScreen } from '@/lib/useMediaQuery';
import { GO_TO_SETTINGS_SECTION, goToTargetFor } from '@/lib/shortcuts';
import { logOut } from '@/lib/sessions';
import {
  chooseAccount,
  getCurrentAccountId,
  getKnownAccounts,
  setCurrentAccountId,
  setKnownAccounts,
  type BrowserAccount,
} from '@/lib/accounts';

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
  const {
    activeTab,
    setActiveTab,
    campaignFilterTab,
    setCampaignFilterTab,
    settingsSection,
    setSettingsSection,
    setWorkspaceName,
    toggleDetailsPane,
    toggleSidebarCollapsed,
    toggleSidebarOpen,
    setSidebarOpen,
    setSidebarPeekOpen,
    interfaceTheme,
    refreshInboxUnreadCount,
  } = useAppStore();
  const inboxBadge = useAppStore(selectInboxBadgeCount);
  useUndoShortcuts();
  useNewVersionNotice();
  useWebMcpTools(workspace);
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

  useEffect(() => {
    syncingRoute.current = true;
    setWorkspaceName(workspace.name);
    setActiveTab(route.tab);
    if (route.entity) setCampaignFilterTab(route.entity);
    if (route.tab === 'preferences') {
      const { settingsSection: current } = useAppStore.getState();
      // Plain /settings keeps any open section that has no address of its own.
      if (route.settingsSection) setSettingsSection(route.settingsSection);
      else if (isRoutedSettingsSection(current)) setSettingsSection('preferences');
    }
    queueMicrotask(() => {
      syncingRoute.current = false;
    });
  }, [route.entity, route.settingsSection, route.tab, setActiveTab, setCampaignFilterTab, setSettingsSection, setWorkspaceName, workspace.name]);

  useEffect(() => {
    // Linear closes the small-screen sidebar drawer on every navigation. Some
    // settings sections have no address of their own, so a section change counts too.
    // The desktop peek over the content closes the same way.
    setSidebarOpen(false);
    setSidebarPeekOpen(false);
  }, [route, activeTab, settingsSection, setSidebarOpen, setSidebarPeekOpen]);

  useEffect(() => {
    if (syncingRoute.current) return;
    const desiredPath = pathForTab(workspace.slug, activeTab, campaignFilterTab, settingsSection);
    if (window.location.pathname !== desiredPath && !(activeTab === 'inbox' && window.location.pathname.startsWith(`${desiredPath}/`))) {
      const campaignQuery = activeTab === 'campaigns' && window.location.pathname.startsWith(`/${workspace.slug}/ads-manager/`)
        ? window.location.search : '';
      navigate(desiredPath + campaignQuery);
    }
  }, [activeTab, campaignFilterTab, navigate, settingsSection, workspace.slug]);

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

  useEffect(() => {
    document.title = activeTab === 'inbox'
      ? (inboxBadge > 0 ? `Inbox (${inboxBadge})` : 'Inbox')
      : activeTab === 'search'
        ? searchPageTitle(window.location.search)
        : `${workspace.name} — Buyerly`;
    // The search page's title follows its query, which only the address holds.
  }, [activeTab, inboxBadge, navigationKey, workspace.name]);

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
        const { isSidebarCollapsed, isSidebarPeekOpen, activeTab: tab } = useAppStore.getState();
        if (isSmallScreen() || !isSidebarCollapsed || tab === 'preferences') return;
        event.preventDefault();
        setSidebarPeekOpen(!isSidebarPeekOpen, 'keyboard');
        return;
      }
      // Linear's "Open/Close details": Ctrl/Cmd+I, or ] beside the sidebar's [ — the pane of the view on screen.
      const detailsKey = ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyI')
        || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === ']');
      if (detailsKey) {
        const { activeTab: tab } = useAppStore.getState();
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
            setActiveTab(target);
            goToPressedAt.current = 0;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, setSettingsSection, toggleDetailsPane, setSidebarPeekOpen, toggleSidebarCollapsed, toggleSidebarOpen]);

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
        <div className="app-shell flex h-screen w-screen overflow-hidden">
          {activeTab === 'preferences' ? (
            <PreferencesView user={user} workspace={workspace} onUserChanged={refreshUser} />
          ) : (
            <>
              <Sidebar />
              <main className="linear-floating-canvas">
                {activeTab === 'inbox' && (
                  <InboxView
                    openEventId={route.tab === 'inbox' ? route.recordId : undefined}
                    inboxTab={route.tab === 'inbox' ? route.inboxTab ?? null : null}
                    // The query keeps Inbox filters while notifications open and close.
                    onNavigate={(tab, eventId) => navigate(
                      `/${workspace.slug}/inbox${tab ? `/${tab}` : ''}${eventId === null ? '' : `/${eventId}`}`
                        + window.location.search,
                    )}
                    onOpenRecord={(path) => navigate(path)}
                  />
                )}
                {activeTab === 'campaigns' && (
                  <CampaignsView
                    reveal={route.tab === 'campaigns' && route.entity && route.recordId
                      ? { entity: route.entity, id: route.recordId }
                      : undefined}
                    navigationKey={navigationKey}
                  />
                )}
                {activeTab === 'rules' && (
                  <RulesView
                    revealId={route.tab === 'rules' ? route.recordId : undefined}
                    navigationKey={navigationKey}
                  />
                )}
                {activeTab === 'search' && (
                  <SearchView workspace={workspace} navigate={navigate} navigationKey={navigationKey} />
                )}
              </main>
            </>
          )}
          <AppUtilityBar />
        </div>
        {/* Over Settings too, as in Linear: Security & access adds "Revoke all other sessions". */}
        <CommandMenu workspace={workspace} navigate={navigate} />
        <OpenPalette workspace={workspace} navigate={navigate} />
        <WorkspaceSwitcher />
        <ToastRegion />
        <ApprovalDialog />
      </TooltipProvider>
    </WorkspaceSessionProvider>
  );
};

export const App: React.FC = () => {
  const [locationVersion, setLocationVersion] = useState(0);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<BrowserAccount[]>([]);
  const route = useMemo(() => parseRoute(), [locationVersion]);

  // While the tab moves to another account, the old account's profile must not
  // scope a screen: requests already name the new account.
  const currentAccountId = getCurrentAccountId();
  const userIsCurrentAccount = !user || currentAccountId === null || user.id == null || user.id === currentAccountId;
  const resolvedWorkspace = user && route.kind === 'workspace'
    ? user.workspaces.find(item => item.slug === route.workspace) : null;
  const desiredScope = resolvedWorkspace && user?.onboarding_completed && userIsCurrentAccount
    ? `${user.username}:${resolvedWorkspace.id}` : null;
  const workspaceScope = useAppStore(state => state.workspaceScope);
  useLayoutEffect(() => {
    useAppStore.getState().setWorkspaceScope(desiredScope, resolvedWorkspace?.slug);
  }, [desiredScope, resolvedWorkspace?.slug]);

  const navigate = useCallback((path: string, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', path);
    setLocationVersion((version) => version + 1);
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
        useAppStore.getState().setWorkspaceScope(null);
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
    useAppStore.getState().setWorkspaceScope(null);
    navigate(`/${slug}/inbox`);
    // Remembered for that account, as a switch within one account is.
    apiRequest('/api/workspaces/switch', { method: 'POST', body: JSON.stringify({ slug }) }).catch(() => {});
  }, [navigate]);

  /** A login makes its account this tab's account (Add an account, invite, email link). */
  const adoptLogin = useCallback(async (result: LoginResult) => {
    await loadAccounts().catch(() => {});
    if (result.account_id) setCurrentAccountId(result.account_id);
    useAppStore.getState().setWorkspaceScope(null);
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
    const onPopState = () => setLocationVersion((version) => version + 1);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user === undefined || route.kind === 'verify-email-link' || route.kind === 'invite' || route.kind === 'meta-connect-invite' || route.kind === 'meta-connect-success' || route.kind === 'unknown') return;

    if (user === null) {
      if (route.kind !== 'login') {
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
        useAppStore.getState().setWorkspaceScope(null);
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
    if (route.kind === 'root' || route.kind === 'login' || route.kind === 'welcome') {
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
          useAppStore.getState().setWorkspaceScope(null);
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

  if (user === null) return <LoginView onAuthenticated={handleAuthenticated} />;

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
