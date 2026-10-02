import React, { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useIsSmallScreen } from '@/lib/useMediaQuery';

/** Linear's swipe: 50px within 300ms, abandoned once the finger drifts 50px vertically. */
const SWIPE_DISTANCE = 50;
const SWIPE_TIME = 300;

/**
 * The small-screen half of Linear's sidebar container: below 880px the sidebar
 * is a drawer over the content. Navigation, a tap on the backdrop and a swipe
 * to the left close it; leaving the small width resets it to closed.
 */
export function useSidebarDrawer(surfaceRef: React.RefObject<HTMLElement>) {
  const isSmall = useIsSmallScreen();
  const isOpen = useAppStore((state) => state.isSidebarOpen);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);

  const close = useCallback(() => {
    setSidebarOpen(false);
    // A closed drawer keeps no focus, except a field the person is typing in.
    const active = document.activeElement as HTMLElement | null;
    if (active && surfaceRef.current?.contains(active) && active.tagName !== 'INPUT') active.blur();
  }, [setSidebarOpen, surfaceRef]);

  useEffect(() => {
    if (!isSmall) setSidebarOpen(false);
  }, [isSmall, setSidebarOpen]);

  const touchStart = useRef<{ x: number; y: number; startedAt: number } | null>(null);
  const swipeHandlers = {
    onTouchStart: (event: React.TouchEvent) => {
      if (event.touches.length !== 1) return;
      touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, startedAt: Date.now() };
    },
    onTouchMove: (event: React.TouchEvent) => {
      const start = touchStart.current;
      if (!start || event.touches.length > 1) return;
      const dx = start.x - event.touches[0].clientX;
      const dy = start.y - event.touches[0].clientY;
      if (Math.abs(dy) > SWIPE_DISTANCE || Date.now() - start.startedAt > SWIPE_TIME) {
        touchStart.current = null;
        return;
      }
      if (Math.abs(dx) > SWIPE_DISTANCE) {
        touchStart.current = null;
        if (dx > 0 && isOpen) close();
      }
    },
    onTouchEnd: () => {
      touchStart.current = null;
    },
  };

  return { isSmall, isOpen: isSmall && isOpen, close, swipeHandlers: isSmall ? swipeHandlers : {} };
}

export const SidebarBackdrop: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <div
    className="sidebar-backdrop"
    data-open={open ? 'true' : 'false'}
    aria-hidden="true"
    onMouseDown={onClose}
    // An onClick also makes iOS Safari deliver the tap's mouse events to this plain div.
    onClick={onClose}
  />
);
