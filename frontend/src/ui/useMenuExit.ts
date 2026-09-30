import { useEffect, useState } from 'react';

/** Linear's menus fade out over ~140ms after they close (see `.linear-menu-exit`). */
export const MENU_EXIT_MS = 140;

/** Keeps a closed menu mounted for its closing fade. */
export const useMenuExit = (isOpen: boolean) => {
  const [isMounted, setIsMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setIsMounted(false), MENU_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return { isMounted: isOpen || isMounted, isClosing: !isOpen && isMounted };
};
