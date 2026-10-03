import { useEffect, useRef } from 'react';
import { toast, type ToastOptions } from '@/ui/toast';

interface RevealRowOptions {
  /** The row the address names: a search result, a shared link. */
  id: string | undefined;
  /** Changes on every navigation, so the same address opened again reveals its row again. */
  navigationKey: number;
  /** The list is on screen with the data the address asks for. */
  ready: boolean;
  /** The list's data holds the row, whether or not it is drawn. */
  exists: boolean;
  /** Clears what keeps an existing row off screen; false when nothing did. */
  show: () => boolean;
  /** The failure toast for a row the list cannot show. */
  missing: () => Omit<ToastOptions, 'tone'>;
}

/**
 * Opens the record an address names the way Linear opens what search found:
 * its row, found by `data-row-id`, is scrolled to the middle of the list and
 * takes keyboard focus. A filter, another tab or a collapsed group that hides
 * it is cleared first; a row the list does not hold is reported, never
 * skipped in silence. Each navigation is handled once.
 */
export function useRevealRow({ id, navigationKey, ready, exists, show, missing }: RevealRowOptions): void {
  const handled = useRef<number | null>(null);
  const cleared = useRef<number | null>(null);

  // No dependencies: after `show()` the row appears on a later render, and the
  // check runs again then.
  useEffect(() => {
    if (!id || !ready || handled.current === navigationKey) return;
    const report = () => {
      handled.current = navigationKey;
      toast.show({ tone: 'error', ...missing() });
    };
    if (!exists) {
      report();
      return;
    }
    const row = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
    if (!row) {
      if (cleared.current !== navigationKey) {
        cleared.current = navigationKey;
        if (show()) return;
      }
      report();
      return;
    }
    handled.current = navigationKey;
    // A read-only row takes focus only from script, never from Tab.
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.scrollIntoView({ block: 'center', inline: 'nearest' });
    row.focus({ preventScroll: true });
  });
}
