import React, { startTransition, use, useEffectEvent, useLayoutEffect, useState } from 'react';
import { preloadPage, type PageToOpen } from '@/models/pagePreload';
import { preloadPageChunk } from '@/components/layout/BuyerlyPageChunks';

/** How long the previous page stays while the next one reads its data; then the skeleton shows. */
export const PAGE_HOLD_MS = 1_000;

/** What the app shows in `main`: one page, as of one navigation. */
export interface BuyerlyShownPage<P> {
  page: P;
  key: string;
  /** The next page's data on its way; settled, or null, once the pool holds it. */
  ready: Promise<void> | null;
}

/**
 * Linear's page switch (#490): the sidebar and the address move at once, but
 * `main` keeps the page on screen until the next one has its data, then swaps
 * it in one commit. The swap is a transition that BuyerlyPageGate holds while
 * the data is read into the pool; a page whose data the pool holds swaps in at
 * once, in the frame the address changes. Each switch is queued after the one
 * before, so rapid switches land on the last page only. After PAGE_HOLD_MS the
 * swap goes ahead with the skeleton.
 *
 * `page` is the page as the address has it now; `key` names it.
 */
export function useHeldPage<P extends PageToOpen>(page: P, key: string, workspaceId: number): BuyerlyShownPage<P> {
  const [shown, setShown] = useState<BuyerlyShownPage<P>>(() => ({ page, key, ready: null }));
  const switchPage = useEffectEvent(() => {
    if (key === shown.key) {
      // Back to the page on screen before the next one came: drop that switch.
      setShown(shown);
      return undefined;
    }
    const next = { page, key, ready: pageReady(preloadPage(page, workspaceId), preloadPageChunk(page.tab)) };
    const ready = next.ready;
    // The pool holds it all: swapped in before the frame is painted, as the address changes.
    // An update queued after a held switch, so that one never lands over it.
    if (!ready) {
      setShown(next);
      return undefined;
    }
    startTransition(() => setShown(next));
    // Still reading after PAGE_HOLD_MS: an urgent update shows the skeleton in its place.
    const timer = window.setTimeout(() => setShown(next), PAGE_HOLD_MS);
    void ready.then(() => window.clearTimeout(timer));
    return () => window.clearTimeout(timer);
  });
  useLayoutEffect(() => switchPage(), [key]);
  return shown;
}

/** The page's data and its code, read together; null when both are in. */
function pageReady(data: Promise<void> | null, code: Promise<void> | null): Promise<void> | null {
  if (!code) return data;
  if (!data) return code;
  // Set as it settles, as preloadPage's own, so the gate reads it at once.
  const both = Promise.all([data, code]).then(() => undefined) as Promise<void> & { status?: string };
  void both.then(() => { both.status = 'fulfilled'; });
  return both;
}

/** Holds a page back, inside a transition, until its data is in the pool. */
export const BuyerlyPageGate: React.FC<{ ready: Promise<void> | null; children: React.ReactNode }> = ({ ready, children }) => {
  if (ready) use(ready);
  return children;
};

const SKELETON_ROWS = [64, 48, 72, 56, 40, 68, 52, 60];

/** A page still reading its data after PAGE_HOLD_MS: a header and rows, as Linear's loading view. */
export const BuyerlyPageSkeleton: React.FC = () => (
  <div className="buyerly-page-skeleton" data-buyerly-page-skeleton="" role="status" aria-label="Loading…" aria-busy="true">
    <div className="buyerly-page-skeleton-header">
      <span className="buyerly-page-skeleton-bar" style={{ width: 120 }} />
    </div>
    <div className="buyerly-page-skeleton-rows">
      {SKELETON_ROWS.map((width, index) => (
        <div key={index} className="buyerly-page-skeleton-row">
          <span className="buyerly-page-skeleton-bar buyerly-page-skeleton-bar--icon" />
          <span className="buyerly-page-skeleton-bar" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  </div>
);
