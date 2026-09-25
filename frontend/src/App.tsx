import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { StatisticsView } from '@/components/statistics/StatisticsView';
import { CommandMenu } from '@/components/command/CommandMenu';
import { PreferencesView } from '@/components/preferences/PreferencesView';
import { AppUtilityBar } from '@/components/layout/AppUtilityBar';
import { TooltipProvider } from '@/ui/Tooltip';
import { ToastRegion } from '@/ui/ToastRegion';
import { useUndoShortcuts } from '@/lib/undoHistory';
import { useAppStore } from '@/store/useAppStore';
import { apiRequest } from '@/lib/api';
import type { LoginResult, SessionUser, Workspace } from '@/lib/types';
import { isWorkspaceReturnRoute, parseRoute, pathForTab, type Route } from '@/lib/routing';
import { AuthLoading } from '@/components/auth/AuthFrame';
import { LoginView } from '@/components/auth/LoginView';
import { VerifyEmailLinkView } from '@/components/auth/VerifyEmailLinkView';
import { InviteView } from '@/components/auth/InviteView';
import { NotFoundView } from '@/components/auth/NotFoundView';
import { CreateWorkspaceView } from '@/components/onboarding/CreateWorkspaceView';
import { WelcomeView } from '@/components/onboarding/WelcomeView';
import { MetaConnectInviteView, MetaConnectSuccessView } from '@/components/auth/MetaConnectInviteView';

const RETURN_ROUTE_KEY = 'buyerly-return-route';

function activeWorkspace(user: SessionUser): Workspace | null {
  return user.active_workspace || user.workspaces.find((workspace) => workspace.is_active) || user.workspaces[0] || null;
}

interface WorkspaceApplicationProps {
  route: Extract<Route, { kind: 'workspace' }>;
  workspace: Workspace;
  user: SessionUser;
  navigate: (path: string, replace?: boolean) => void;
  refreshUser: () => Promise<SessionUser>;
}

const WorkspaceApplication: React.FC<WorkspaceApplicationProps> = ({
  route,
  workspace,
  user,
  navigate,
  refreshUser,
}) => {
  const {
    activeTab,
    setActiveTab,
    campaignFilterTab,
    setCampaignFilterTab,
    setWorkspaceName,
    toggleRightSidebar,
    toggleSidebarCollapsed,
    interfaceTheme,
  } = useAppStore();
  useUndoShortcuts();
  const [gPressed, setGPressed] = useState(false);
  const syncingRoute = useRef(true);

  useEffect(() => {
    syncingRoute.current = true;
    setWorkspaceName(workspace.name);
    setActiveTab(route.tab);
    if (route.entity) setCampaignFilterTab(route.entity);
    document.title = `${workspace.name} — Buyerly`;
    queueMicrotask(() => {
      syncingRoute.current = false;
    });
  }, [route.entity, route.tab, setActiveTab, setCampaignFilterTab, setWorkspaceName, workspace.name]);

  useEffect(() => {
    if (syncingRoute.current) return;
    const desiredPath = pathForTab(workspace.slug, activeTab, campaignFilterTab);
    if (window.location.pathname !== desiredPath) {
      const campaignQuery = activeTab === 'campaigns' && window.location.pathname.startsWith(`/${workspace.slug}/ads-manager/`)
        ? window.location.search : '';
      navigate(desiredPath + campaignQuery);
    }
  }, [activeTab, campaignFilterTab, navigate, workspace.slug]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) return;

      if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === '[') {
        event.preventDefault();
        toggleSidebarCollapsed();
        return;
      }
      if ((event.ctrlKey || event.altKey || event.metaKey) && ['i', 'I'].includes(event.key)) {
        event.preventDefault();
        toggleRightSidebar();
        return;
      }

      const key = event.key.toLowerCase();
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        if (key === 'g') {
          setGPressed(true);
          clearTimeout(timer);
          timer = setTimeout(() => setGPressed(false), 1500);
          return;
        }
        if (gPressed) {
          const shortcutTab = key === 'i'
            ? 'inbox'
            : key === 'c'
              ? 'campaigns'
              : key === 'r'
                ? 'rules'
                : key === 's'
                  ? 'statistics'
                  : null;
          if (shortcutTab) {
            event.preventDefault();
            setActiveTab(shortcutTab);
            setGPressed(false);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [gPressed, setActiveTab, toggleRightSidebar, toggleSidebarCollapsed]);

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
    <TooltipProvider>
      <div className="app-shell flex h-screen w-screen overflow-hidden">
        {activeTab === 'preferences' ? (
          <PreferencesView user={user} onUserChanged={refreshUser} />
        ) : (
          <>
            <Sidebar />
            <main className="linear-floating-canvas">
              {activeTab === 'inbox' && <InboxView />}
              {activeTab === 'campaigns' && <CampaignsView />}
              {activeTab === 'rules' && <RulesView />}
              {activeTab === 'statistics' && <StatisticsView />}
            </main>
            <CommandMenu />
          </>
        )}
        <AppUtilityBar />
      </div>
      <ToastRegion />
    </TooltipProvider>
  );
};

