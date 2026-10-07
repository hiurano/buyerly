import React, { useLayoutEffect, useRef, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

export interface LinearTabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

interface LinearTabsProps {
  tabs: LinearTabItem[];
  activeTabId: string;
  onChange: (id: string) => void;
  className?: string;
  'aria-label'?: string;
  /**
   * A view's tabs, as in Linear's header: when they no longer fit their strip,
   * they all fold into one capsule with the active view's label and a chevron,
   * named "N more", that opens a menu of the views.
   */
  collapseOverflow?: boolean;
}

const TabCount: React.FC<{ count?: number; active: boolean }> = ({ count, active }) =>
  typeof count === 'number' ? (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 500,
        marginLeft: '4px',
        opacity: active ? 1 : 0.65,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {count}
    </span>
  ) : null;

export const LinearTabs: React.FC<LinearTabsProps> = ({
  tabs,
  activeTabId,
  onChange,
  className = '',
  'aria-label': ariaLabel = 'Views',
  collapseOverflow = false,
}) => {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const frameRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // The tab strip keeps its natural width while folded, so it is measured the same way either way.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const list = listRef.current;
    if (!collapseOverflow || !frame || !list) return;
    const measure = () => setCollapsed(list.offsetWidth > frame.clientWidth - 4 + 0.5);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(list);
    return () => observer.disconnect();
  }, [collapseOverflow]);

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab && !nextTab.disabled) {
      onChange(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    }
  };

  const folded = collapseOverflow && collapsed;
  const list = (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-hidden={folded ? true : undefined}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: '28px',
        gap: '6px',
        padding: '0px',
        margin: '0px',
        userSelect: 'none',
        ...(collapseOverflow ? { width: 'max-content', flexShrink: 0 } : null),
        ...(folded ? { position: 'absolute' as const, left: 0, visibility: 'hidden' as const } : null),
      }}
      className={`${folded ? '' : 'relative '}select-none ${className}`}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-active={isActive ? 'true' : 'false'}
            type="button"
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className="linear-tab-capsule"
          >
            <span className="block truncate whitespace-nowrap">{tab.label}</span>
            <TabCount count={tab.count} active={isActive} />
          </button>
        );
      })}
    </div>
  );

  if (!collapseOverflow) return list;

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  return (
    // Full toolbar height and 2px either side, so the capsules' ring and shadow are not clipped.
    <div ref={frameRef} className="relative -mx-0.5 flex min-w-0 flex-1 items-center self-stretch overflow-hidden px-0.5">
      {list}
      {collapsed && activeTab && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-active="true"
              aria-label={`${tabs.length - 1} more`}
              className="linear-tab-capsule shrink-0"
            >
              <span className="block truncate whitespace-nowrap">{activeTab.label}</span>
              <TabCount count={activeTab.count} active />
              <svg width="8" height="8" viewBox="0 0 12 8" fill="currentColor" aria-hidden="true" style={{ marginLeft: '6px', flexShrink: 0 }}>
                <path d="M10.16.31 6 4.48 1.83.31A1.07 1.07 0 0 0 .31 1.83l4.93 4.93c.42.42 1.1.42 1.52 0l4.93-4.93A1.07 1.07 0 0 0 10.16.31Z" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={ariaLabel}>
            {tabs.map((tab) => (
              <DropdownMenuItem key={tab.id} disabled={tab.disabled} onSelect={() => onChange(tab.id)}>
                <span className={tab.id === activeTabId ? 'text-[var(--text-primary)]' : undefined}>{tab.label}</span>
                {typeof tab.count === 'number' && <span className="tabular-nums text-[var(--text-tertiary)]">{tab.count}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
