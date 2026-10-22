import React, { useCallback, useState } from 'react';
import { useAppStore, type AppTab } from '@/store/useAppStore';
import { LinearDisclosureIcon, LinearDotsIcon } from '@/icons/LinearIcons';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { Tooltip } from '@/ui/Tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { toast } from '@/ui/toast';
import { openAppPath, pathForTab } from '@/lib/routing';
import type { TeamItem } from '@/lib/teams';
import { useWorkspaceSession } from '@/lib/workspaceSession';

const COLLAPSED_KEY = 'buyerly-sidebar-collapsed';

function readCollapsed(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Which sidebar sections and teams are folded; Linear remembers them per browser. */
export function useSidebarCollapsed(id: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readCollapsed().includes(id));
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        const others = readCollapsed().filter((item) => item !== id);
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next ? [...others, id] : others));
      } catch { /* Storage is optional: the section still folds for this visit. */ }
      return next;
    });
  }, [id]);
  return [collapsed, toggle];
}

interface SidebarLinkProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  tooltip?: string;
  shortcut?: string;
  /** A team's page: Linear sets it 19px in, under the team's name. */
  nested?: boolean;
  trailing?: React.ReactNode;
}

/** One sidebar item, as Linear's: a 14px icon, the label, an optional count. */
export const SidebarLink: React.FC<SidebarLinkProps> = ({ icon, label, active, onClick, tooltip, shortcut, nested, trailing }) => {
  const button = (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'page' : undefined}
      className={`linear-sidebar-nav-item${nested ? ' linear-sidebar-nav-item--nested' : ''}`}
    >
      <div className="flex min-w-0 items-center">
        <span className="mr-[6px] flex h-[14px] w-[14px] shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate text-[13px] font-medium">{label}</span>
      </div>
      {trailing}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={tooltip} shortcut={shortcut} side="right" sideOffset={8}>
      {button}
    </Tooltip>
  );
};

interface SidebarSectionProps {
  id: string;
  title: string;
  /** A button that shows at the header's end under the cursor, as Linear's "Join a team". */
  action?: { label: string; icon: React.ReactNode; onClick: () => void };
  children: React.ReactNode;
}

/** Linear's foldable sidebar section: "Workspace", "Your teams". */
export const SidebarSection: React.FC<SidebarSectionProps> = ({ id, title, action, children }) => {
  const [collapsed, toggle] = useSidebarCollapsed(`section:${id}`);
  const bodyId = `sidebar-section-${id}`;
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header-row">
        <button
          type="button"
          className="sidebar-section-header"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span>{title}</span>
          <LinearDisclosureIcon size={16} className="sidebar-disclosure" data-open={collapsed ? 'false' : 'true'} />
        </button>
        {action && (
          <Tooltip content={action.label} side="bottom" sideOffset={6}>
            <button type="button" aria-label={action.label} className="sidebar-section-action" onClick={action.onClick}>
              {action.icon}
            </button>
          </Tooltip>
        )}
      </div>
      {!collapsed && (
        <div id={bodyId} className="sidebar-section-body">
          {children}
        </div>
      )}
    </div>
  );
};

interface SidebarTeamProps {
  team: TeamItem;
  workspaceSlug: string;
  /** A team's own copies of the workspace pages, in Linear's order. */
  pages: { tab: AppTab; label: string; icon: React.ReactNode }[];
}

/** One of "Your teams": the team folds open on its pages, as in Linear. */
export const SidebarTeam: React.FC<SidebarTeamProps> = ({ team, workspaceSlug, pages }) => {
  const [collapsed, toggle] = useSidebarCollapsed(`team:${team.id}`);
  const activeTab = useAppStore((state) => state.activeTab);
  const activeTeamKey = useAppStore((state) => state.activeTeamKey);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveTeamKey = useAppStore((state) => state.setActiveTeamKey);
  const openTeamSettings = useAppStore((state) => state.openTeamSettings);
  const { workspace } = useWorkspaceSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const open = (tab: AppTab) => {
    // The team's page itself, from a record under it: the tab and team do not change.
    if (activeTab === tab && activeTeamKey === team.key) {
      openAppPath(pathForTab(workspaceSlug, tab, 'campaigns', 'preferences', '', undefined, team.key));
    }
    setActiveTeamKey(team.key);
    setActiveTab(tab);
  };

  const teamLink = `${window.location.origin}${pathForTab(workspaceSlug, pages[0]?.tab ?? 'campaigns', 'campaigns', 'preferences', '', undefined, team.key)}`;

  return (
    <div className="sidebar-team">
      <div className="sidebar-team-row" data-menu-open={menuOpen ? 'true' : undefined}>
        <button type="button" className="sidebar-team-toggle" aria-expanded={!collapsed} onClick={toggle}>
          <TeamIcon size={14} />
          <span className="sidebar-team-name">{team.name}</span>
          <span className="sidebar-team-disclosure">
            <LinearDisclosureIcon size={16} className="sidebar-disclosure" data-open={collapsed ? 'false' : 'true'} />
          </span>
        </button>
        <div className="sidebar-team-menu">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Team menu" className="sidebar-section-action sidebar-team-menu-button">
                <LinearDotsIcon size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              {workspace.role !== 'guest' && (
                <DropdownMenuItem
                  onSelect={() => {
                    openTeamSettings(team.key);
                    setActiveTab('preferences');
                  }}
                >
                  Team settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard.writeText(teamLink).then(
                    () => toast.show({ tone: 'success', title: 'Copied team URL to clipboard' }),
                    () => toast.error("Couldn't copy the link", teamLink),
                  );
                }}
              >
                Copy link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!collapsed && (
        <div className="sidebar-section-body">
          {pages.map((page) => (
            <SidebarLink
              key={page.tab}
              nested
              icon={page.icon}
              label={page.label}
              active={activeTab === page.tab && activeTeamKey === team.key}
              onClick={() => open(page.tab)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
