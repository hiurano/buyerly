import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppStore, type InterfaceTheme } from '@/store/useAppStore';
import { SETTINGS_PAGE_KEYWORDS } from '@/lib/settingsPages';
import { SidebarUtilityFooter } from '@/components/layout/AppUtilityBar';
import type { SessionUser, Workspace } from '@/lib/types';
import { ProfileSection } from './ProfileSection';
import { MembersSection } from './MembersSection';
import {
  EmailNotificationsSection,
  NotificationsSection,
  PriorityNotificationsSection,
  TelegramNotificationsSection,
} from './NotificationsSection';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { SecuritySection } from './SecuritySection';
import { LinearConnectedIcon, LinearUserLockIcon } from '@/icons/LinearIcons';
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
  const visibleSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (Object.keys(sectionKeywords) as Array<keyof typeof sectionKeywords>).filter((key) =>
      sectionKeywords[key].includes(query)
    );
  }, [searchQuery]);

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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  role="img"
                  focusable="false"
                  aria-hidden="true"
                  className="preferences-nav-icon"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M7 2.5C8.11933 2.5 9.06613 3.23584 9.38477 4.25H14.75C15.1642 4.25 15.5 4.58579 15.5 5C15.5 5.41421 15.1642 5.75 14.75 5.75H9.38477C9.06613 6.76416 8.11933 7.5 7 7.5C5.88067 7.5 4.93387 6.76416 4.61523 5.75H2.25C1.83579 5.75 1.5 5.41421 1.5 5C1.5 4.58579 1.83579 4.25 2.25 4.25H4.61523C4.93387 3.23584 5.88067 2.5 7 2.5ZM7 4C6.44772 4 6 4.44772 6 5C6 5.55228 6.44772 6 7 6C7.55228 6 8 5.55228 8 5C8 4.44772 7.55228 4 7 4Z"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10 13.5C8.88067 13.5 7.93387 12.7642 7.61523 11.75H2.25C1.83579 11.75 1.5 11.4142 1.5 11C1.5 10.5858 1.83579 10.25 2.25 10.25H7.61523C7.93387 9.23584 8.88067 8.5 10 8.5C11.1193 8.5 12.0661 9.23584 12.3848 10.25H14.75C15.1642 10.25 15.5 10.5858 15.5 11C15.5 11.4142 15.1642 11.75 14.75 11.75H12.3848C12.0661 12.7642 11.1193 13.5 10 13.5ZM10 12C10.5523 12 11 11.5523 11 11C11 10.4477 10.5523 10 10 10C9.44772 10 9 10.4477 9 11C9 11.5523 9.44772 12 10 12Z"
                  />
                </svg>
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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  role="img"
                  focusable="false"
                  aria-hidden="true"
                  className="preferences-nav-icon"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M8 2C6.20507 2 4.75 3.45507 4.75 5.25C4.75 7.04493 6.20507 8.5 8 8.5C9.79493 8.5 11.25 7.04493 11.25 5.25C11.25 3.45507 9.79493 2 8 2ZM6.25 5.25C6.25 4.2835 7.0335 3.5 8 3.5C8.9665 3.5 9.75 4.2835 9.75 5.25C9.75 6.2165 8.9665 7 8 7C7.0335 7 6.25 6.2165 6.25 5.25Z"
                  />
                  <path d="M8 9.75C5.21979 9.75 2.9082 11.4568 2.28577 13.7568C2.17759 14.1566 2.41345 14.5683 2.81323 14.6764C3.21301 14.7846 3.62468 14.5487 3.73286 14.149C4.16576 12.4632 5.90104 11.25 8 11.25C10.099 11.25 11.8342 12.4632 12.2671 14.149C12.3753 14.5487 12.787 14.7846 13.1868 14.6764C13.5865 14.5683 13.8224 14.1566 13.7142 13.7568C13.0918 11.4568 10.7802 9.75 8 9.75Z" />
                </svg>
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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  role="img"
                  focusable="false"
                  aria-hidden="true"
                  className="preferences-nav-icon"
                >
                  <path d="M8.5 2.75H5A2.25 2.25 0 0 0 2.75 5v6A2.25 2.25 0 0 0 5 13.25h6A2.25 2.25 0 0 0 13.25 11V7.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="12.25" cy="3.75" r="2" />
                </svg>
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
                <LinearUserLockIcon size={16} className="preferences-nav-icon" />
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
                <LinearConnectedIcon size={16} className="preferences-nav-icon" />
                <span className="preferences-nav-label">Connected accounts</span>
              </a>
            )}
          </div>

          <div className="preferences-nav-group">
            <h2 className="preferences-nav-heading">Workspace</h2>
            {visibleSections.includes('members') && (
              <a
                href="#members"
                className={`preferences-nav-item ${section === 'members' ? 'active' : ''}`}
                data-active={section === 'members'}
                onClick={(e) => {
                  e.preventDefault();
                  setSection('members');
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  role="img"
                  focusable="false"
                  aria-hidden="true"
                  className="preferences-nav-icon"
                >
                  <path d="M6 7.5C7.51878 7.5 8.75 6.26878 8.75 4.75C8.75 3.23122 7.51878 2 6 2C4.48122 2 3.25 3.23122 3.25 4.75C3.25 6.26878 4.48122 7.5 6 7.5ZM6 6C5.30964 6 4.75 5.44036 4.75 4.75C4.75 4.05964 5.30964 3.5 6 3.5C6.69036 3.5 7.25 4.05964 7.25 4.75C7.25 5.44036 6.69036 6 6 6Z" />
                  <path d="M1.5 13.25C1.5 11.1789 3.17893 9.5 5.25 9.5H6.75C8.82107 9.5 10.5 11.1789 10.5 13.25C10.5 13.6642 10.1642 14 9.75 14C9.33579 14 9 13.6642 9 13.25C9 12.0074 7.99264 11 6.75 11H5.25C4.00736 11 3 12.0074 3 13.25C3 13.6642 2.66421 14 2.25 14C1.83579 14 1.5 13.6642 1.5 13.25Z" />
                  <path d="M10.75 7.5C11.9926 7.5 13 6.49264 13 5.25C13 4.00736 11.9926 3 10.75 3C10.3358 3 10 3.33579 10 3.75C10 4.16421 10.3358 4.5 10.75 4.5C11.1642 4.5 11.5 4.83579 11.5 5.25C11.5 5.66421 11.1642 6 10.75 6C10.3358 6 10 6.33579 10 6.75C10 7.16421 10.3358 7.5 10.75 7.5Z" />
                  <path d="M11.5 9.75C11.5 9.33579 11.8358 9 12.25 9C13.7688 9 15 10.2312 15 11.75V13.25C15 13.6642 14.6642 14 14.25 14C13.8358 14 13.5 13.6642 13.5 13.25V11.75C13.5 11.0596 12.9404 10.5 12.25 10.5C11.8358 10.5 11.5 10.1642 11.5 9.75Z" />
                </svg>
                <span className="preferences-nav-label">Members</span>
              </a>
            )}
          </div>

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
              <ProfileSection user={user} onUserChanged={onUserChanged} />
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

            {section === 'security' && <SecuritySection />}

            {section === 'members' && <MembersSection workspace={workspace} />}

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
