import React, { useState, useCallback, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import * as stylex from '@stylexjs/stylex';
import { withClassName } from '@/ui/withClassName';
import css from './Sidebar.module.css';
import { SidebarHeader } from './SidebarHeader';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { goToShortcut } from '@/lib/shortcuts';
import { openAppPath, pathForTab, useRoute } from '@/lib/routing';
import { openTab, useCurrentPage } from '@/lib/navigation';
import { useTeams } from '@/lib/teams';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { SidebarLink, SidebarSection, SidebarTeam } from './SidebarSections';
import { SidebarFavorites } from './SidebarFavorites';
import { SidebarUtilityFooter } from '@/components/layout/AppUtilityBar';
import { BuyerlyHelpButton } from '@/components/sidebar/BuyerlyHelpButton';
import { SidebarBackdrop, useSidebarDrawer, useSidebarPeek } from './SidebarDrawer';
import { useInboxStore } from '@/models/inboxStore';
import { useShellStore, type AppTab } from '@/models/shellStore';
import { useScopeStore } from '@/models/scopeStore';
import { colors, layout, motion } from '@/styles/tokens.stylex';

const styles = stylex.create({
  slotWrapper: {
    position: 'relative',
    height: '100vh',
    flexShrink: 0,
    overflow: 'visible',
    transition: `width ${motion['--sidebar-spring-duration']} ${motion['--sidebar-spring']}`,
  },
  resizing: {
    transition: 'none',
  },
  surface: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
    overflow: 'visible',
    zIndex: 96,
    transition: `transform ${motion['--sidebar-spring-duration']} ${motion['--sidebar-spring']}`,
    willChange: 'transform',
  },
  surfaceSmall: {
    position: 'fixed',
    height: '100%',
    width: 'min(calc(100vw - 40px), 330px)',
    zIndex: 99,
    backgroundColor: colors['--bg-window'],
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    boxShadow: `0 0 0 1px ${colors['--color-border-primary']}, ${colors['--canvas-shadow']}`,
  },
  surfacePeek: {
    backgroundColor: colors['--bg-canvas'],
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    boxShadow: `0 0 0 1px ${colors['--color-border-secondary']}, ${colors['--command-menu-shadow']}`,
  },
  surfacePeekClosed: {
    boxShadow: 'none',
  },
  peekEdge: {
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    width: 8,
  },
  /** Inbox, then the sections; Sidebar.module.css sets each row 1px below the one before. */
  navigation: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingLeft: 12,
    paddingRight: 12,
    paddingBottom: 16,
    paddingTop: 0.5,
  },
  count: {
    fontSize: 12,
    fontWeight: 450,
    lineHeight: '15px',
    color: colors['--text-tertiary'],
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  resizerHitTarget: {
    position: 'absolute',
    top: 14,
    bottom: 40,
    right: -3.5,
    width: 7,
    cursor: 'col-resize',
    zIndex: 97,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    background: 'transparent',
    backgroundPosition: '0 0',
  },
  resizerTrack: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: '50%',
    width: 0.5,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: colors['--sidebar-resizer-track'],
    opacity: 0,
    transition: 'opacity 0.25s 0s',
    maskImage: 'linear-gradient(rgba(0, 0, 0, 0), rgb(0, 0, 0) 10%, rgb(0, 0, 0) 90%, rgba(0, 0, 0, 0))',
  },
  resizerTrackDragging: {
    opacity: 1,
  },
  resizerIndicator: {
    position: 'absolute',
    top: '-50%',
    left: 0,
    right: 0,
    height: '200%',
    backgroundColor: colors['--resizer-line-color'],
    willChange: 'transform',
    maskImage: layout['--resizer-spot-mask'],
  },
});

/** A team's pages, as Linear's: its Home, then Campaigns, Ad accounts and Rules (Linear's Issues and Projects). */
const TEAM_PAGES: { tab: AppTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'team', label: 'Home', icon: <BuyerlyIcon name="home" size={14} /> },
  { tab: 'campaigns', label: 'Campaigns', icon: <BuyerlyIcon name="campaigns" size={14} /> },
  { tab: 'accounts', label: 'Ad accounts', icon: <BuyerlyIcon name="ad-accounts" size={14} /> },
  { tab: 'rules', label: 'Rules', icon: <BuyerlyIcon name="rules" size={14} /> },
];

