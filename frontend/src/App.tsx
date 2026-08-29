import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { InsightsView } from '@/components/insights/InsightsView';
import { SelectionDock } from '@/components/selection/SelectionDock';
import { CommandMenu } from '@/components/command/CommandMenu';
import { TooltipProvider } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

export const App: React.FC = () => {
  const { activeTab, setActiveTab, toggleRightSidebar } = useAppStore();
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

      // Toggle Right Sidebar on Ctrl+I or Alt+I or Cmd+I
      if ((e.ctrlKey || e.altKey || e.metaKey) && (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш')) {
        e.preventDefault();
        toggleRightSidebar();
        return;
      }

      // Sequence Navigation Shortcuts: G then I / C / R / N
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
          } else if (key === 'n' || key === 'т') {
            e.preventDefault();
            setActiveTab('insights');
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
  }, [gPressed, setActiveTab, toggleRightSidebar]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#09090a] text-[#e2e3e5]">
        {/* 1. Left Sidebar with Inbox, Campaigns, Rules & Insights Nav */}
        <Sidebar />

        {/* 2. Linear Floating Inset Canvas */}
        <main className="linear-floating-canvas">
          {activeTab === 'inbox' && <InboxView />}
          {activeTab === 'campaigns' && <CampaignsView />}
          {activeTab === 'rules' && <RulesView />}
          {activeTab === 'insights' && <InsightsView />}
        </main>

        {/* 3. Floating Bottom Selection Dock */}
        <SelectionDock />

        {/* 4. Command Menu */}
        <CommandMenu />
      </div>
    </TooltipProvider>
  );
};
