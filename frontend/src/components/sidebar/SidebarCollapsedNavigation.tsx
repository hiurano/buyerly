import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { PEEK_HOVER_DELAY } from './SidebarDrawer';
import { useIsSmallScreen } from '@/lib/useMediaQuery';
import { LinearSidebarLeftToggleIcon } from '@/icons/LinearIcons';
import { Tooltip } from '@/ui/Tooltip';

/**
 * Linear's SidebarCollapsedNavigation: the sidebar button at the start of a
 * view header. It shows while the sidebar is collapsed and, below 880px,
 * always: there it is "Menu" and opens or closes the sidebar drawer.
 */
export const SidebarCollapsedNavigation: React.FC = () => {
  const isSidebarCollapsed = useAppStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((state) => state.toggleSidebarCollapsed);
  const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
  const toggleSidebarOpen = useAppStore((state) => state.toggleSidebarOpen);
  const setSidebarPeekOpen = useAppStore((state) => state.setSidebarPeekOpen);
  const isSmall = useIsSmallScreen();
  const visible = isSmall || isSidebarCollapsed;

  // A hidden button also cancels the header's own gap, as Linear's does.
  const ref = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const [parentGap, setParentGap] = useState(0);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (parent) setParentGap(parseFloat(getComputedStyle(parent).columnGap) || 0);
  }, []);

  const button = isSmall ? (
    <button
      type="button"
      onClick={toggleSidebarOpen}
      className="linear-icon-btn"
      aria-label="Menu"
      aria-expanded={isSidebarOpen}
    >
      <LinearSidebarLeftToggleIcon size={14} isOpen={isSidebarOpen} aria-hidden="true" />
    </button>
  ) : (
    <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
      <button
        type="button"
        onClick={() => {
          window.clearTimeout(peekTimer.current);
          toggleSidebarCollapsed();
        }}
        // Resting on it shows the collapsed sidebar over the content (Linear's
        // peek). The short wait leaves a direct click free to expand the column,
        // which the sliding sidebar would otherwise cover.
        onMouseEnter={() => {
          // Settings has its own sidebar, which never collapses.
          if (!isSidebarCollapsed || useAppStore.getState().activeTab === 'preferences') return;
          window.clearTimeout(peekTimer.current);
          peekTimer.current = window.setTimeout(() => setSidebarPeekOpen(true), PEEK_HOVER_DELAY);
        }}
        onMouseLeave={() => window.clearTimeout(peekTimer.current)}
        className="linear-icon-btn"
        aria-label="Open sidebar"
        tabIndex={visible ? undefined : -1}
      >
        <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
      </button>
    </Tooltip>
  );

  return (
    <div
      ref={ref}
      aria-hidden={visible ? undefined : true}
      style={{
        width: visible ? '28px' : '0px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.85)',
        marginRight: visible ? (parentGap > 0 ? '0px' : '6px') : `${-parentGap}px`,
        pointerEvents: visible ? 'auto' : 'none',
        overflow: 'hidden',
        transition:
          'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className="flex shrink-0 items-center justify-center"
    >
      {button}
    </div>
  );
};
