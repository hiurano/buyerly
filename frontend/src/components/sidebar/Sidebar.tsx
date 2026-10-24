import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SidebarHeader } from './SidebarHeader';
import { selectInboxBadgeCount, useAppStore } from '@/store/useAppStore';
import {
  BuyerlyHomeIcon,
  BuyerlyInboxIcon,
  BuyerlyMembersIcon,
  BuyerlyMyIssuesIcon,
  BuyerlyIssuesIcon,
  BuyerlyBoltIcon,
  BuyerlyPlusIcon,
  BuyerlyTeamsIcon,
  BuyerlyProjectIcon,
} from '@/icons/BuyerlyIcons';
import { goToShortcut } from '@/lib/shortcuts';
import { openAppPath, parseRoute, pathForTab } from '@/lib/routing';
import { useTeams } from '@/lib/teams';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import type { AppTab } from '@/store/useAppStore';
import { SidebarLink, SidebarSection, SidebarTeam } from './SidebarSections';
import { SidebarFavorites } from './SidebarFavorites';
import { SidebarUtilityFooter } from '@/components/layout/AppUtilityBar';
import { BuyerlyHelpMenu } from '@/components/sidebar/BuyerlyHelpMenu';
import { SidebarBackdrop, useSidebarDrawer, useSidebarPeek } from './SidebarDrawer';

/** A team's pages, as Linear's: its Home, then Campaigns, Ad accounts and Rules (Linear's Issues and Projects). */
const TEAM_PAGES: { tab: AppTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'team', label: 'Home', icon: <BuyerlyHomeIcon size={14} /> },
  { tab: 'campaigns', label: 'Campaigns', icon: <BuyerlyIssuesIcon size={14} /> },
  { tab: 'accounts', label: 'Ad accounts', icon: <BuyerlyProjectIcon size={14} /> },
  { tab: 'rules', label: 'Rules', icon: <BuyerlyBoltIcon size={14} /> },
];

