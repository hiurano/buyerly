import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SidebarHeader } from './SidebarHeader';
import { useAppStore } from '@/store/useAppStore';
import {
  LinearInboxIcon,
  LinearLayersIcon,
  LinearBoltIcon,
  LinearBarChartIcon,
} from '@/icons/LinearIcons';
import { Tooltip } from '@/ui/Tooltip';

export const Sidebar: React.FC = () => {
  const {
    sidebarWidth,
    setSidebarWidth,
    activeTab,
    setActiveTab,
  } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);

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
      setSidebarWidth(e.clientX);
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
  }, [isDragging, setSidebarWidth, updateSpotlight]);

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="relative flex h-screen shrink-0 flex-col select-none bg-[#09090a]"
    >
      {/* 1. Header (Workspace + Search) */}
      <SidebarHeader />

      {/* 2. Navigation Section (Top padding 8px -> y: 60px) */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-[1px]">
        {/* Item 1: Inbox */}
        <Tooltip content="Inbox" shortcut="G I" side="right" sideOffset={8}>
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            data-active={activeTab === 'inbox' ? 'true' : 'false'}
            className="linear-sidebar-nav-item"
          >
            <div className="flex items-center min-w-0">
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  marginRight: '6px',
                }}
                className="flex shrink-0 items-center justify-center"
              >
                <LinearInboxIcon size={16} />
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  lineHeight: '16px',
                }}
                className="truncate"
              >
                Inbox
              </span>
            </div>
          </button>
        </Tooltip>

        {/* Item 2: Campaigns */}
        <Tooltip content="Go to campaigns" shortcut="G C" side="right" sideOffset={8}>
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
                  marginRight: '6px',
                }}
                className="flex shrink-0 items-center justify-center"
              >
                <LinearLayersIcon size={16} />
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  lineHeight: '16px',
                }}
                className="truncate"
              >
                Campaigns
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
                  marginRight: '6px',
                }}
                className="flex shrink-0 items-center justify-center"
              >
                <LinearBoltIcon size={16} />
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  lineHeight: '16px',
                }}
                className="truncate"
              >
                Rules
              </span>
            </div>
          </button>
        </Tooltip>

        {/* Item 4: Insights */}
        <Tooltip content="Go to insights" shortcut="G N" side="right" sideOffset={8}>
          <button
            type="button"
            onClick={() => setActiveTab('insights')}
            data-active={activeTab === 'insights' ? 'true' : 'false'}
            className="linear-sidebar-nav-item"
          >
            <div className="flex items-center min-w-0">
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  marginRight: '6px',
                }}
                className="flex shrink-0 items-center justify-center"
              >
                <LinearBarChartIcon size={16} />
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  lineHeight: '16px',
                }}
                className="truncate"
              >
                Insights
              </span>
            </div>
          </button>
        </Tooltip>
      </div>

      {/* 3. Linear Exact 3-Layer Spotlight Resizer */}
      <div
        className="linear-resizer-hit-target"
        data-dragging={isDragging ? 'true' : 'false'}
        onMouseMove={handleMouseMove}
        onMouseDown={startResizing}
      >
        <div ref={trackRef} className="linear-resizer-track" aria-hidden="true">
          <div ref={indicatorRef} className="linear-resizer-indicator" />
        </div>
      </div>
    </aside>
  );
};
