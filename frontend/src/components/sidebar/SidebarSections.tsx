import React, { useCallback, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyDisclosureGlyph } from '@/icons/BuyerlyIcons';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { Tooltip } from '@/ui/Tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { toast } from '@/ui/toast';
import { openAppPath, openTeamSettings, pathForTab } from '@/lib/routing';
import { openTab, useCurrentPage } from '@/lib/navigation';
import type { TeamItem } from '@/lib/teams';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import type { AppTab } from '@/models/shellStore';
import { colors, fonts, motion } from '@/styles/tokens.stylex';
import { sidebarNavItemMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/stylex';
import css from './SidebarSections.module.css';

const HOVER = '@media (any-hover: hover) and (any-pointer: fine)';
const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  navItem: {
    width: '100%',
    height: { default: 28, [TOUCH]: 36 },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
    paddingRight: 4,
    paddingBottom: 0,
    paddingLeft: 6,
    borderRadius: 5,
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    lineHeight: { default: '28px', [TOUCH]: '36px' },
    color: {
      default: colors['--sidebar-item-fg'],
      [HOVER]: {
        default: colors['--sidebar-item-fg'],
        ':hover': colors['--sidebar-item-fg-strong'],
      },
      ':active': colors['--sidebar-item-fg-strong'],
    },
    backgroundColor: {
      default: 'transparent',
      [HOVER]: {
        default: 'transparent',
        ':hover': colors['--sidebar-item-hover-bg'],
      },
      ':active': colors['--item-active-bg'],
    },
    borderStyle: 'none',
    cursor: 'default',
    transition: 'background-color 0.08s ease, color 0.08s ease',
    textAlign: 'left',
    outline: 'none',
    position: 'relative',
    boxShadow: {
      default: null,
      ':focus-visible': `inset 0 0 0 1px ${colors['--sidebar-focus-ring']}`,
    },
  },
  navItemActive: {
    backgroundColor: colors['--item-active-bg'],
    color: colors['--sidebar-item-fg-strong'],
  },
  navItemNested: {
    paddingLeft: 19,
  },
  linkBody: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
  },
  linkIcon: {
    marginRight: 6,
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
  },
  section: {
    paddingTop: 16,
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    height: 24,
  },
  sectionHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    height: 24,
    paddingTop: 0,
    paddingRight: 2,
    paddingBottom: 0,
    paddingLeft: 6,
    borderStyle: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    fontFamily: fonts['--font-regular'],
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 'normal',
    color: {
      default: colors['--sidebar-item-fg'],
      [HOVER]: {
        default: colors['--sidebar-item-fg'],
        ':hover': colors['--sidebar-item-fg-strong'],
      },
      ':active': colors['--sidebar-item-fg-strong'],
    },
    cursor: 'default',
    outline: 'none',
    transition: 'color 0.08s ease, background-color 0.08s ease',
    boxShadow: {
      default: null,
      ':focus-visible': `inset 0 0 0 1px ${colors['--sidebar-focus-ring']}`,
    },
  },
  disclosure: {
    color: colors['--sidebar-disclosure-fg'],
    flexShrink: 0,
    transform: 'rotate(-90deg)',
    transition: `transform 0.12s ${motion['--ease-out-quad']}, color 0.08s ease`,
  },
  disclosureOpen: {
    transform: 'rotate(0deg)',
  },
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    paddingBottom: 10,
  },
  teamSectionBody: {
    paddingTop: 1,
    paddingBottom: 4,
  },
  sectionAction: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'none',
    borderRadius: 5,
    backgroundColor: {
      default: 'transparent',
      [HOVER]: {
        default: 'transparent',
        ':hover': colors['--sidebar-item-hover-bg'],
      },
      ':active': colors['--item-active-bg'],
    },
    color: {
      default: colors['--sidebar-item-fg'],
      [HOVER]: {
        default: colors['--sidebar-item-fg'],
        ':hover': colors['--sidebar-item-fg-strong'],
      },
      ':active': colors['--sidebar-item-fg-strong'],
    },
    cursor: 'default',
    opacity: {
      default: 0,
      ':focus-visible': 1,
      ':is([data-state="open"])': 1,
    },
    outline: 'none',
    transition: 'opacity 0.08s ease, background-color 0.08s ease, color 0.08s ease',
    boxShadow: {
      default: null,
      ':focus-visible': `inset 0 0 0 1px ${colors['--sidebar-focus-ring']}`,
    },
  },
  sectionActionOpen: {
    opacity: 1,
  },
  teamRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 28,
    borderRadius: 5,
    transition: 'background-color 0.08s ease',
    backgroundColor: {
      default: null,
      [HOVER]: {
        default: null,
        ':hover': colors['--sidebar-item-hover-bg'],
      },
    },
  },
  teamRowMenuOpen: {
    backgroundColor: colors['--sidebar-item-hover-bg'],
  },
  teamToggle: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingTop: 0,
    paddingRight: 28,
    paddingBottom: 0,
    paddingLeft: 6,
    borderStyle: 'none',
    borderRadius: 5,
    backgroundColor: 'transparent',
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '28px',
    color: colors['--sidebar-item-fg'],
    cursor: 'default',
    textAlign: 'left',
    outline: 'none',
    boxShadow: {
      default: null,
      ':focus-visible': `inset 0 0 0 1px ${colors['--sidebar-focus-ring']}`,
    },
  },
  teamName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    transition: 'color 0.08s ease',
  },
  teamLock: {
    flexShrink: 0,
    color: colors['--sidebar-disclosure-fg'],
  },
  teamDisclosure: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: -3,
  },
  teamMenu: {
    position: 'absolute',
    right: 2,
    top: 2,
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.08s ease',
  },
  teamMenuOpen: {
    opacity: 1,
    pointerEvents: 'auto',
  },
});

