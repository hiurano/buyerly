import React, { Suspense, createContext, use, useMemo } from 'react';
import { Outlet, useLocation, useOutlet, useOutletContext } from 'react-router';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { AccountsView } from '@/components/accounts/AccountsView';
import { AccountPage } from '@/components/accounts/AccountPage';
import { RecentlyDeletedRulesPage } from '@/components/rules/RecentlyDeletedRulesPage';
import { SearchView } from '@/components/search/SearchView';
import { WorkspaceMembersView } from '@/components/workspace/WorkspaceMembersView';
import { WorkspaceTeamsView } from '@/components/workspace/WorkspaceTeamsView';
import { TeamHomeView } from '@/components/teams/TeamHomeView';
import { PreferencesView } from '@/components/preferences/PreferencesView';
import { BuyerlyPageGate, BuyerlyPageSkeleton, useHeldPage } from '@/components/layout/BuyerlyPageSwitch';
import { BuyerlyPageScopeContext } from '@/lib/pageScope';
import { pathForTab, useAppNavigate, useNavigationKey, useRoute, type BuyerlyRouteHandle, type WorkspaceRoute } from '@/lib/routing';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import type { SessionUser } from '@/lib/types';
import { useViewStore } from '@/models/viewStore';

/** What the workspace's routes get from the App above them. */
export interface BuyerlyWorkspaceOutlet {
  refreshUser: () => Promise<SessionUser>;
}

/** The page on screen, as of its own navigation: while the next one gets ready it stays as it was (#490). */
interface BuyerlyHeldPage {
  route: WorkspaceRoute;
  /** The address's query then. */
  search: string;
  navigationKey: number;
}

const BuyerlyHeldPageContext = createContext<BuyerlyHeldPage | null>(null);

function useBuyerlyHeldPage(): BuyerlyHeldPage {
  const page = use(BuyerlyHeldPageContext);
  if (!page) throw new Error('A page route renders inside BuyerlyAppPages');
  return page;
}

/**
 * The app's pages: the sidebar, and in `main` the page route's outlet. Linear's
 * page switch (#490): the sidebar and the address move at once, but `main`
 * keeps the outlet on screen until the next page has its data.
 */
export const BuyerlyAppPages: React.FC = () => {
  const { workspace } = useWorkspaceSession();
  const route = useRoute();
  const { pathname, search } = useLocation();
  const navigationKey = useNavigationKey();
  const outlet = useOutlet();
  const campaignFilterTab = useViewStore((state) => state.campaignFilterTab);
  const pageRoute: WorkspaceRoute = route.kind === 'workspace' ? route : { kind: 'workspace', workspace: workspace.slug, tab: 'inbox' };
  const teamKey = pageRoute.teamKey ?? null;
  const mine = Boolean(pageRoute.mine);
  const entity = pageRoute.entity ?? campaignFilterTab;
  const shown = useHeldPage({
    tab: pageRoute.tab,
    teamKey,
    mine,
    entity,
    inboxTab: pageRoute.inboxTab ?? null,
    search,
    pathname,
    route: pageRoute,
    navigationKey,
    outlet,
  }, `${pageRoute.tab}:${teamKey ?? ''}:${mine}:${entity}:${navigationKey}`, workspace.id);
  const page = shown.page;
  const pageScope = useMemo(
    () => ({ teamKey: page.teamKey, entity: page.entity, pathname: page.pathname }),
    [page.teamKey, page.entity, page.pathname],
  );
  const held = useMemo(
    () => ({ route: page.route, search: page.search, navigationKey: page.navigationKey }),
    [page.route, page.search, page.navigationKey],
  );

  return (
    <>
      <Sidebar />
      <main className="buyerly-floating-canvas">
        <BuyerlyPageScopeContext value={pageScope}>
          <BuyerlyHeldPageContext value={held}>
            <Suspense fallback={<BuyerlyPageSkeleton />}>
              <BuyerlyPageGate ready={shown.ready}>{page.outlet}</BuyerlyPageGate>
            </Suspense>
          </BuyerlyHeldPageContext>
        </BuyerlyPageScopeContext>
      </main>
    </>
  );
};

