import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { StatisticsView } from '@/components/statistics/StatisticsView';
import { SelectionDock } from '@/components/selection/SelectionDock';
import { CommandMenu } from '@/components/command/CommandMenu';
import { PreferencesView } from '@/components/preferences/PreferencesView';
import { AppUtilityBar } from '@/components/layout/AppUtilityBar';
import { TooltipProvider } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    toggleRightSidebar,
    toggleSidebarCollapsed,
    interfaceTheme,
  } = useAppStore();
  const [gPressed, setGPressed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Toggle Left Sidebar on [ (or Russian 'х' / 'Х')
      if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === '[' || e.key === 'х' || e.key === 'Х')) {
        e.preventDefault();
        toggleSidebarCollapsed();
        return;
      }

      // Toggle Right Sidebar on Ctrl+I or Alt+I or Cmd+I
      if ((e.ctrlKey || e.altKey || e.metaKey) && (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш')) {
        e.preventDefault();
        toggleRightSidebar();
        return;
      }

      // Sequence Navigation Shortcuts: G then I / C / R / S
      const key = e.key.toLowerCase();
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        if (key === 'g' || key === 'п') {
          setGPressed(true);
          clearTimeout(timer);
          timer = setTimeout(() => setGPressed(false), 1500);
          return;
        }

        if (gPressed) {
          if (key === 'i' || key === 'ш') {
            e.preventDefault();
            setActiveTab('inbox');
            setGPressed(false);
          } else if (key === 'c' || key === 'с') {
            e.preventDefault();
            setActiveTab('campaigns');
            setGPressed(false);
          } else if (key === 'r' || key === 'к') {
            e.preventDefault();
            setActiveTab('rules');
            setGPressed(false);
          } else if (key === 's' || key === 'ы') {
            e.preventDefault();
            setActiveTab('statistics');
            setGPressed(false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [gPressed, setActiveTab, toggleRightSidebar, toggleSidebarCollapsed]);

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolvedTheme =
        interfaceTheme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : interfaceTheme;

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
      window.localStorage.setItem('buyerly-interface-theme', interfaceTheme);
    };

    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [interfaceTheme]);

  return (
    <TooltipProvider>
      <div className="app-shell flex h-screen w-screen overflow-hidden">
        {activeTab === 'preferences' ? (
          <PreferencesView />
        ) : (
          <>
            {/* 1. Left Sidebar with Inbox, Campaigns, Rules & Statistics Nav */}
            <Sidebar />

            {/* 2. Linear Floating Inset Canvas */}
            <main className="linear-floating-canvas">
              {activeTab === 'inbox' && <InboxView />}
              {activeTab === 'campaigns' && <CampaignsView />}
              {activeTab === 'rules' && <RulesView />}
              {activeTab === 'statistics' && <StatisticsView />}
            </main>

            {/* 3. Floating Bottom Selection Dock */}
            <SelectionDock />

            {/* 4. Command Menu */}
            <CommandMenu />
          </>
        )}
        <AppUtilityBar />
      </div>
    </TooltipProvider>
  );
};
