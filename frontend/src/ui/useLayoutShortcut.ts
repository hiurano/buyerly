import { useEffect } from 'react';

/** Linear's "Toggle layout view": Cmd/Ctrl+B switches the view on screen between List and Board. */
export function useLayoutShortcut(toggle: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.code !== 'KeyB') return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, enabled]);
}

/** The shortcut as this platform's tooltips write it. */
export const LAYOUT_SHORTCUT = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘B' : 'Ctrl+B';
