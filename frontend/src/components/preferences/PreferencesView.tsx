import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppStore, type InterfaceTheme } from '@/store/useAppStore';
import { SidebarUtilityFooter } from '@/components/layout/AppUtilityBar';

const themeOptions: Array<{
  value: InterfaceTheme;
  label: string;
}> = [
  { value: 'system', label: 'System preference' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const PreferencesView: React.FC = () => {
  const { interfaceTheme, setInterfaceTheme, lastAppTab, setActiveTab } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedTheme = themeOptions.find((option) => option.value === interfaceTheme) || themeOptions[0];
  const preferencesVisible = useMemo(
    () => 'preferences interface theme appearance'.includes(searchQuery.trim().toLowerCase()),
    [searchQuery]
  );

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
      <aside className="preferences-sidebar" aria-label="Settings navigation">
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
            {preferencesVisible ? (
              <a
                href="#preferences"
                className="preferences-nav-item active"
                data-active="true"
                onClick={(e) => e.preventDefault()}
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
            ) : (
              <div className="preferences-no-results">No settings found</div>
            )}
          </div>
        </nav>
        <SidebarUtilityFooter />
      </aside>

      {/* 2. Main Scrollable Canvas */}
      <main className="preferences-main-canvas">
        <div className="preferences-scroll-container">
          <div className="preferences-content-column">
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
                <div className="preferences-row-item">
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
          </div>
        </div>
      </main>
    </div>
  );
};
