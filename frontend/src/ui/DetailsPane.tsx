import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useMediaQuery, useIsTouchScreen } from '@/lib/useMediaQuery';
import { Tooltip } from '@/ui/Tooltip';
import { LinearSidebarToggleIcon } from '@/icons/LinearIcons';
import {
  DETAILS_PANE_OVERLAY_QUERY,
  DETAILS_PANE_PHONE_QUERY,
  clampDetailsPaneWidth,
  detailsPaneWidth,
  isSwipeRight,
  stepSpring,
  type DetailsPaneId,
  type SpringValue,
} from './detailsPaneModel';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Drives one CSS length with Linear's pane spring. `immediate` jumps to the
 * target; `onRest` runs once it settles there.
 */
function useSpringValue(
  target: number,
  immediate: boolean,
  apply: (value: number) => void,
  onRest?: (value: number) => void,
) {
  const value = useRef<SpringValue>({ position: target, velocity: 0 });
  const frame = useRef(0);
  const applyRef = useRef(apply);
  const restRef = useRef(onRest);
  applyRef.current = apply;
  restRef.current = onRest;

  useLayoutEffect(() => {
    cancelAnimationFrame(frame.current);
    if (immediate) {
      value.current = { position: target, velocity: 0 };
      applyRef.current(target);
      restRef.current?.(target);
      return undefined;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const next = stepSpring(value.current, target, now - last);
      last = now;
      value.current = next;
      applyRef.current(next.position);
      if (next.done) restRef.current?.(target);
      else frame.current = requestAnimationFrame(tick);
    };
    applyRef.current(value.current.position);
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, immediate]);

  return value;
}

/** Keeps the pane's last content while it slides away, as Linear's does. */
const Frozen = React.memo(
  ({ children }: { open: boolean; children: React.ReactNode }) => <>{children}</>,
  (_previous, next) => !next.open,
);

interface ResizeHandleProps {
  width: number;
  windowWidth: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onResizingChange: (resizing: boolean) => void;
  onClick: () => void;
}

/**
 * Linear's resizer on the pane's left edge: a 7px strip whose hairline fades
 * in on hover, brighter where the pointer is. Dragging resizes; a click
 * without a drag closes the pane. Its tooltip says so after a moment.
 */
function DetailsPaneResizeHandle({ width, windowWidth, onResize, onResizeEnd, onResizingChange, onClick }: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [tooltipTop, setTooltipTop] = useState<number | null>(null);
  const tooltipTimer = useRef<number | undefined>(undefined);
  const pointerY = useRef(0);

  const placeIndicator = (clientY: number) => {
    pointerY.current = clientY;
    const handle = handleRef.current;
    const indicator = indicatorRef.current;
    if (!handle || !indicator) return;
    indicator.style.transform = `translateY(${clientY - handle.getBoundingClientRect().top}px)`;
  };

  useEffect(() => () => window.clearTimeout(tooltipTimer.current), []);

  const start = (startX: number, kind: 'mouse' | 'touch', touchId?: number) => {
    const startWidth = width;
    let moved = false;
    let latest = startWidth;
    setTooltipTop(null);
    window.clearTimeout(tooltipTimer.current);
    const move = (clientX: number) => {
      if (!moved) {
        moved = true;
        setDragging(true);
        onResizingChange(true);
        document.body.classList.add('details-pane-resizing');
      }
      latest = clampDetailsPaneWidth(startWidth + (startX - clientX), windowWidth);
      onResize(latest);
    };
    const finish = () => {
      document.body.classList.remove('details-pane-resizing');
      if (moved) {
        setDragging(false);
        onResizingChange(false);
        onResizeEnd(latest);
      } else {
        onClick();
      }
    };
    if (kind === 'mouse') {
      const onMove = (event: MouseEvent) => {
        placeIndicator(event.clientY);
        move(event.clientX);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        finish();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }
    const touchOf = (event: TouchEvent) => Array.from(event.changedTouches).find((touch) => touch.identifier === touchId);
    const onMove = (event: TouchEvent) => {
      const touch = touchOf(event);
      if (touch) move(touch.clientX);
    };
    const onEnd = (event: TouchEvent) => {
      if (!touchOf(event)) return;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      finish();
    };
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  };

  return (
    <div
      ref={handleRef}
      className="details-pane-resizer"
      data-dragging={dragging ? 'true' : undefined}
      aria-hidden="true"
      onMouseEnter={(event) => {
        placeIndicator(event.clientY);
        window.clearTimeout(tooltipTimer.current);
        tooltipTimer.current = window.setTimeout(() => {
          const handle = handleRef.current;
          if (handle) setTooltipTop(pointerY.current - handle.getBoundingClientRect().top);
        }, 450);
      }}
      onMouseMove={(event) => placeIndicator(event.clientY)}
      onMouseLeave={() => {
        window.clearTimeout(tooltipTimer.current);
        setTooltipTop(null);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start(event.clientX, 'mouse');
      }}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        if (touch && event.touches.length === 1) start(touch.clientX, 'touch', touch.identifier);
      }}
    >
      <div className="details-pane-resizer-track">
        <div ref={indicatorRef} className="details-pane-resizer-indicator" />
      </div>
      {tooltipTop !== null && !dragging && (
        <div
          className="details-pane-resizer-tooltip"
          style={{ top: Math.min(Math.max(tooltipTop, 36), window.innerHeight - 36) }}
        >
          <span><strong>Drag</strong> to resize</span>
          <span><strong>Click</strong> to collapse</span>
        </div>
      )}
    </div>
  );
}

