import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Linear's split view (Inbox, Search, Triage), read from its SplitView and
 * measured live on 2026-10-24: the list starts 400px wide, can be dragged
 * between its minimum (300px in Inbox) and half the container, and keeps its
 * width on this device. Its code sends the list to the far end on a
 * double-click, but the overlay laid down on press swallows the second click,
 * so live nothing happens; neither does it here.
 */
export const SPLIT_LIST_DEFAULT_WIDTH = 400;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function readWidth(storageKey: string): number {
  try {
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : SPLIT_LIST_DEFAULT_WIDTH;
  } catch {
    return SPLIT_LIST_DEFAULT_WIDTH;
  }
}

function saveWidth(storageKey: string, width: number) {
  try {
    window.localStorage.setItem(storageKey, String(Math.round(width)));
  } catch { /* The width still applies until the page is reloaded. */ }
}

/**
 * The list's width in a split view, clamped to the container as Linear's
 * SplitView does on every render. `containerRef` goes on the element that
 * holds the list and the pane next to it.
 */
export function useSplitListWidth(storageKey: string, minWidth: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [stored, setStored] = useState(() => readWidth(storageKey));

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    setContainerWidth(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const maxWidth = containerWidth > 0 ? Math.max(minWidth, Math.round(containerWidth / 2)) : Infinity;
  const width = clamp(stored, minWidth, maxWidth);
  const save = useCallback((next: number) => {
    setStored(next);
    saveWidth(storageKey, next);
  }, [storageKey]);

  return { containerRef, width, minWidth, maxWidth, setWidth: setStored, saveWidth: save };
}

interface BuyerlySplitResizerProps {
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
}

/**
 * The 7px strip on the list's right edge (Linear's resize handle): a
 * hairline fades in 100ms after the pointer arrives, with a brighter spot
 * that follows it; dragging resizes from where the drag began. From press to
 * release an overlay covers the page, so nothing under the pointer reacts.
 */
export function BuyerlySplitResizer({ width, minWidth, maxWidth, onResize, onResizeEnd }: BuyerlySplitResizerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const placeIndicator = (clientY: number) => {
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    if (!track || !indicator) return;
    const { top, height } = track.getBoundingClientRect();
    indicator.style.transform = `translate3d(0, ${clamp(clientY - top, 0, height) - height / 2}px, 0)`;
  };

  useEffect(() => {
    if (!dragging) return undefined;
    document.body.classList.add('buyerly-split-resizing');
    return () => document.body.classList.remove('buyerly-split-resizing');
  }, [dragging]);

  const start = (startX: number) => {
    const startWidth = width;
    let moved = false;
    let latest = startWidth;
    setDragging(true);
    const onMove = (event: MouseEvent) => {
      moved = true;
      placeIndicator(event.clientY);
      latest = clamp(startWidth + event.clientX - startX, minWidth, maxWidth);
      onResize(latest);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      if (moved) onResizeEnd(latest);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      {dragging && <div className="buyerly-split-resizer-overlay" />}
      <div
        className="buyerly-split-resizer"
        data-dragging={dragging ? 'true' : undefined}
        style={{ left: width - 3 }}
        onMouseEnter={(event) => placeIndicator(event.clientY)}
        onMouseMove={(event) => placeIndicator(event.clientY)}
        onMouseDown={(event: React.MouseEvent) => {
          if (event.button !== 0) return;
          event.preventDefault();
          start(event.clientX);
        }}
      >
        <div ref={trackRef} className="buyerly-split-resizer-track" aria-hidden="true">
          <div ref={indicatorRef} className="buyerly-split-resizer-indicator" />
        </div>
      </div>
    </>
  );
}
