/**
 * The arithmetic of a view's details pane, read from Linear's own
 * `DetailsPaneContainer` (2026-10-09). Kept free of React so CI can check it.
 */

export type DetailsPaneId = 'adsManager' | 'rules';

export interface DetailsPaneState {
  open: boolean;
  /** The width the person dragged it to; null until they do. */
  width: number | null;
}

/** Linear's `DetailsPaneWidth.default`: the pane's width until it is resized. */
export const DETAILS_PANE_DEFAULT_WIDTH = 350;
/** The narrowest a drag leaves it. */
export const DETAILS_PANE_MIN_WIDTH = 360;
/** The widest it ever gets. */
export const DETAILS_PANE_MAX_WIDTH = 600;
/** Room kept for the navigation sidebar (330) and the list (300) beside it. */
const RESERVED_WIDTH = 330 + 300;

/** At this width and below the pane lies over the list (Linear's `laptop`). */
export const DETAILS_PANE_OVERLAY_QUERY = '(max-width: 1024px)';
/** At this width and below a touch screen dims the list under it (Linear's `phone`). */
export const DETAILS_PANE_PHONE_QUERY = '(max-width: 640px)';

export const DETAILS_PANE_STORAGE_KEY = 'buyerly:details-panes';

/** Both panes start closed, as Linear's `show…DetailPane` settings do. */
export const defaultDetailsPanes = (): Record<DetailsPaneId, DetailsPaneState> => ({
  adsManager: { open: false, width: null },
  rules: { open: false, width: null },
});

/** The saved panes, or the defaults for anything missing or malformed. */
export function parseDetailsPanes(raw: string | null): Record<DetailsPaneId, DetailsPaneState> {
  const panes = defaultDetailsPanes();
  if (!raw) return panes;
  try {
    const saved = JSON.parse(raw);
    for (const id of Object.keys(panes) as DetailsPaneId[]) {
      const pane = saved?.[id];
      if (typeof pane?.open === 'boolean') panes[id].open = pane.open;
      if (typeof pane?.width === 'number' && Number.isFinite(pane.width)) panes[id].width = pane.width;
    }
  } catch { /* A broken value falls back to the defaults. */ }
  return panes;
}

/** The widest the pane may be in a window this wide: the window itself when it overlays. */
export function maxDetailsPaneWidth(windowWidth: number, overlay: boolean): number {
  return Math.min(DETAILS_PANE_MAX_WIDTH, overlay ? windowWidth + 1 : windowWidth - RESERVED_WIDTH);
}

/** The width the pane takes: its saved width beside the list, the default over it, never past the maximum. */
export function detailsPaneWidth(saved: number | null, windowWidth: number, overlay: boolean): number {
  const width = overlay ? DETAILS_PANE_DEFAULT_WIDTH : saved ?? DETAILS_PANE_DEFAULT_WIDTH;
  return Math.max(0, Math.min(maxDetailsPaneWidth(windowWidth, overlay), width));
}

/** A drag's width, between the minimum and the window's maximum. */
export function clampDetailsPaneWidth(width: number, windowWidth: number): number {
  const max = maxDetailsPaneWidth(windowWidth, false);
  return Math.round(Math.min(max, Math.max(Math.min(DETAILS_PANE_MIN_WIDTH, max), width)));
}

/**
 * Linear's pane spring (`{ tension: 1000, friction: 40, mass: 0.1 }`), stepped
 * the way react-spring does, one millisecond at a time. Overdamped: it settles
 * in about 170ms and never overshoots.
 */
export const DETAILS_PANE_SPRING = { tension: 1000, friction: 40, mass: 0.1 };
const PRECISION = 0.01;

export interface SpringValue {
  position: number;
  velocity: number;
}

/** Advances a spring `elapsed` milliseconds toward `target`; `done` once it rests there. */
export function stepSpring(value: SpringValue, target: number, elapsed: number): SpringValue & { done: boolean } {
  let { position, velocity } = value;
  const { tension, friction, mass } = DETAILS_PANE_SPRING;
  const steps = Math.max(1, Math.ceil(Math.min(elapsed, 64)));
  for (let step = 0; step < steps; step += 1) {
    const springForce = -tension * 0.000001 * (position - target);
    const dampingForce = -friction * 0.001 * velocity;
    velocity += ((springForce + dampingForce) / mass) * 1;
    position += velocity * 1;
  }
  const done = Math.abs(position - target) < PRECISION && Math.abs(velocity) < PRECISION;
  return done ? { position: target, velocity: 0, done } : { position, velocity, done };
}

/** A right-hand swipe of a finger: past 50px sideways, within 50px up or down and 300ms. */
export function isSwipeRight(
  start: { x: number; y: number; at: number },
  current: { x: number; y: number; at: number },
): boolean {
  if (current.at - start.at > 300) return false;
  if (Math.abs(start.y - current.y) > 50) return false;
  return current.x - start.x > 50;
}