const SidebarContent: React.FC = () => {
  const sidebarWidth = useShellStore((state) => state.sidebarWidth);
  const setSidebarWidth = useShellStore((state) => state.setSidebarWidth);
  const isSidebarCollapsed = useShellStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useShellStore((state) => state.setSidebarCollapsed);
  const resetSidebarWidth = useShellStore((state) => state.resetSidebarWidth);
  const workspaceSlug = useScopeStore((state) => state.workspaceSlug);
  const inboxUnreadCount = useInboxStore((store) => store.badgeCount);
  const { tab: activeTab, teamKey: activeTeamKey, mine: myCampaigns } = useCurrentPage();
  const { workspace } = useWorkspaceSession();
  const { teams } = useTeams(workspace.id, 'active');
  const yourTeams = (teams ?? []).filter((team) => team.is_member);
  // Linear lights one row: an ad account's own page leaves Ad accounts dark, as a project's leaves
  // Projects, and a favorite lights only when no row of the sidebar's own shows the page.
  const route = useRoute();
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
    else openTab(tab, { teamKey: null });
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
      {...withClassName(stylex.props(styles.slotWrapper, isDragging && styles.resizing), 'sidebar-slot-wrapper')}
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
      {isPeekSurface && <div {...stylex.props(styles.peekEdge)} aria-hidden="true" {...peek.edgeHandlers} />}
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
        {...withClassName(stylex.props(
            styles.surface,
            drawer.isSmall && styles.surfaceSmall,
            isPeekSurface && styles.surfacePeek,
            isPeekSurface && !peek.isOpen && styles.surfacePeekClosed,
            isDragging && styles.resizing,
          ), 'app-sidebar')}
        {...drawer.swipeHandlers}
      >
        {/* 1. Header (Workspace + Search + Create) */}
        <SidebarHeader />

        {/* 2. Navigation: Inbox, then Linear's "Workspace" and "Your teams" sections */}
        <div {...withClassName(stylex.props(styles.navigation), css.navigation)}>
          <SidebarLink
            icon={<BuyerlyIcon name="inbox" size={14} />}
            label="Inbox"
            tooltip="Inbox"
            shortcut={goToShortcut('inbox')}
            active={activeTab === 'inbox'}
            onClick={() => openWorkspacePage('inbox')}
            trailing={inboxUnreadCount > 0 && (
              <span {...withClassName(stylex.props(styles.count), 'buyerly-sidebar-count')} aria-label={`${inboxUnreadCount} unread`}>
                {inboxUnreadCount}
              </span>
            )}
          />

          {/* Linear's My issues: campaigns of the ad accounts you lead. */}
          <SidebarLink
            icon={<BuyerlyIcon name="my-campaigns" size={14} />}
            label="My campaigns"
            tooltip="Go to my campaigns"
            active={activeTab === 'campaigns' && myCampaigns}
            onClick={() => {
              if (activeTab === 'campaigns' && myCampaigns && workspaceSlug) {
                openAppPath(pathForTab(workspaceSlug, 'campaigns', 'campaigns', 'preferences', '', undefined, null, true));
              } else openTab('campaigns', { mine: true });
            }}
          />

          <SidebarSection id="workspace" title="Workspace">
            <SidebarLink
              icon={<BuyerlyIcon name="members" size={14} />}
              label="Members"
              tooltip="Go to members"
              active={activeTab === 'members'}
              onClick={() => openWorkspacePage('members')}
            />
            {/* Ad accounts, as Linear's Projects (#388) */}
            <SidebarLink
              icon={<BuyerlyIcon name="ad-accounts" size={14} />}
              label="Ad accounts"
              tooltip="Go to ad accounts"
              shortcut={goToShortcut('accounts')}
              active={accountsActive}
              onClick={() => openWorkspacePage('accounts')}
            />
            <SidebarLink
              icon={<BuyerlyIcon name="teams" size={14} />}
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
            action={{ label: 'Join a team', icon: <BuyerlyIcon name="add" size={14} />, onClick: () => openWorkspacePage('teams') }}
          >
            {yourTeams.map((team) => (
              <SidebarTeam key={team.id} team={team} workspaceSlug={workspace.slug} pages={TEAM_PAGES} />
            ))}
          </SidebarSection>
        </div>

        <SidebarUtilityFooter>
          <BuyerlyHelpButton />
        </SidebarUtilityFooter>

        {/* 3. Linear Exact 3-Layer Spotlight Resizer with Double-Click Reset */}
        {!drawer.isSmall && <div
          {...withClassName(stylex.props(styles.resizerHitTarget), css.resizerHitTarget)}
          data-dragging={isDragging ? 'true' : 'false'}
          onMouseMove={handleMouseMove}
          onMouseDown={startResizing}
          onDoubleClick={resetSidebarWidth}
          title="Drag to resize, double-click to reset"
        >
          <div ref={trackRef} {...withClassName(stylex.props(styles.resizerTrack, isDragging && styles.resizerTrackDragging), css.resizerTrack)} aria-hidden="true">
            <div ref={indicatorRef} {...stylex.props(styles.resizerIndicator)} />
          </div>
        </div>}
      </aside>
    </div>
  );
};

/** Draws the pool's models as they change (#488). */
export const Sidebar = observer(SidebarContent);
