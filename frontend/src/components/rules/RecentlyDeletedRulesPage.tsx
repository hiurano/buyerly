import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { RecentlyDeletedView } from './RecentlyDeletedView';

interface RecentlyDeletedRulesPageProps {
  /** The address of the rules list, for the "Rules" crumb. */
  rulesPath: string;
  onOpenRules: () => void;
}

/**
 * Rules' Recently deleted, on its own address (/rules/recently-deleted), the
 * way Linear keeps deleted issues in the team archive rather than in a tab of
 * the list. Reached from Ctrl/Cmd+K, the "Deleted" toast and the toast for a
 * rule an address no longer finds.
 */
export const RecentlyDeletedRulesPage: React.FC<RecentlyDeletedRulesPageProps> = ({ rulesPath, onOpenRules }) => {
  const [count, setCount] = useState<number | null>(null);
  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col w-full bg-transparent">
        {/* Linear's archive title bar: 44px, the title with its count beside it. */}
        <div
          style={{
            height: '44px',
            borderBottom: 'var(--canvas-border)',
            boxSizing: 'border-box',
            paddingLeft: '18px',
            paddingRight: '11px',
          }}
          className="flex items-center"
        >
          <SidebarCollapsedNavigation />
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
            <a
              href={rulesPath}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenRules();
              }}
              className="rounded-[4px] text-[13px] font-medium text-[var(--text-tertiary)] outline-none transition-colors hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
            >
              Rules
            </a>
            <ChevronRight size={14} aria-hidden="true" className="mx-[4px] shrink-0 text-[var(--text-tertiary)]" />
            <h2
              aria-current="page"
              className="m-0 truncate p-0 text-[13px] font-medium text-[var(--text-primary)]"
            >
              Recently deleted
            </h2>
            {count !== null && count > 0 && (
              <span className="ml-[6px] text-[13px] font-medium tabular-nums text-[var(--text-tertiary)]">
                {count}
              </span>
            )}
          </nav>
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">
        <RecentlyDeletedView onCountChange={setCount} />
      </div>
    </div>
  );
};
