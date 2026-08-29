import React from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { InboxView } from '@/components/inbox/InboxView';
import { CampaignsView } from '@/components/campaigns/CampaignsView';
import { RulesView } from '@/components/rules/RulesView';
import { SelectionDock } from '@/components/selection/SelectionDock';
import { CommandMenu } from '@/components/command/CommandMenu';
import { TooltipProvider } from '@/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';

export const App: React.FC = () => {
  const { activeTab, toggleRightSidebar } = useAppStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Right Sidebar on Ctrl+I or Alt+I or Cmd+I
      if ((e.ctrlKey || e.altKey || e.metaKey) && (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш')) {
        e.preventDefault();
        toggleRightSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleRightSidebar]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#09090a] text-[#e2e3e5]">
        {/* 1. Left Sidebar with Inbox, Campaigns & Rules Nav */}
        <Sidebar />

        {/* 2. Linear Floating Inset Canvas */}
        <main className="linear-floating-canvas">
          {activeTab === 'inbox' && <InboxView />}
          {activeTab === 'campaigns' && <CampaignsView />}
          {activeTab === 'rules' && <RulesView />}
        </main>

        {/* 3. Floating Bottom Selection Dock */}
        <SelectionDock />

        {/* 4. Command Menu */}
        <CommandMenu />
      </div>
    </TooltipProvider>
  );
};
