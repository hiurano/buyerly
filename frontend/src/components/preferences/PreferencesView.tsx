import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppStore, type InterfaceTheme } from '@/store/useAppStore';
import {
  ADMINISTRATION_PAGES,
  ADMINISTRATION_SECTIONS,
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
import { useTeams } from '@/lib/teams';
import {
  EmailNotificationsSection,
  NotificationsSection,
  PriorityNotificationsSection,
  TelegramNotificationsSection,
} from './NotificationsSection';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { SecuritySection } from './SecuritySection';
import { WorkspaceSecuritySection } from './WorkspaceSecuritySection';
import { SettingsPageIcon } from './SettingsPageIcon';
import { LinearToggle } from '@/ui/LinearToggle';
import { findModelContext, setWebMcpEnabled, useWebMcpEnabled } from '@/webmcp/register';
import { SidebarBackdrop, useSidebarDrawer } from '@/components/sidebar/SidebarDrawer';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';

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
  const {
    interfaceTheme,
    setInterfaceTheme,
    lastAppTab,
    setActiveTab,
    settingsSection: section,
    setSettingsSection: setSection,
    settingsTeamPath: teamPath,
    openTeamSettings,
  } = useAppStore();
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
    || section === 'email-notifications' || section === 'telegram-notifications';
  const selectedTheme = themeOptions.find((option) => option.value === interfaceTheme) || themeOptions[0];
  const canAdminister = canAdministerWorkspace(workspace);
  const { teams } = useTeams(workspace.id, 'active');
  // Linear's "Your teams" under Administration: the active teams you are on.
  const yourTeams = canAdminister ? (teams || []).filter((team) => team.is_member) : [];
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
    // A buyer or viewer has no Administration pages; their addresses open Preferences.
    if (!canAdminister && ADMINISTRATION_SECTIONS.includes(section)) setSection('preferences');
  }, [canAdminister, section, setSection]);

  useEffect(() => {
    // Linear's "Back to app": Ctrl+Esc leaves Settings for the page it came from.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [cmdk-root]')) return;
      event.preventDefault();
      setActiveTab(lastAppTab);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lastAppTab, setActiveTab]);

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
            onClick={() => setActiveTab(lastAppTab)}
          >
            <span className="preferences-back-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.53033 11.4697C10.82322 11.7626 10.82322 12.2374 10.53033 12.5303C10.23744 12.8232 9.76256 12.8232 9.46967 12.5303L5.46967 8.53033C5.1793 8.23999 5.1764 7.77014 5.4632 7.47624L9.36581 3.47624C9.65508 3.17976 10.12991 3.17391 10.42639 3.46318C10.72287 3.75244 10.72872 4.22728 10.43946 4.52376L7.05417 7.99351L10.53033 11.4697Z" />
              </svg>
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M7 2C9.76142 2 12 4.23858 12 7C12 8.11012 11.6375 9.13519 11.0254 9.96484L13.7803 12.7197L13.832 12.7764C14.0723 13.0709 14.0549 13.5057 13.7803 13.7803C13.5057 14.0549 13.0709 14.0723 12.7764 13.832L12.7197 13.7803L9.96484 11.0254C9.13519 11.6375 8.11012 12 7 12C4.23858 12 2 9.76142 2 7C2 4.23858 4.23858 2 7 2ZM7 3.5C5.067 3.5 3.5 5.067 3.5 7C3.5 8.933 5.067 10.5 7 10.5C8.933 10.5 10.5 8.933 10.5 7C10.5 5.067 8.933 3.5 7 3.5Z"
                />
              </svg>
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
                  setSection('preferences');
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
                  setSection('profile');
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
                  setSection('notifications');
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
                  setSection('security');
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
                  setSection('connected-accounts');
                }}
              >
                <SettingsPageIcon section="connected-accounts" className="preferences-nav-icon" />
                <span className="preferences-nav-label">Connected accounts</span>
              </a>
            )}
          </div>

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
                    setSection(page.section);
                  }}
                >
                  <SettingsPageIcon section={page.section} className="preferences-nav-icon" />
                  <span className="preferences-nav-label">{page.label}</span>
                </a>
                );
              })}
            </div>
          )}

          {canAdminister && !searchQuery.trim() && (
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
                  setSection('new-team');
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="preferences-nav-icon">
                  <path d="M8 2.75a.75.75 0 0 1 .75.75v3.75h3.75a.75.75 0 0 1 0 1.5H8.75v3.75a.75.75 0 0 1-1.5 0V8.75H3.5a.75.75 0 0 1 0-1.5h3.75V3.5A.75.75 0 0 1 8 2.75Z" />
                </svg>
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
                onClick={() => setActiveTab(lastAppTab)}
              >
                <svg width="7" height="12" viewBox="0 0 11 18" fill="currentColor" aria-hidden="true">
                  <path d="M3.68293 8.63202L3.30966 8.99195L3.68293 9.35188L10.1643 15.6015C10.6051 16.0265 10.6028 16.7325 10.162 17.1712C9.70399 17.6104 8.96011 17.6096 8.5031 17.1689L0.83567 9.77564C0.388109 9.34408 0.388109 8.65592 0.83567 8.22436L8.5031 0.83107C8.96089 0.389643 9.70653 0.389643 10.1643 0.83107C10.6119 1.26263 10.6119 1.95079 10.1643 2.38235L3.68293 8.63202Z" />
                </svg>
                <span>Settings</span>
              </button>
            </header>
          )}
          <div className="preferences-content-column">
            {section === 'profile' && (
              <ProfileSection user={user} workspace={workspace} onUserChanged={onUserChanged} />
            )}

            {section === 'notifications' && (
              <NotificationsSection
                onOpenPriority={() => setSection('priority-notifications')}
                onOpenEmail={() => setSection('email-notifications')}
                onOpenTelegram={() => setSection('telegram-notifications')}
              />
            )}

            {section === 'priority-notifications' && (
              <PriorityNotificationsSection onBack={() => setSection('notifications')} />
            )}

            {section === 'email-notifications' && (
              <EmailNotificationsSection
                email={user.email}
                onBack={() => setSection('notifications')}
                onOpenPriority={() => setSection('priority-notifications')}
              />
            )}

            {section === 'telegram-notifications' && (
              <TelegramNotificationsSection
                onBack={() => setSection('notifications')}
                onOpenPriority={() => setSection('priority-notifications')}
                onOpenConnections={() => setSection('connected-accounts')}
              />
            )}

            {section === 'connected-accounts' && <ConnectedAccountsSection />}

            {section === 'security' && <SecuritySection user={user} onUserChanged={onUserChanged} />}

            {canAdminister && section === 'workspace' && (
              <WorkspaceSection workspace={workspace} onUserChanged={onUserChanged} />
            )}

            {canAdminister && section === 'teams' && <TeamsSection workspace={workspace} />}

            {canAdminister && section === 'new-team' && <NewTeamSection workspace={workspace} />}

            {canAdminister && section === 'team' && (
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
                        <svg width="9" height="5" viewBox="0 0 9 5" fill="currentColor">
                          <path d="M1.915.557a.667.667 0 0 0-.943.943l2.862 2.862a.942.942 0 0 0 1.333 0L8.028 1.5a.667.667 0 0 0-.943-.943L4.5 3.14 1.915.557Z" />
                        </svg>
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
                                <svg
                                  className="preferences-dropdown-check"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 16 16"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path d="M13.53 4.53a.75.75 0 0 0-1.06-1.06L6.5 9.44 3.53 6.47a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l6.5-6.5Z" />
                                </svg>
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
                  <LinearToggle
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