interface DetailsPaneLayoutProps {
  pane: DetailsPaneId;
  /** The pane's accessible name. */
  label: string;
  /** What the pane shows; null keeps it closed, e.g. while the view loads. */
  details: React.ReactNode | null;
  children: React.ReactNode;
}

/**
 * A view's content with its details pane on the right — one component for
 * every view, so Ads Manager and Rules behave the same (#367). Measured in
 * Linear (2026-10-09):
 * - wider than 1024px the pane is a column that takes its width from the list,
 *   350px until dragged (360–600px, and never so wide the list drops under
 *   300px); a click on its edge closes it;
 * - at 1024px and below it lies over the list, 350px wide (the window when
 *   narrower), and cannot be resized; on a touch phone a backdrop dims the
 *   list and closes it, and a swipe to the right closes it too;
 * - opening and closing slide it in from the right on a spring (tension
 *   1000, friction 40, mass 0.1, about 170ms, no overshoot) while the list
 *   gives up or takes back its room; reduced motion skips the slide.
 * Whether it is open, and its width, are kept per view on this device.
 */
export function DetailsPaneLayout({ pane, label, details, children }: DetailsPaneLayoutProps) {
  const state = useAppStore((store) => store.detailsPanes[pane]);
  const toggleDetailsPane = useAppStore((store) => store.toggleDetailsPane);
  const setDetailsPaneWidth = useAppStore((store) => store.setDetailsPaneWidth);
  const overlay = useMediaQuery(DETAILS_PANE_OVERLAY_QUERY);
  const phone = useMediaQuery(DETAILS_PANE_PHONE_QUERY);
  const touch = useIsTouchScreen();
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const windowWidth = useWindowWidth();
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number; at: number } | null>(null);

  const open = state.open && details !== null;
  const openRef = useRef(open);
  openRef.current = open;
  const width = detailsPaneWidth(liveWidth ?? state.width, windowWidth, overlay);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const close = useCallback(() => toggleDetailsPane(pane, false), [pane, toggleDetailsPane]);

  // A phone opens on its list: a pane left open on a wider window starts closed there.
  useEffect(() => {
    if (phone && useAppStore.getState().detailsPanes[pane].open) toggleDetailsPane(pane, false);
  }, [pane, phone, toggleDetailsPane]);

  const marginRef = useRef(open ? 0 : -width);
  const widthRef = useRef(width);
  const paint = () => {
    const element = containerRef.current;
    if (!element) return;
    element.style.width = `${widthRef.current}px`;
    element.style.marginLeft = `${marginRef.current}px`;
    element.style.transform = marginRef.current ? `translateX(${-marginRef.current}px)` : 'none';
  };

  useSpringValue(
    open ? 0 : -width,
    reducedMotion || !mounted,
    (value) => {
      marginRef.current = value;
      paint();
    },
    (value) => {
      if (value !== 0 && !openRef.current) setMounted(false);
    },
  );
  useSpringValue(width, reducedMotion || resizing || !mounted, (value) => {
    widthRef.current = value;
    paint();
  });
  useLayoutEffect(paint);

  const scrim = phone && touch && mounted;

  return (
    <div className="details-pane-layout">
      <div className="details-pane-content">{children}</div>
      {scrim && (
        <div
          className="details-pane-scrim"
          data-open={open ? 'true' : 'false'}
          aria-hidden="true"
          onClick={close}
        />
      )}
      {mounted && (
        <div ref={containerRef} className="details-pane" data-overlay={overlay ? 'true' : 'false'}>
          <div className="details-pane-backdrop" aria-hidden="true" />
          <aside
            className="details-pane-aside"
            aria-label={label}
            onTouchStart={(event) => {
              const touchPoint = event.touches[0];
              swipeStart.current = event.touches.length === 1 && touchPoint
                ? { x: touchPoint.clientX, y: touchPoint.clientY, at: Date.now() }
                : null;
            }}
            onTouchMove={(event) => {
              const touchPoint = event.touches[0];
              if (!swipeStart.current || !touchPoint) return;
              const current = { x: touchPoint.clientX, y: touchPoint.clientY, at: Date.now() };
              if (isSwipeRight(swipeStart.current, current)) {
                swipeStart.current = null;
                close();
              }
            }}
            onTouchEnd={() => {
              swipeStart.current = null;
            }}
          >
            <Frozen open={open}>{details}</Frozen>
          </aside>
          {!overlay && (
            <DetailsPaneResizeHandle
              width={width}
              windowWidth={windowWidth}
              onResize={setLiveWidth}
              onResizeEnd={(next) => {
                setDetailsPaneWidth(pane, next);
                setLiveWidth(null);
              }}
              onResizingChange={setResizing}
              onClick={close}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The view header's "Open details" / "Close details" button (Ctrl I or ], as in Linear). */
export function DetailsPaneToggle({ pane }: { pane: DetailsPaneId }) {
  const open = useAppStore((store) => store.detailsPanes[pane].open);
  const toggleDetailsPane = useAppStore((store) => store.toggleDetailsPane);
  const label = open ? 'Close details' : 'Open details';
  return (
    <Tooltip content={label} shortcut="Ctrl I">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        data-active={open ? 'true' : undefined}
        onClick={() => toggleDetailsPane(pane)}
        className="details-pane-toggle linear-header-target"
      >
        <LinearSidebarToggleIcon isOpen={open} size={16} />
      </button>
    </Tooltip>
  );
}
