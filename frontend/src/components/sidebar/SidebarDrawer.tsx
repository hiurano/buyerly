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

/**
 * Linear's delays (its sidebar container's code): the window's 8px left edge
 * opens the peek after 250ms, leaving the window closes it after 500ms. The
 * header's sidebar button opens it at once.
 */
export const PEEK_HOVER_DELAY = 250;
export const PEEK_WINDOW_LEAVE_DELAY = 500;

/**
 * The desktop half of Linear's sidebar container: a collapsed sidebar can be
 * shown over the content without expanding its column. The header's sidebar
 * button, the window's left edge and ⌘\ open it; the cursor moving out to the
 * backdrop or the content, the cursor leaving the window, a press on the
 * backdrop and navigation close it. Dragging the resizer expands the column.
 */
export function useSidebarPeek(surfaceRef: React.RefObject<HTMLElement>, enabled: boolean, isDragging: boolean) {
  const peekOpen = useAppStore((state) => state.isSidebarPeekOpen);
  const setPeekOpen = useAppStore((state) => state.setSidebarPeekOpen);
  const isOpen = enabled && peekOpen;
  const openTimer = useRef<number>();
  const closeTimer = useRef<number>();

  const close = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setPeekOpen(false);
    const active = document.activeElement as HTMLElement | null;
    if (active && surfaceRef.current?.contains(active) && active.tagName !== 'INPUT') active.blur();
  }, [setPeekOpen, surfaceRef]);

  useEffect(() => {
    if (enabled) return;
    window.clearTimeout(openTimer.current);
    setPeekOpen(false);
  }, [enabled, setPeekOpen]);

  useEffect(() => () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);

  // Where the cursor was, so a sliding surface or backdrop that only changes
  // what is under a still cursor never counts as the cursor moving away.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const track = (event: MouseEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('mousemove', track, true);
    document.addEventListener('mouseover', track, true);
    return () => {
      document.removeEventListener('mousemove', track, true);
      document.removeEventListener('mouseover', track, true);
    };
  }, [enabled]);

  useEffect(() => {
    if (!isOpen) return;
    window.clearTimeout(openTimer.current);
    let previous = pointer.current;
    const onMouseMove = (event: MouseEvent) => {
      const last = previous;
      previous = { x: event.clientX, y: event.clientY };
      const moved = last !== null && (last.x !== event.clientX || last.y !== event.clientY);
      const surface = surfaceRef.current;
      if (!moved || !surface || isDragging) return;
      // The surface ends at its width once it has slid in; the resizer sticks out 3.5px.
      if (event.clientX <= surface.offsetWidth + 4) {
        // Visiting the sidebar turns a ⌘\ peek into a hover one, as in Linear.
        if (useAppStore.getState().sidebarPeekSource === 'keyboard') setPeekOpen(true, 'hover');
        return;
      }
      // Opened by ⌘\, only a press on the backdrop closes it until then.
      if (useAppStore.getState().sidebarPeekSource === 'keyboard') return;
      // Menus opened from the sidebar live in portals over the content.
      const target = event.target as Element | null;
      if (target?.closest?.('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"]')) return;
      close();
    };
    const onMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(close, PEEK_WINDOW_LEAVE_DELAY);
    };
    const onMouseOver = () => window.clearTimeout(closeTimer.current);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('mouseover', onMouseOver);
    return () => {
      window.clearTimeout(closeTimer.current);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('mouseover', onMouseOver);
    };
  }, [close, isDragging, isOpen, setPeekOpen, surfaceRef]);

  const edgeHandlers = {
    onMouseEnter: () => {
      window.clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(() => setPeekOpen(true), PEEK_HOVER_DELAY);
    },
    onMouseLeave: () => window.clearTimeout(openTimer.current),
  };

  return { isOpen, close, edgeHandlers };
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
