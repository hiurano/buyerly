import { useCallback, useSyncExternalStore } from 'react';

/**
 * Linear's `alwaysCollapsed` breakpoint: at this width and below the navigation
 * sidebar never takes layout space and opens as a drawer over the content.
 */
export const SIDEBAR_ALWAYS_COLLAPSED_QUERY = '(max-width: 880px)';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** True while the sidebar is a drawer rather than a column (Linear's `isSmall`). */
export function useIsSmallScreen(): boolean {
  return useMediaQuery(SIDEBAR_ALWAYS_COLLAPSED_QUERY);
}

/** A finger and no hover: Linear's pure-touch case. */
export const TOUCH_SCREEN_QUERY = '(hover: none) and (pointer: coarse)';

/** On a touch screen a control a finger taps is at least 40px tall. */
export const TOUCH_HEIGHT_CLASS = '[@media(hover:none)_and_(pointer:coarse)]:h-10';

export function useIsTouchScreen(): boolean {
  return useMediaQuery(TOUCH_SCREEN_QUERY);
}

export function isSmallScreen(): boolean {
  return window.matchMedia(SIDEBAR_ALWAYS_COLLAPSED_QUERY).matches;
}