export const App: React.FC = () => {
  const [locationVersion, setLocationVersion] = useState(0);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const route = useMemo(() => parseRoute(), [locationVersion]);

  const resolvedWorkspace = user && route.kind === 'workspace'
    ? user.workspaces.find(item => item.slug === route.workspace) : null;
  const desiredScope = resolvedWorkspace && user?.onboarding_completed
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

  const refreshUser = useCallback(async () => {
    const nextUser = await apiRequest<SessionUser>('/api/me');
    setUser(nextUser);
    return nextUser;
  }, []);

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
    useAppStore.getState().setWorkspaceScope(null);
    const nextUser = await refreshUser();
    enterUserDestination(nextUser, result.redirect_url);
  }, [enterUserDestination, refreshUser]);

  useEffect(() => {
    const onPopState = () => setLocationVersion((version) => version + 1);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (route.kind === 'verify-email-link') return;
    refreshUser().catch(() => setUser(null));
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
    if (route.kind === 'root' || route.kind === 'login' || route.kind === 'create-workspace' || route.kind === 'welcome') {
      navigate(`/${workspace.slug}/inbox`, true);
      return;
    }
    if (route.kind === 'workspace' && !user.workspaces.some((item) => item.slug === route.workspace)) {
      navigate(`/${workspace.slug}/inbox`, true);
    }
  }, [navigate, route, user]);

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
          await refreshUser();
          navigate(result.redirect_url || `/invite/${route.token}`, true);
        }}
        onAccepted={async (workspaceSlug, onboardingCompleted) => {
          const nextUser = await refreshUser();
          setUser(nextUser);
          navigate(onboardingCompleted ? `/${workspaceSlug}/inbox` : `/${workspaceSlug}/welcome`, true);
        }}
      />
    );
  }

  if (route.kind === 'meta-connect-invite') return <MetaConnectInviteView token={route.token} />;
  if (route.kind === 'meta-connect-success') return <MetaConnectSuccessView />;

  if (user === null) return <LoginView onAuthenticated={handleAuthenticated} />;

  const workspace = activeWorkspace(user);
  if (!workspace) {
    return (
      <CreateWorkspaceView
        user={user}
        onCreated={async (createdWorkspace) => {
          await refreshUser();
          navigate(`/${createdWorkspace.slug}/welcome`, true);
        }}
        onSignedOut={async () => {
          await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
          setUser(null);
          navigate('/login', true);
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

  if (route.kind !== 'workspace') return <AuthLoading dark label="Opening your workspace…" />;
  if (!resolvedWorkspace || workspaceScope !== desiredScope) return <AuthLoading />;
  const routeWorkspace = resolvedWorkspace;
  return (
    <WorkspaceApplication
      key={desiredScope}
      route={route}
      workspace={routeWorkspace}
      user={user}
      navigate={navigate}
      refreshUser={refreshUser}
    />
  );
};