export const Sidebar: React.FC = () => {
  const {
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    setSidebarCollapsed,
    resetSidebarWidth,
    activeTab,
    setActiveTab,
    workspaceSlug,
  } = useAppStore();
  const inboxUnreadCount = useAppStore(selectInboxBadgeCount);
  const activeTeamKey = useAppStore((state) => state.activeTeamKey);
  const setActiveTeamKey = useAppStore((state) => state.setActiveTeamKey);
  const myCampaigns = useAppStore((state) => state.myCampaigns);
  const setMyCampaigns = useAppStore((state) => state.setMyCampaigns);
  const { workspace } = useWorkspaceSession();
  const { teams } = useTeams(workspace.id, 'active');
  const yourTeams = (teams ?? []).filter((team) => team.is_member);
  // Linear lights one row: an ad account's own page leaves Ad accounts dark, as a project's leaves
  // Projects, and a favorite lights only when no row of the sidebar's own shows the page.
  const route = parseRoute();
  const onAccountPage = route.kind === 'workspace' && route.tab === 'accounts' && Boolean(route.recordId);
  const accountsActive = activeTab === 'accounts' && !activeTeamKey && !onAccountPage;
  const sidebarShowsPage = activeTab === 'inbox'
    || (activeTab === 'campaigns' && myCampaigns)
    || activeTab === 'members'
    || accountsActive
    || activeTab === 'teams'
    || (yourTeams.some((team) => team.key === activeTeamKey) && TEAM_PAGES.some((page) => page.tab === activeTab));

  /** A page of the workspace itself; from an account's page, Ad accounts goes back to the list. */
  const openWorkspacePage = (tab: AppTab) => {
    if (tab === 'accounts' && activeTab === tab && !activeTeamKey && workspaceSlug) openAppPath(pathForTab(workspaceSlug, tab));
    setActiveTeamKey(null);
    setActiveTab(tab);
  };
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const drawer = useSidebarDrawer(surfaceRef);
  const peek = useSidebarPeek(surfaceRef, !drawer.isSmall && isSidebarCollapsed, isDragging);

  // Dynamic Spotlight Y tracking math from Linear
  const updateSpotlight = useCallback((clientY: number) => {
    if (!trackRef.current || !indicatorRef.current) return;
    const bounds = trackRef.current.getBoundingClientRect();
    const length = bounds.height;
    const clampedY = Math.min(Math.max(clientY - bounds.top, 0), length);
    const translateY = clampedY - length / 2;
    indicatorRef.current.style.transform = `translate3d(0px, ${translateY}px, 0px)`;
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    updateSpotlight(e.clientY);
  };

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      updateSpotlight(e.clientY);
    },
    [updateSpotlight]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      // Snap-to-collapse when dragged below 150px
      if (e.clientX < 150) {
        setSidebarCollapsed(true);
      } else {
        if (isSidebarCollapsed) {
          setSidebarCollapsed(false);
        }
        setSidebarWidth(e.clientX);
      }
      updateSpotlight(e.clientY);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, isSidebarCollapsed, setSidebarCollapsed, setSidebarWidth, updateSpotlight]);

  // Below 880px the sidebar takes no layout space and slides over the content.
  const surfaceTransform = drawer.isSmall
    ? (drawer.isOpen ? 'translateX(0px)' : 'translateX(calc(-100% - 16px))')
    : isSidebarCollapsed && !peek.isOpen
      ? `translateX(-${sidebarWidth + 16}px)`
      : 'translateX(0px)';
  // A collapsed desktop sidebar keeps the peek look while it slides in and out.
  const isPeekSurface = !drawer.isSmall && isSidebarCollapsed;

  return (
    <div
      className="sidebar-slot-wrapper"
      data-resizing={isDragging ? 'true' : 'false'}
      style={{
        width: drawer.isSmall ? '0px' : isSidebarCollapsed ? '8px' : `${sidebarWidth}px`,
        transition: isDragging ? 'none' : undefined,
      }}
    >
      <SidebarBackdrop
        open={drawer.isSmall ? drawer.isOpen : peek.isOpen}
        onClose={drawer.isSmall ? drawer.close : peek.close}
      />
      {isPeekSurface && <div className="sidebar-peek-edge" aria-hidden="true" {...peek.edgeHandlers} />}
      <aside
        ref={surfaceRef}
        data-sidebar-surface="true"
        data-small={drawer.isSmall ? 'true' : undefined}
        data-peek={isPeekSurface ? (peek.isOpen ? 'open' : 'closed') : undefined}
        data-resizing={isDragging ? 'true' : 'false'}
        style={{
          width: drawer.isSmall ? undefined : `${sidebarWidth}px`,
          transform: surfaceTransform,
          transition: isDragging ? 'none' : undefined,
        }}
        className="sidebar-surface app-sidebar"
        {...drawer.swipeHandlers}
      >
        {/* 1. Header (Workspace + Search + Create) */}
        <SidebarHeader />

        {/* 2. Navigation: Inbox, then Linear's "Workspace" and "Your teams" sections */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-[0.5px] space-y-[1px]">
          <SidebarLink
            icon={<BuyerlyInboxIcon size={14} />}
            label="Inbox"
            tooltip="Inbox"
            shortcut={goToShortcut('inbox')}
            active={activeTab === 'inbox'}
            onClick={() => openWorkspacePage('inbox')}
            trailing={inboxUnreadCount > 0 && (
              <span className="buyerly-sidebar-count" aria-label={`${inboxUnreadCount} unread`}>
                {inboxUnreadCount}
              </span>
            )}
          />

          {/* Linear's My issues: campaigns of the ad accounts you lead. */}
          <SidebarLink
            icon={<BuyerlyMyIssuesIcon size={14} />}
            label="My campaigns"
            tooltip="Go to my campaigns"
            active={activeTab === 'campaigns' && myCampaigns}
            onClick={() => {
              if (activeTab === 'campaigns' && myCampaigns && workspaceSlug) {
                openAppPath(pathForTab(workspaceSlug, 'campaigns', 'campaigns', 'preferences', '', undefined, null, true));
              }
              setMyCampaigns(true);
              setActiveTab('campaigns');
            }}
          />

          <SidebarSection id="workspace" title="Workspace">
            <SidebarLink
              icon={<BuyerlyMembersIcon size={14} />}
              label="Members"
              tooltip="Go to members"
              active={activeTab === 'members'}
              onClick={() => openWorkspacePage('members')}
            />
            {/* Ad accounts, as Linear's Projects (#388) */}
            <SidebarLink
              icon={<BuyerlyProjectIcon size={14} />}
              label="Ad accounts"
              tooltip="Go to ad accounts"
              shortcut={goToShortcut('accounts')}
              active={accountsActive}
              onClick={() => openWorkspacePage('accounts')}
            />
            <SidebarLink
              icon={<BuyerlyTeamsIcon size={14} />}
              label="Teams"
              tooltip="Go to teams"
              active={activeTab === 'teams'}
              onClick={() => openWorkspacePage('teams')}
            />
          </SidebarSection>

          {/* Linear's Favorites, between Workspace and Your teams, once something is starred. */}
          <SidebarFavorites workspaceSlug={workspace.slug} lit={!sidebarShowsPage} />

          <SidebarSection
            id="teams"
            title="Your teams"
            action={{ label: 'Join a team', icon: <BuyerlyPlusIcon size={14} />, onClick: () => openWorkspacePage('teams') }}
          >
            {yourTeams.map((team) => (
              <SidebarTeam key={team.id} team={team} workspaceSlug={workspace.slug} pages={TEAM_PAGES} />
            ))}
          </SidebarSection>
        </div>

        <SidebarUtilityFooter>
          <BuyerlyHelpMenu />
        </SidebarUtilityFooter>

        {/* 3. Linear Exact 3-Layer Spotlight Resizer with Double-Click Reset */}
        {!drawer.isSmall && <div
          className="buyerly-resizer-hit-target"
          data-dragging={isDragging ? 'true' : 'false'}
          onMouseMove={handleMouseMove}
          onMouseDown={startResizing}
          onDoubleClick={resetSidebarWidth}
          title="Drag to resize, double-click to reset"
        >
          <div ref={trackRef} className="buyerly-resizer-track" aria-hidden="true">
            <div ref={indicatorRef} className="buyerly-resizer-indicator" />
          </div>
        </div>}
      </aside>
    </div>
  );
};
