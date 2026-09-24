import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

/** One bulk action offered for the selected rows. */
export interface SelectionAction {
  id: string;
  label: string;
  /** Key that runs the action while rows are selected: a letter, or `Delete`. */
  shortcut: string;
  /** Held with Ctrl/Cmd, as Linear does for Delete. Plain letters stay unmodified. */
  withModifier?: boolean;
  icon: React.ReactNode;
  run: () => void;
}

/** Cmd+Backspace is what a Mac keyboard sends for Ctrl+Delete. */
const matchesShortcut = (action: SelectionAction, event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  const shortcut = action.shortcut.toLowerCase();
  return key === shortcut || (shortcut === 'delete' && key === 'backspace');
};

interface UseRowSelectionOptions {
  selectedIds: string[];
  /** Rows currently on screen, in order; Ctrl+A selects exactly these. */
  visibleIds: string[];
  setSelection: (ids: string[]) => void;
  actions: SelectionAction[];
  /** False while the list is not the thing on screen (loading, error, empty). */
  enabled?: boolean;
}

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element
    && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable),
  );
};

/** The `g` prefix of the app's go-to shortcuts must not also run an action. */
const GO_TO_PREFIX_WINDOW_MS = 1500;

/**
 * Linear's list selection keyboard: X toggles the row under the pointer,
 * Ctrl/Cmd+A selects every visible row, Esc clears, Ctrl/Cmd+K opens the
 * actions menu, and each action's letter runs it directly. Rows opt in by
 * carrying `data-row-id`.
 */
export function useRowSelection({
  selectedIds,
  visibleIds,
  setSelection,
  actions,
  enabled = true,
}: UseRowSelectionOptions) {
  const [menuOpen, setMenuOpen] = useState(false);
  const goToPressedAt = useRef(0);
  const count = selectedIds.length;

  const toggle = useCallback((id: string) => {
    setSelection(selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id]);
  }, [selectedIds, setSelection]);

  const clear = useCallback(() => {
    setMenuOpen(false);
    setSelection([]);
  }, [setSelection]);

  useEffect(() => {
    if (count === 0) setMenuOpen(false);
  }, [count]);

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target) || menuOpen) return;
      // A modal owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      const modified = event.ctrlKey || event.metaKey;
      const plain = !modified && !event.altKey && !event.shiftKey;

      if (plain && key === 'g') {
        goToPressedAt.current = Date.now();
        return;
      }
      const afterGoTo = Date.now() - goToPressedAt.current < GO_TO_PREFIX_WINDOW_MS;

      if (modified && !event.altKey && key === 'a') {
        if (visibleIds.length === 0) return;
        event.preventDefault();
        setSelection(visibleIds);
        return;
      }
      if (plain && key === 'x' && !afterGoTo) {
        // The row under the pointer, as in Linear, else the row with keyboard focus.
        const row = document.querySelector<HTMLElement>('[data-row-id]:hover')
          ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-row-id]');
        const id = row?.dataset.rowId;
        if (!id || !visibleIds.includes(id)) return;
        event.preventDefault();
        toggle(id);
        return;
      }
      if (count === 0) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        clear();
        return;
      }
      if (modified && !event.altKey && key === 'k') {
        // Runs in the capture phase so the global search menu does not open too.
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
        return;
      }
      if (modified && !event.altKey && !event.shiftKey) {
        const action = actions.find((item) => item.withModifier && matchesShortcut(item, event));
        if (action) {
          event.preventDefault();
          action.run();
        }
        return;
      }
      if (plain && !afterGoTo) {
        const action = actions.find((item) => !item.withModifier && matchesShortcut(item, event));
        if (action) {
          event.preventDefault();
          action.run();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [actions, clear, count, enabled, menuOpen, setSelection, toggle, visibleIds]);

  return { count, toggle, clear, menuOpen, setMenuOpen };
}