const COLLAPSED_KEY = 'buyerly-sidebar-collapsed';

function readCollapsed(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Which sidebar sections and teams are folded; Linear remembers them per browser. */
function useSidebarCollapsed(id: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readCollapsed().includes(id));
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      const others = readCollapsed().filter((item) => item !== id);
      const folded = next ? [...others, id] : others;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(folded));
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
      {...withClassName(
        stylex.props(sidebarNavItemMarker, styles.navItem, active && styles.navItemActive, nested && styles.navItemNested),
        css.navItem,
        'buyerly-sidebar-nav-item',
      )}
    >
      <div {...stylex.props(styles.linkBody)}>
        <span {...stylex.props(styles.linkIcon)}>{icon}</span>
        <span {...stylex.props(styles.linkLabel)}>{label}</span>
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
    <div {...withClassName(stylex.props(styles.section), css.section)}>
      <div {...withClassName(stylex.props(styles.sectionHeaderRow), css.sectionHeaderRow)}>
        <button
          type="button"
          {...stylex.props(styles.sectionHeader)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span>{title}</span>
          <BuyerlyDisclosureGlyph {...stylex.props(styles.disclosure, !collapsed && styles.disclosureOpen)} data-open={collapsed ? 'false' : 'true'} />
        </button>
        {action && (
          <Tooltip content={action.label} side="bottom" sideOffset={6}>
            <button type="button" aria-label={action.label} {...withClassName(stylex.props(styles.sectionAction), css.sectionAction)} onClick={action.onClick}>
              {action.icon}
            </button>
          </Tooltip>
        )}
      </div>
      {!collapsed && (
        <div id={bodyId} {...stylex.props(styles.sectionBody)}>
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
  const { tab: activeTab, teamKey: activeTeamKey } = useCurrentPage();
  const { workspace } = useWorkspaceSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const open = (tab: AppTab) => {
    // The team's page itself, from a record under it: the tab and team do not change.
    if (activeTab === tab && activeTeamKey === team.key) {
      openAppPath(pathForTab(workspaceSlug, tab, 'campaigns', 'preferences', '', undefined, team.key));
    } else openTab(tab, { teamKey: team.key });
  };

  const teamLink = `${window.location.origin}${pathForTab(workspaceSlug, pages[0]?.tab ?? 'campaigns', 'campaigns', 'preferences', '', undefined, team.key)}`;

  return (
    <div className="sidebar-team">
      <div
        {...withClassName(stylex.props(styles.teamRow, menuOpen && styles.teamRowMenuOpen), css.teamRow)}
        data-menu-open={menuOpen ? 'true' : undefined}
      >
        <button type="button" {...stylex.props(styles.teamToggle)} aria-expanded={!collapsed} onClick={toggle}>
          <TeamIcon size={14} />
          <span {...withClassName(stylex.props(styles.teamName), css.teamName, 'sidebar-team-name')}>{team.name}</span>
          {team.private && <BuyerlyIcon name="lock" size={12} {...stylex.props(styles.teamLock)} aria-label="Private team" />}
          <span {...withClassName(stylex.props(styles.teamDisclosure), css.teamDisclosure)}>
            <BuyerlyDisclosureGlyph {...withClassName(stylex.props(styles.disclosure, !collapsed && styles.disclosureOpen), css.disclosure)} data-open={collapsed ? 'false' : 'true'} />
          </span>
        </button>
        <div {...withClassName(stylex.props(styles.teamMenu, menuOpen && styles.teamMenuOpen), css.teamMenu)}>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Team menu"
                {...withClassName(stylex.props(styles.sectionAction, menuOpen && styles.sectionActionOpen), css.sectionAction)}
              >
                <BuyerlyIcon name="more" size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              {workspace.role !== 'guest' && (
                <DropdownMenuItem
                  onSelect={() => openTeamSettings(team.key)}
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
        <div {...stylex.props(styles.sectionBody, styles.teamSectionBody)}>
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
