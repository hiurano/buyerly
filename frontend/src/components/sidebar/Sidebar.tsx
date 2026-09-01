import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SidebarHeader } from './SidebarHeader';
import { useAppStore } from '@/store/useAppStore';
import {
  LinearInboxIcon,
  LinearMetaIcon,
  LinearBoltIcon,
  LinearChartIcon,
} from '@/icons/LinearIcons';
import { Tooltip } from '@/ui/Tooltip';
import { SidebarUtilityFooter } from '@/components/layout/AppUtilityBar';

export const Sidebar: React.FC = () => {
  const {
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    setSidebarCollapsed,
    resetSidebarWidth,
    activeTab,
    setActiveTab,
    notifications,
  } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Dynamic Spotlight Y tracking math from Linear
  const updateSpotlight = useCallback((clientY: number) => {
    if (!trackRef.current || !indicatorRef.current) return;
    const bounds = trackRef.current.getBoundingClientRect();
    const length = bounds.height;
    const clampedY = Math.min(Math.max(clientY - bounds.top, 0), length);
    const translateY = clampedY - length / 2;
    indicatorRef.current.style.transform = `translate3d(0px, ${translateY}px, 0px)`;
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    updateSpotlight(e.clientY);
  };

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      updateSpotlight(e.clientY);
    },
    [updateSpotlight]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      // Snap-to-collapse when dragged below 150px
      if (e.clientX < 150) {
        setSidebarCollapsed(true);
      } else {
        if (isSidebarCollapsed) {
          setSidebarCollapsed(false);
        }
        setSidebarWidth(e.clientX);
      }
      updateSpotlight(e.clientY);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, isSidebarCollapsed, setSidebarCollapsed, setSidebarWidth, updateSpotlight]);

  return (
    <div
      className="sidebar-slot-wrapper"
      data-resizing={isDragging ? 'true' : 'false'}
      style={{
        width: isSidebarCollapsed ? '8px' : `${sidebarWidth}px`,
        transition: isDragging ? 'none' : undefined,
      }}
    >
      <aside
        data-sidebar-surface="true"
        data-resizing={isDragging ? 'true' : 'false'}
        style={{
          width: `${sidebarWidth}px`,
          transform: isSidebarCollapsed
            ? `translateX(-${sidebarWidth + 16}px)`
            : 'translateX(0px)',
          transition: isDragging ? 'none' : undefined,
        }}
        className="sidebar-surface app-sidebar"
      >
        {/* 1. Header (Workspace + Search + Create) */}
        <SidebarHeader />

        {/* 2. Navigation Section */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-[1px]">
          {/* Item 1: Inbox */}
          <Tooltip content="Inbox" shortcut="G I" side="right" sideOffset={8}>
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              data-active={activeTab === 'inbox' ? 'true' : 'false'}
              className="linear-sidebar-nav-item group"
            >
              <div className="flex items-center min-w-0">
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    marginRight: '8px',
                  }}
                  className="flex shrink-0 items-center justify-center"
                >
                  <LinearInboxIcon size={14} />
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '-0.1px',
                  }}
                  className="truncate"
                >
                  Inbox
                </span>
              </div>

              {/* Exact Linear Unread Badge */}
              {unreadCount > 0 && (
                <span className="linear-sidebar-badge">
                  {unreadCount}
                </span>
              )}
            </button>
          </Tooltip>

          {/* Item 2: Ads Manager */}
          <Tooltip content="Go to Ads Manager" shortcut="G A" side="right" sideOffset={8}>
            <button
              type="button"
              onClick={() => setActiveTab('campaigns')}
              data-active={activeTab === 'campaigns' ? 'true' : 'false'}
              className="linear-sidebar-nav-item"
            >
              <div className="flex items-center min-w-0">
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    marginRight: '8px',
                  }}
                  className="flex shrink-0 items-center justify-center"
                >
                  <LinearMetaIcon size={14} />
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '-0.1px',
                  }}
                  className="truncate"
                >
                  Ads Manager
                </span>
              </div>
            </button>
          </Tooltip>

          {/* Item 3: Rules */}
          <Tooltip content="Go to rules" shortcut="G R" side="right" sideOffset={8}>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              data-active={activeTab === 'rules' ? 'true' : 'false'}
              className="linear-sidebar-nav-item"
            >
              <div className="flex items-center min-w-0">
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    marginRight: '8px',
                  }}
                  className="flex shrink-0 items-center justify-center"
                >
                  <LinearBoltIcon size={14} />
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '-0.1px',
                  }}
                  className="truncate"
                >
                  Rules
                </span>
              </div>
            </button>
          </Tooltip>

          {/* Item 4: Statistics */}
          <Tooltip content="Go to statistics" shortcut="G S" side="right" sideOffset={8}>
            <button
              type="button"
              onClick={() => setActiveTab('statistics')}
              data-active={activeTab === 'statistics' ? 'true' : 'false'}
              className="linear-sidebar-nav-item"
            >
              <div className="flex items-center min-w-0">
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    marginRight: '8px',
                  }}
                  className="flex shrink-0 items-center justify-center"
                >
                  <LinearChartIcon size={14} />
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '-0.1px',
                  }}
                  className="truncate"
                >
                  Statistics
                </span>
              </div>
            </button>
          </Tooltip>
        </div>

        <SidebarUtilityFooter />

        {/* 3. Linear Exact 3-Layer Spotlight Resizer with Double-Click Reset */}
        <div
          className="linear-resizer-hit-target"
          data-dragging={isDragging ? 'true' : 'false'}
          onMouseMove={handleMouseMove}
          onMouseDown={startResizing}
          onDoubleClick={resetSidebarWidth}
          title="Drag to resize, double-click to reset"
        >
          <div ref={trackRef} className="linear-resizer-track" aria-hidden="true">
            <div ref={indicatorRef} className="linear-resizer-indicator" />
          </div>
        </div>
      </aside>
    </div>
  );
};
