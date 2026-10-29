import React, { useMemo, useState, useRef, useEffect } from 'react';
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
    <div className="preferences-shell">
      {/* 1. Left Navigation Sidebar */}
      {drawer.isSmall && <SidebarBackdrop open={drawer.isOpen} onClose={drawer.close} />}
      <aside
        ref={sidebarRef}
        className="preferences-sidebar"
        aria-label="Settings navigation"
        data-small={drawer.isSmall ? 'true' : undefined}
        data-open={drawer.isOpen ? 'true' : 'false'}
        {...drawer.swipeHandlers}
      >
        {/* Back to app */}
        <div className="preferences-back-container">
          <button
            type="button"
            aria-label="Back to app"
            className="preferences-back-button"
            onClick={openLastAppPage}
          >
            <span className="preferences-back-icon" aria-hidden="true">
              <BuyerlyIcon name="chevron-left" size={14} />
            </span>
            <span>Back to app</span>
          </button>
        </div>

        {/* Search Settings */}
        <div className="preferences-search-container" aria-label="Search settings">
          <form onSubmit={(e) => e.preventDefault()} className="preferences-search-form">
            <input
              type="search"
              role="search"
              aria-label="Search…"
              placeholder="Search…"
              spellCheck={false}
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="preferences-search-input"
            />
            <span className="preferences-search-icon" aria-hidden="true">
              <BuyerlyIcon name="search" size={16} />
            </span>
          </form>
        </div>

        {/* Navigation list */}
        <nav className="preferences-nav-list">
          <div className="preferences-nav-group">
            <h2 className="preferences-nav-heading">Personal</h2>
            {visibleSections.includes('preferences') && (
              <a
                href="#preferences"
                className={`preferences-nav-item ${section === 'preferences' ? 'active' : ''}`}
                data-active={section === 'preferences'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('preferences');
                }}
              >
                <SettingsPageIcon section="preferences" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Preferences</span>
              </a>
            )}
            {visibleSections.includes('profile') && (
              <a
                href="#profile"
                className={`preferences-nav-item ${section === 'profile' ? 'active' : ''}`}
                data-active={section === 'profile'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('profile');
                }}
              >
                <SettingsPageIcon section="profile" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Profile</span>
              </a>
            )}
            {visibleSections.includes('notifications') && (
              <a
                href="#notifications"
                className={`preferences-nav-item ${notificationsOpen ? 'active' : ''}`}
                data-active={notificationsOpen}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('notifications');
                }}
              >
                <SettingsPageIcon section="notifications" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Notifications</span>
              </a>
            )}
            {visibleSections.includes('security') && (
              <a
                href="#security"
                className={`preferences-nav-item ${section === 'security' ? 'active' : ''}`}
                data-active={section === 'security'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('security');
                }}
              >
                <SettingsPageIcon section="security" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Security &amp; access</span>
              </a>
            )}
            {visibleSections.includes('connected-accounts') && (
              <a
                href="#connected-accounts"
                className={`preferences-nav-item ${section === 'connected-accounts' ? 'active' : ''}`}
                data-active={section === 'connected-accounts'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('connected-accounts');
                }}
              >
                <SettingsPageIcon section="connected-accounts" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Connected accounts</span>
              </a>
            )}
          </div>

          {visibleSections.includes('rule-labels') && (
            <div className="preferences-nav-group">
              <h2 className="preferences-nav-heading">Rules</h2>
              <a
                href="#rule-labels"
                className={`preferences-nav-item ${section === 'rule-labels' ? 'active' : ''}`}
                data-active={section === 'rule-labels'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('rule-labels');
                }}
              >
                <SettingsPageIcon section="rule-labels" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Labels</span>
              </a>
            </div>
          )}

          {administrationPages.length > 0 && (
            <div className="preferences-nav-group">
              <h2 className="preferences-nav-heading">Administration</h2>
              {administrationPages.map((page) => {
                // A team's pages belong to Teams, unless "Your teams" lists the open one.
                const active = section === page.section || (page.section === 'teams'
                  && section === 'team' && !yourTeams.some((team) => team.key === openTeamKey));
                return (
                <a
                  key={page.section}
                  href={`#${page.section}`}
                  className={`preferences-nav-item ${active ? 'active' : ''}`}
                  data-active={active}
                  onClick={(e) => {
                    e.preventDefault();
                    openSettings(page.section);
                  }}
                >
                  <SettingsPageIcon section={page.section} className="preferences-nav-icon" />
                  <span className="preferences-nav-label">{page.label}</span>
                </a>
                );
              })}
            </div>
          )}

          {canOpenTeams && !searchQuery.trim() && (
            <div className="preferences-nav-group">
              <h2 className="preferences-nav-heading">Your teams</h2>
              {yourTeams.map((team) => (
                <a
                  key={team.id}
                  href={`#team-${team.key}`}
                  className={`preferences-nav-item ${openTeamKey === team.key ? 'active' : ''}`}
                  data-active={openTeamKey === team.key}
                  onClick={(e) => {
                    e.preventDefault();
                    openTeamSettings(team.key);
                  }}
                >
                  <TeamIcon size={16} className="preferences-nav-icon" />
                  <span className="preferences-nav-label">{team.name}</span>
                </a>
              ))}
              <a
                href="#new-team"
                className={`preferences-nav-item ${section === 'new-team' ? 'active' : ''}`}
                data-active={section === 'new-team'}
                onClick={(e) => {
                  e.preventDefault();
                  openSettings('new-team');
                }}
              >
                <BuyerlyIcon name="add" size={16} className="preferences-nav-icon" />
                <span className="preferences-nav-label">Create a team</span>
              </a>
            </div>
          )}

          {visibleSections.length === 0 && (
            <div className="preferences-no-results">No settings found</div>
          )}
        </nav>
        <SidebarUtilityFooter />
      </aside>

      {/* 2. Main Scrollable Canvas */}
      <main className="preferences-main-canvas">
        <div className="preferences-scroll-container">
          {drawer.isSmall && (
            // Linear's small-screen settings header: the menu button and a way back to the app.
            <header className="preferences-small-header">
              <SidebarCollapsedNavigation />
              <button
                type="button"
                className="preferences-small-header-link"
                onClick={openLastAppPage}
              >
                <BuyerlyChevronGlyph size={12} direction="right" />
                <span>Settings</span>
              </button>
            </header>
          )}
          <div className={`preferences-content-column${section === 'members' || section === 'teams' || section === 'rule-labels' ? ' preferences-content-column--wide' : ''}`}>
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
            <div className="preferences-title-container">
              <h1 className="preferences-page-title">Preferences</h1>
            </div>

            {/* Section: Interface and theme */}
            <div className="preferences-section">
              <div className="preferences-section-header">
                <h3 className="preferences-section-title">Interface and theme</h3>
              </div>

              <section className="preferences-card-container">
                <div className="preferences-row-item preferences-row-item--column-on-mobile">
                  <div className="preferences-row-copy">
                    <span className="preferences-row-title">Interface theme</span>
                    <span className="preferences-row-desc">
                      Select or customize your interface color scheme
                    </span>
                  </div>

                  <div className="preferences-theme-control" ref={menuRef}>
                    <button
                      type="button"
                      role="combobox"
                      aria-haspopup="listbox"
                      aria-expanded={themeMenuOpen}
                      aria-label="Interface theme"
                      className="preferences-combobox-trigger"
                      onClick={() => setThemeMenuOpen((prev) => !prev)}
                    >
                      <span className="preferences-combobox-content">
                        <span className="preferences-combobox-value">
                          <span
                            className={`preferences-aa-badge preferences-aa-badge--${selectedTheme.value}`}
                          >
                            <span className="preferences-aa-dot">•</span>
                            <span>Aa</span>
                          </span>
                          <span className="preferences-combobox-text">
                            {selectedTheme.label}
                          </span>
                        </span>
                      </span>
                      <span className="preferences-combobox-chevron" aria-hidden="true">
                        <BuyerlyChevronGlyph />
                      </span>
                    </button>

                    {themeMenuOpen && (
                      <div
                        className="preferences-dropdown-menu"
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
                              className={`preferences-dropdown-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setInterfaceTheme(option.value);
                                setThemeMenuOpen(false);
                              }}
                            >
                              <span
                                className={`preferences-aa-badge preferences-aa-badge--${option.value}`}
                              >
                                <span className="preferences-aa-dot">•</span>
                                <span>Aa</span>
                              </span>
                              <span className="preferences-dropdown-item-label">
                                {option.label}
                              </span>
                              {isSelected && (
                                <BuyerlyIcon name="check" size={14} className="preferences-dropdown-check" />
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
            <div className="preferences-section">
              <div className="preferences-section-header">
                <h3 className="preferences-section-title">AI assistant</h3>
              </div>

              <section className="preferences-card-container">
                <div className="preferences-row-item">
                  <div className="preferences-row-copy">
                    <span className="preferences-row-title">Let your browser's AI assistant use Buyerly</span>
                    <span className="preferences-row-desc">
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
