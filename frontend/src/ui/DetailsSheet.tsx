import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsSmallScreen } from '@/lib/useMediaQuery';

/**
 * A view's details panel (Rules groups, Ads Manager facets) at Linear's small
 * width (880px and below). The list keeps the whole width; the panel lies over
 * it from the right, below the view header, as Linear's does: 350px wide (the
 * whole window when narrower). On a phone (640px and below) a backdrop dims the
 * list and closes it. Escape and the header's details button close it too, and
 * reaching the small width closes it, so a phone starts on the list.
 *
 * Returns true while the panel must be a sheet rather than a column.
 */
export function useDetailsSheet(open: boolean, close: () => void): boolean {
  const isSmall = useIsSmallScreen();
  const openRef = useRef(open);
  const closeRef = useRef(close);
  openRef.current = open;
  closeRef.current = close;

  useEffect(() => {
    if (isSmall && openRef.current) closeRef.current();
  }, [isSmall]);

  useEffect(() => {
    if (!isSmall || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSmall, open]);

  return isSmall;
}

/** The bottom of the view's header: the sheet and its backdrop start below it, as in Linear. */
function useHeaderBottom(): number {
  const [bottom, setBottom] = useState(0);
  useLayoutEffect(() => {
    const header = document.querySelector('main header');
    if (!header) return;
    const measure = () => setBottom(Math.max(0, Math.round(header.getBoundingClientRect().bottom)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return bottom;
}

export const DetailsSheet: React.FC<React.PropsWithChildren<{ label: string; onClose: () => void }>> = ({
  label,
  onClose,
  children,
}) => {
  const top = useHeaderBottom();
  const style = { '--details-sheet-top': `${top}px` } as React.CSSProperties;
  return createPortal(
    <>
      {/* Closes on the click itself, so the tap that closes it reaches nothing underneath. */}
      <div className="details-sheet-backdrop" style={style} aria-hidden="true" onClick={onClose} />
      <div className="details-sheet" style={style} role="region" aria-label={label}>
        {children}
      </div>
    </>,
    document.body,
  );
};
