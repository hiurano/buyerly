import React, { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useMediaQuery, useIsTouchScreen } from '@/lib/useMediaQuery';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import detailsPaneCss from './DetailsPane.module.css';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlySidebarToggleIcon } from '@/icons/BuyerlyIcons';
import {
  DETAILS_PANE_DEFAULT_WIDTHS,
  DETAILS_PANE_OVERLAY_QUERY,
  DETAILS_PANE_PHONE_QUERY,
  clampDetailsPaneWidth,
  detailsPaneWidth,
  isSwipeRight,
  stepSpring,
  type DetailsPaneId,
  type SpringValue,
} from './detailsPaneModel';
import { detailsPaneStore, useDetailsPaneStore } from '@/models/detailsPaneStore';
import { BuyerlyToolbarButton } from './BuyerlyToolbarButton';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const styles = stylex.create({
  layout: {
    position: 'relative',
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  content: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  pane: {
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    zIndex: 90,
  },
  paneOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    maxWidth: '100%',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: 'linear-gradient(to left, var(--details-pane-backdrop), transparent)',
  },
  aside: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: 4,
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  scrim: {
    position: 'absolute',
    inset: 0,
    zIndex: 80,
    backgroundColor: colors['--details-pane-scrim'],
    animationName: {
      default: 'detailsPaneScrimIn',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: {
      default: '0.25s',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    animationTimingFunction: 'ease',
    transitionProperty: {
      default: 'opacity',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    transitionDuration: {
      default: '0.25s',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: 'ease',
  },
  scrimClosed: {
    opacity: 0,
    pointerEvents: 'none',
  },
  resizer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -3,
    width: 7,
    zIndex: 91,
    cursor: 'col-resize',
    touchAction: 'none',
  },
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 'calc(50% - 0.5px)',
    width: 0.5,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: colors['--details-pane-resizer-track'],
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: '0.25s',
    transitionDelay: '0s',
    maskImage: 'linear-gradient(transparent, #000 10%, #000 90%, transparent)',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '-50%',
    height: '200%',
    backgroundColor: colors['--details-pane-resizer-indicator'],
    maskImage: 'var(--resizer-spot-mask)',
  },
  tooltip: {
    position: 'absolute',
    right: 12,
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 8,
    backgroundColor: colors['--card-bg'],
    boxShadow: colors['--dropdown-shadow'],
    color: colors['--text-secondary'],
    fontSize: 12,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
});

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
  // The frames call the latest render's callbacks.
  const applyAt = useEffectEvent((position: number) => apply(position));
  const rest = useEffectEvent((position: number) => onRest?.(position));

  useLayoutEffect(() => {
    cancelAnimationFrame(frame.current);
    if (immediate) {
      value.current = { position: target, velocity: 0 };
      applyAt(target);
      rest(target);
      return undefined;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const next = stepSpring(value.current, target, now - last);
      last = now;
      value.current = next;
      applyAt(next.position);
      if (next.done) rest(target);
      else frame.current = requestAnimationFrame(tick);
    };
    applyAt(value.current.position);
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
    // The spot is twice the track's height and centred on it: shift it so its middle meets the pointer.
    const { top, height } = handle.getBoundingClientRect();
    indicator.style.transform = `translate3d(0, ${Math.min(Math.max(clientY - top, 0), height) - height / 2}px, 0)`;
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
      {...withClassName(stylex.props(styles.resizer), detailsPaneCss.resizer, 'details-pane-resizer')}
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
      <div {...withClassName(stylex.props(styles.track), detailsPaneCss.track)}>
        <div ref={indicatorRef} {...stylex.props(styles.indicator)} />
      </div>
      {tooltipTop !== null && !dragging && (
        <div
          {...withClassName(stylex.props(styles.tooltip), detailsPaneCss.tooltip)}
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
  const state = useDetailsPaneStore((store) => store.detailsPanes[pane]);
  const toggleDetailsPane = useDetailsPaneStore((store) => store.toggleDetailsPane);
  const setDetailsPaneWidth = useDetailsPaneStore((store) => store.setDetailsPaneWidth);
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
  const width = detailsPaneWidth(liveWidth ?? state.width, windowWidth, overlay, DETAILS_PANE_DEFAULT_WIDTHS[pane]);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const close = useCallback(() => toggleDetailsPane(pane, false), [pane, toggleDetailsPane]);

  // A phone opens on its list: a pane left open on a wider window starts closed there.
  useEffect(() => {
    if (phone && detailsPaneStore.detailsPanes[pane].open) toggleDetailsPane(pane, false);
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
      if (value !== 0 && !open) setMounted(false);
    },
  );
  useSpringValue(width, reducedMotion || resizing || !mounted, (value) => {
    widthRef.current = value;
    paint();
  });
  useLayoutEffect(paint);

  const scrim = phone && touch && mounted;

  return (
    <div {...withClassName(stylex.props(styles.layout), 'details-pane-layout')}>
      <div {...withClassName(stylex.props(styles.content), 'details-pane-content')}>{children}</div>
      {scrim && (
        <div
          {...withClassName(stylex.props(styles.scrim, !open && styles.scrimClosed), 'details-pane-scrim')}
          data-open={open ? 'true' : 'false'}
          aria-hidden="true"
          onClick={close}
        />
      )}
      {mounted && (
        <div
          ref={containerRef}
          {...withClassName(stylex.props(styles.pane, overlay && styles.paneOverlay), 'details-pane')}
          data-overlay={overlay ? 'true' : 'false'}
        >
          <div {...stylex.props(styles.backdrop)} aria-hidden="true" />
          <aside
            {...stylex.props(styles.aside)}
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
  const open = useDetailsPaneStore((store) => store.detailsPanes[pane].open);
  const toggleDetailsPane = useDetailsPaneStore((store) => store.toggleDetailsPane);
  const label = open ? 'Close details' : 'Open details';
  return (
    <Tooltip content={label} shortcut={navigator.platform.includes('Mac') ? '⌘I' : 'Ctrl+I'} align="end">
      <BuyerlyToolbarButton active={open} aria-label={label} aria-expanded={open} onClick={() => toggleDetailsPane(pane)}>
        <BuyerlySidebarToggleIcon isOpen={open} size={14} />
      </BuyerlyToolbarButton>
    </Tooltip>
  );
}
