import React, { useMemo, useState, useRef, useEffect } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  ADMINISTRATION_PAGES,
  SETTINGS_PAGE_GROUPS,
  SETTINGS_PAGE_KEYWORDS,
  canAdministerWorkspace,
} from '@/lib/settingsPages';
import { SidebarUtilityFooter } from '@/components/layout/AppUtilityBar';
import type { SessionUser, Workspace } from '@/lib/types';
import { ProfileSection } from './ProfileSection';
import { MembersSection } from './MembersSection';
import { WorkspaceSection } from './WorkspaceSection';
import { TeamsSection } from './TeamsSection';
import { NewTeamSection } from './NewTeamSection';
import { TeamSettingsSection } from './TeamSettingsSection';
import { TeamIcon } from './TeamIcon';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyChevronGlyph } from '@/icons/BuyerlyIcons';
import { useTeams } from '@/lib/teams';
import {
  DesktopNotificationsSection,
  EmailNotificationsSection,
  NotificationsSection,
  PriorityNotificationsSection,
  TelegramNotificationsSection,
} from './NotificationsSection';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { SecuritySection } from './SecuritySection';
import { RuleLabelsSection } from './RuleLabelsSection';
import { WorkspaceSecuritySection } from './WorkspaceSecuritySection';
import { SettingsPageIcon } from './SettingsPageIcon';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { findModelContext, setWebMcpEnabled, useWebMcpEnabled } from '@/webmcp/register';
import { SidebarBackdrop, useSidebarDrawer } from '@/components/sidebar/SidebarDrawer';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { useShellStore, type InterfaceTheme } from '@/models/shellStore';
import { openSettings, openTeamSettings, useSettingsPage } from '@/lib/routing';
import { openLastAppPage } from '@/lib/navigation';
import { withClassName } from '@/ui/withClassName';
import { preferencesStyles } from './preferencesStyles';
import css from './Preferences.module.css';