/** Settings' routes: each section is Settings itself, handed what the App gives the workspace. */
export const BuyerlySettingsLayout: React.FC = () => <Outlet context={useOutletContext<BuyerlyWorkspaceOutlet>()} />;

/** Settings: its own layout in place of the sidebar, its section from the address. */
export const BuyerlySettingsRoute: React.FC = () => {
  const { user, workspace } = useWorkspaceSession();
  const { refreshUser } = useOutletContext<BuyerlyWorkspaceOutlet>();
  return <PreferencesView user={user} workspace={workspace} onUserChanged={refreshUser} />;
};

const BuyerlyInboxRoute: React.FC = () => {
  const { route } = useBuyerlyHeldPage();
  const { workspace } = useWorkspaceSession();
  const navigate = useAppNavigate();
  return (
    <InboxView
      openEventId={route.recordId}
      inboxTab={route.inboxTab ?? null}
      // The query keeps Inbox filters while notifications open and close.
      onNavigate={(tab, eventId) => navigate(
        `/${workspace.slug}/inbox${tab ? `/${tab}` : ''}${eventId === null ? '' : `/${eventId}`}` + window.location.search,
      )}
      onOpenRecord={(path) => navigate(path)}
    />
  );
};

const BuyerlyAccountsRoute: React.FC = () => {
  const { route, navigationKey } = useBuyerlyHeldPage();
  const navigate = useAppNavigate();
  return route.recordId
    ? <AccountPage accountId={route.recordId} navigate={navigate} navigationKey={navigationKey} />
    : <AccountsView navigate={navigate} navigationKey={navigationKey} />;
};

const BuyerlyCampaignsRoute: React.FC = () => {
  const { route, navigationKey } = useBuyerlyHeldPage();
  return (
    <CampaignsView
      key={route.mine ? 'mine' : 'all'}
      mine={Boolean(route.mine)}
      reveal={route.entity && route.recordId ? { entity: route.entity, id: route.recordId } : undefined}
      navigationKey={navigationKey}
    />
  );
};

const BuyerlyRulesRoute: React.FC = () => {
  const { route, navigationKey } = useBuyerlyHeldPage();
  return <RulesView revealId={route.recordId} navigationKey={navigationKey} />;
};

const BuyerlyRecentlyDeletedRulesRoute: React.FC = () => {
  const { workspace } = useWorkspaceSession();
  const navigate = useAppNavigate();
  return (
    <RecentlyDeletedRulesPage
      rulesPath={pathForTab(workspace.slug, 'rules')}
      onOpenRules={() => navigate(pathForTab(workspace.slug, 'rules'))}
    />
  );
};

const BuyerlyTeamHomeRoute: React.FC = () => {
  const { route } = useBuyerlyHeldPage();
  const navigate = useAppNavigate();
  return <TeamHomeView page={route.teamPage ?? 'overview'} documentId={route.recordId} navigate={navigate} />;
};

const BuyerlySearchRoute: React.FC = () => {
  const { search, navigationKey } = useBuyerlyHeldPage();
  const { workspace } = useWorkspaceSession();
  const navigate = useAppNavigate();
  return <SearchView workspace={workspace} query={search} navigate={navigate} navigationKey={navigationKey} />;
};

/** The component a page route renders; Settings' sections render inside BuyerlySettingsRoute. */
export function pageComponentFor(opened: Extract<BuyerlyRouteHandle, { page: unknown }>): React.ComponentType | undefined {
  switch (opened.page) {
    case 'inbox': return BuyerlyInboxRoute;
    case 'accounts': return BuyerlyAccountsRoute;
    case 'campaigns': return BuyerlyCampaignsRoute;
    case 'rules': return opened.rulesPage ? BuyerlyRecentlyDeletedRulesRoute : BuyerlyRulesRoute;
    case 'team': return BuyerlyTeamHomeRoute;
    case 'members': return WorkspaceMembersView;
    case 'teams': return WorkspaceTeamsView;
    case 'search': return BuyerlySearchRoute;
    default: return undefined;
  }
}
