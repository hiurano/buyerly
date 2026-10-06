import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIsSmallScreen } from '@/lib/useMediaQuery';

/**
 * A view's details panel (Rules groups, Ads Manager facets) at Linear's small
 * width (880px and below). The list keeps the whole width; the panel opens as
 * a sheet over it from the right, the mirror of the navigation drawer: at most
 * 360px, 40px clear of the left edge, above a backdrop. The backdrop and Escape
 * close it, and reaching the small width closes it, so a phone starts on the list.
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

export const DetailsSheet: React.FC<React.PropsWithChildren<{ label: string; onClose: () => void }>> = ({
  label,
  onClose,
  children,
}) =>
  createPortal(
    <>
      {/* Closes on the click itself, so the tap that closes it reaches nothing underneath. */}
      <div className="sidebar-backdrop" data-open="true" aria-hidden="true" onClick={onClose} />
      <div className="details-sheet" role="region" aria-label={label}>
        {children}
      </div>
    </>,
    document.body,
  );