const themeOptions: Array<{
  value: InterfaceTheme;
  label: string;
}> = [
  { value: 'system', label: 'System preference' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const sectionKeywords = SETTINGS_PAGE_KEYWORDS;

interface PreferencesViewProps {
  user: SessionUser;
  workspace: Workspace;
  onUserChanged: () => void | Promise<unknown>;
}

export const PreferencesView: React.FC<PreferencesViewProps> = ({ user, workspace, onUserChanged }) => {
  const interfaceTheme = useShellStore((state) => state.interfaceTheme);
  const setInterfaceTheme = useShellStore((state) => state.setInterfaceTheme);
  // The page of Settings is the address's (#495); the App sends a section this role has no access to back to /settings.
  const { section, teamPath } = useSettingsPage();
  const [searchQuery, setSearchQuery] = useState('');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  // Settings navigation never collapses on desktop; below 880px it is the same drawer as the app sidebar.
  const drawer = useSidebarDrawer(sidebarRef);

  const assistantOn = useWebMcpEnabled();
  const assistantSupported = findModelContext() !== null;
  const assistantForced = import.meta.env.VITE_WEBMCP === '1';

  const notificationsOpen = section === 'notifications' || section === 'priority-notifications'
    || section === 'desktop-notifications' || section === 'email-notifications' || section === 'telegram-notifications';
  const selectedTheme = themeOptions.find((option) => option.value === interfaceTheme) || themeOptions[0];
  const canAdminister = canAdministerWorkspace(workspace);
  const { teams } = useTeams(workspace.id, 'active');
  // Linear's "Your teams" under Administration: the active teams you are on.
  // Linear lists your teams in Settings for everyone but guests.
  const canOpenTeams = workspace.role !== 'guest';
  const yourTeams = canOpenTeams ? (teams || []).filter((team) => team.is_member) : [];
  const openTeamKey = section === 'team' ? teamPath.split('/')[0].toUpperCase() : '';
  const visibleSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (Object.keys(sectionKeywords) as Array<keyof typeof sectionKeywords>).filter((key) =>
      sectionKeywords[key].includes(query) && (canAdminister || !ADMINISTRATION_PAGES.includes(key))
    );
  }, [canAdminister, searchQuery]);
  const administrationPages = (SETTINGS_PAGE_GROUPS.find((group) => group.heading === 'Administration')?.pages ?? [])
    .filter((page) => visibleSections.includes(page.section));
  // Linear's interface previews: "• Aa" in the theme's own colors and accent.
  const badgeVariant = (value: InterfaceTheme) =>
    value === 'light' ? preferencesStyles.aaBadgeLight : value === 'dark' ? preferencesStyles.aaBadgeDark : null;
  const dotVariant = (value: InterfaceTheme) =>
    value === 'light' ? preferencesStyles.aaDotLight : value === 'dark' ? preferencesStyles.aaDotDark : null;
  const navIconClass = (active: boolean) =>
    `${stylex.props(preferencesStyles.navIcon, active && preferencesStyles.navIconActive).className ?? ''} ${css.navIcon}`.trim();

  useEffect(() => {
    // Linear's "Back to app": Ctrl+Esc leaves Settings for the page it came from.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [cmdk-root]')) return;
      event.preventDefault();
      openLastAppPage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setThemeMenuOpen(false);
      }
    };

    if (themeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [themeMenuOpen]);

  return (
    <div {...stylex.props(preferencesStyles.shell)}>
      {/* 1. Left Navigation Sidebar */}
      {drawer.isSmall && <SidebarBackdrop open={drawer.isOpen} onClose={drawer.close} />}
      <aside
        ref={sidebarRef}
        {...withClassName(
          stylex.props(
            preferencesStyles.sidebar,
            drawer.isSmall && preferencesStyles.sidebarSmall,
            drawer.isSmall && drawer.isOpen && preferencesStyles.sidebarSmallOpen,
          ),
          'preferences-sidebar',
        )}
        aria-label="Settings navigation"
        data-small={drawer.isSmall ? 'true' : undefined}
        data-open={drawer.isOpen ? 'true' : 'false'}
        {...drawer.swipeHandlers}
      >
        {/* Back to app */}
        <div {...stylex.props(preferencesStyles.backContainer)}>
          <button
            type="button"
            aria-label="Back to app"
            {...stylex.props(preferencesStyles.backButton)}
            onClick={openLastAppPage}
          >
            <span {...stylex.props(preferencesStyles.backIcon)} aria-hidden="true">
              <BuyerlyIcon name="chevron-left" size={14} />
            </span>
            <span>Back to app</span>
          </button>
        </div>

        {/* Search Settings */}
        <div {...stylex.props(preferencesStyles.searchContainer)} aria-label="Search settings">
          <form onSubmit={(e) => e.preventDefault()} {...stylex.props(preferencesStyles.searchForm)}>
            <input
              type="search"
              role="search"
              aria-label="Search…"
              placeholder="Search…"
              spellCheck={false}
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              {...withClassName(stylex.props(preferencesStyles.searchInput), `${css.searchInput} preferences-search-input`)}
            />
            <span {...stylex.props(preferencesStyles.searchIcon)} aria-hidden="true">
              <BuyerlyIcon name="search" size={16} />
            </span>
          </form>
        </div>

        {/* Navigation list */}
        <nav {...stylex.props(preferencesStyles.navList)}>
          <div {...withClassName(stylex.props(preferencesStyles.navGroup), 'preferences-nav-group')}>
            <h2 {...withClassName(stylex.props(preferencesStyles.navHeading), 'preferences-nav-heading')}>Personal</h2>
            {visibleSections.includes('preferences') && (
              <a
                href="#preferences"
                {...withClassName(stylex.props(preferencesStyles.navItem, section === 'preferences' && preferencesStyles.navItemActive), css.navItem)}
                data-active={section === 'preferences'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('preferences');
                }}
              >
                <SettingsPageIcon section="preferences" className={navIconClass(section === 'preferences')} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Preferences</span>
              </a>
            )}
            {visibleSections.includes('profile') && (
              <a
                href="#profile"
                {...withClassName(stylex.props(preferencesStyles.navItem, section === 'profile' && preferencesStyles.navItemActive), css.navItem)}
                data-active={section === 'profile'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('profile');
                }}
              >
                <SettingsPageIcon section="profile" className={navIconClass(section === 'profile')} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Profile</span>
              </a>
            )}
            {visibleSections.includes('notifications') && (
              <a
                href="#notifications"
                {...withClassName(stylex.props(preferencesStyles.navItem, notificationsOpen && preferencesStyles.navItemActive), css.navItem)}
                data-active={notificationsOpen}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('notifications');
                }}
              >
                <SettingsPageIcon section="notifications" className={navIconClass(notificationsOpen)} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Notifications</span>
              </a>
            )}
            {visibleSections.includes('security') && (
              <a
                href="#security"
                {...withClassName(stylex.props(preferencesStyles.navItem, section === 'security' && preferencesStyles.navItemActive), css.navItem)}
                data-active={section === 'security'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('security');
                }}
              >
                <SettingsPageIcon section="security" className={navIconClass(section === 'security')} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Security &amp; access</span>
              </a>
            )}
            {visibleSections.includes('connected-accounts') && (
              <a
                href="#connected-accounts"
                {...withClassName(stylex.props(preferencesStyles.navItem, section === 'connected-accounts' && preferencesStyles.navItemActive), css.navItem)}
                data-active={section === 'connected-accounts'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('connected-accounts');
                }}
              >
                <SettingsPageIcon section="connected-accounts" className={navIconClass(section === 'connected-accounts')} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Connected accounts</span>
              </a>
            )}
          </div>

          {visibleSections.includes('rule-labels') && (
            <div {...withClassName(stylex.props(preferencesStyles.navGroup), 'preferences-nav-group')}>
              <h2 {...withClassName(stylex.props(preferencesStyles.navHeading), 'preferences-nav-heading')}>Rules</h2>
              <a
                href="#rule-labels"
                {...withClassName(stylex.props(preferencesStyles.navItem, section === 'rule-labels' && preferencesStyles.navItemActive), css.navItem)}
                data-active={section === 'rule-labels'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('rule-labels');
                }}
              >
                <SettingsPageIcon section="rule-labels" className={navIconClass(section === 'rule-labels')} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Labels</span>
              </a>
            </div>
          )}

          {administrationPages.length > 0 && (
            <div {...withClassName(stylex.props(preferencesStyles.navGroup), 'preferences-nav-group')}>
              <h2 {...withClassName(stylex.props(preferencesStyles.navHeading), 'preferences-nav-heading')}>Administration</h2>
              {administrationPages.map((page) => {
                // A team's pages belong to Teams, unless "Your teams" lists the open one.
                const active = section === page.section || (page.section === 'teams'
                  && section === 'team' && !yourTeams.some((team) => team.key === openTeamKey));
                return (
                <a
                  key={page.section}
                  href={`#${page.section}`}
                  {...withClassName(stylex.props(preferencesStyles.navItem, active && preferencesStyles.navItemActive), css.navItem)}
                  data-active={active}
                  onClick={(e) => {
                    e.preventDefault();
                    openSettings(page.section);
                  }}
                >
                  <SettingsPageIcon section={page.section} className={navIconClass(active)} />
                  <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>{page.label}</span>
                </a>
                );
              })}
            </div>
          )}

          {canOpenTeams && !searchQuery.trim() && (
            <div {...withClassName(stylex.props(preferencesStyles.navGroup), 'preferences-nav-group')}>
              <h2 {...withClassName(stylex.props(preferencesStyles.navHeading), 'preferences-nav-heading')}>Your teams</h2>
              {yourTeams.map((team) => (
                <a
                  key={team.id}
                  href={`#team-${team.key}`}
                  {...withClassName(stylex.props(preferencesStyles.navItem, openTeamKey === team.key && preferencesStyles.navItemActive), css.navItem)}
                  data-active={openTeamKey === team.key}
                  onClick={(e) => {
                    e.preventDefault();
                    openTeamSettings(team.key);
                  }}
                >
                  <TeamIcon size={16} className={navIconClass(openTeamKey === team.key)} />
                  <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>{team.name}</span>
                </a>
              ))}
              <a
                href="#new-team"
                {...withClassName(stylex.props(preferencesStyles.navItem, section === 'new-team' && preferencesStyles.navItemActive), css.navItem)}
                data-active={section === 'new-team'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('new-team');
                }}
              >
                <BuyerlyIcon name="add" size={16} className={navIconClass(section === 'new-team')} />
                <span {...withClassName(stylex.props(preferencesStyles.navLabel), 'preferences-nav-label')}>Create a team</span>
              </a>
            </div>
          )}

          {visibleSections.length === 0 && (
            <div {...stylex.props(preferencesStyles.noResults)}>No settings found</div>
          )}
        </nav>
        <SidebarUtilityFooter />
      </aside>

      {/* 2. Main Scrollable Canvas */}
      <main {...stylex.props(preferencesStyles.mainCanvas)}>
        <div {...stylex.props(preferencesStyles.scrollContainer)}>
          {drawer.isSmall && (
            // Linear's small-screen settings header: the menu button and a way back to the app.
            <header {...stylex.props(preferencesStyles.smallHeader)}>
              <SidebarCollapsedNavigation />
              <button
                type="button"
                {...withClassName(stylex.props(preferencesStyles.smallHeaderLink), css.smallHeaderLink)}
                onClick={openLastAppPage}
              >
                <BuyerlyChevronGlyph size={12} direction="right" />
                <span>Settings</span>
              </button>
            </header>
          )}
          <div {...stylex.props(
            preferencesStyles.contentColumn,
            (section === 'members' || section === 'teams' || section === 'rule-labels') && preferencesStyles.contentColumnWide,
          )}>
            {section === 'profile' && (
              <ProfileSection user={user} workspace={workspace} onUserChanged={onUserChanged} />
            )}

            {section === 'notifications' && (
              <NotificationsSection
                onOpenPriority={() => openSettings('priority-notifications')}
                onOpenDesktop={() => openSettings('desktop-notifications')}
                onOpenEmail={() => openSettings('email-notifications')}
                onOpenTelegram={() => openSettings('telegram-notifications')}
              />
            )}

            {section === 'priority-notifications' && (
              <PriorityNotificationsSection onBack={() => openSettings('notifications')} />
            )}

            {section === 'desktop-notifications' && (
              <DesktopNotificationsSection
                onBack={() => openSettings('notifications')}
                onOpenPriority={() => openSettings('priority-notifications')}
              />
            )}

            {section === 'email-notifications' && (
              <EmailNotificationsSection
                email={user.email}
                onBack={() => openSettings('notifications')}
                onOpenPriority={() => openSettings('priority-notifications')}
              />
            )}

            {section === 'telegram-notifications' && (
              <TelegramNotificationsSection
                onBack={() => openSettings('notifications')}
                onOpenPriority={() => openSettings('priority-notifications')}
                onOpenConnections={() => openSettings('connected-accounts')}
              />
            )}

            {section === 'connected-accounts' && <ConnectedAccountsSection />}

            {section === 'security' && <SecuritySection />}

            {section === 'rule-labels' && <RuleLabelsSection workspace={workspace} />}

            {canAdminister && section === 'workspace' && (
              <WorkspaceSection workspace={workspace} onUserChanged={onUserChanged} />
            )}

            {canAdminister && section === 'teams' && <TeamsSection workspace={workspace} />}

            {canOpenTeams && section === 'new-team' && <NewTeamSection workspace={workspace} />}

            {canOpenTeams && section === 'team' && (
              <TeamSettingsSection key={teamPath.split('/')[0]} workspace={workspace} path={teamPath} />
            )}

            {canAdminister && section === 'members' && (
              <MembersSection workspace={workspace} onUserChanged={onUserChanged} />
            )}

            {canAdminister && section === 'workspace-security' && (
              <WorkspaceSecuritySection workspace={workspace} />
            )}

            {section === 'preferences' && (
              <>
            {/* Page Title */}
            <div {...stylex.props(preferencesStyles.titleContainer)}>
              <h1 {...stylex.props(preferencesStyles.pageTitle)}>Preferences</h1>
            </div>

            {/* Section: Interface and theme */}
            <div {...stylex.props(preferencesStyles.section)}>
              <div {...stylex.props(preferencesStyles.sectionHeader)}>
                <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Interface and theme</h3>
              </div>

              <section {...stylex.props(preferencesStyles.cardContainer)}>
                <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
                  <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
                    <span {...stylex.props(preferencesStyles.rowTitle)}>Interface theme</span>
                    <span {...stylex.props(preferencesStyles.rowDesc)}>
                      Select or customize your interface color scheme
                    </span>
                  </div>

                  <div {...stylex.props(preferencesStyles.themeControl)} ref={menuRef}>
                    <button
                      type="button"
                      role="combobox"
                      aria-haspopup="listbox"
                      aria-expanded={themeMenuOpen}
                      aria-label="Interface theme"
                      {...stylex.props(preferencesStyles.comboboxTrigger)}
                      onClick={() => setThemeMenuOpen((prev) => !prev)}
                    >
                      <span {...stylex.props(preferencesStyles.comboboxContent)}>
                        <span {...stylex.props(preferencesStyles.comboboxValue)}>
                          <span {...stylex.props(preferencesStyles.aaBadge, badgeVariant(selectedTheme.value))}>
                            <span {...stylex.props(preferencesStyles.aaDot, dotVariant(selectedTheme.value))}>•</span>
                            <span>Aa</span>
                          </span>
                          <span {...stylex.props(preferencesStyles.comboboxText)}>
                            {selectedTheme.label}
                          </span>
                        </span>
                      </span>
                      <span {...stylex.props(preferencesStyles.comboboxChevron)} aria-hidden="true">
                        <BuyerlyChevronGlyph />
                      </span>
                    </button>

                    {themeMenuOpen && (
                      <div
                        {...stylex.props(preferencesStyles.dropdownMenu)}
                        role="listbox"
                        aria-label="Interface theme"
                      >
                        {themeOptions.map((option) => {
                          const isSelected = option.value === interfaceTheme;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              {...withClassName(
                                stylex.props(preferencesStyles.dropdownItem, isSelected && preferencesStyles.dropdownItemSelected),
                                isSelected && css.dropdownItemSelected,
                              )}
                              onClick={() => {
                                setInterfaceTheme(option.value);
                                setThemeMenuOpen(false);
                              }}
                            >
                              <span {...stylex.props(preferencesStyles.aaBadge, badgeVariant(option.value))}>
                                <span {...stylex.props(preferencesStyles.aaDot, dotVariant(option.value))}>•</span>
                                <span>Aa</span>
                              </span>
                              <span {...stylex.props(preferencesStyles.dropdownItemLabel)}>
                                {option.label}
                              </span>
                              {isSelected && (
                                <BuyerlyIcon name="check" size={14} {...stylex.props(preferencesStyles.dropdownCheck)} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Section: AI assistant */}
            <div {...stylex.props(preferencesStyles.section)}>
              <div {...stylex.props(preferencesStyles.sectionHeader)}>
                <h3 {...stylex.props(preferencesStyles.sectionTitle)}>AI assistant</h3>
              </div>

              <section {...stylex.props(preferencesStyles.cardContainer)}>
                <div {...withClassName(stylex.props(preferencesStyles.rowItem), css.rowItem)}>
                  <div {...stylex.props(preferencesStyles.rowCopy)}>
                    <span {...stylex.props(preferencesStyles.rowTitle)}>Let your browser's AI assistant use Buyerly</span>
                    <span {...stylex.props(preferencesStyles.rowDesc)}>
                      {assistantSupported
                        ? 'It reads stats and sets up alerts, asking you before each change. This browser only.'
                        : 'Not available in this browser yet. Use Chrome 149 or newer.'}
                    </span>
                  </div>
                  <BuyerlyToggle
                    size="settings"
                    checked={assistantOn}
                    onChange={setWebMcpEnabled}
                    disabled={!assistantSupported || assistantForced}
                    tooltipContent={assistantOn ? 'Turn off for the AI assistant' : 'Turn on for the AI assistant'}
                  />
                </div>
              </section>
            </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
