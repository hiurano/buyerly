import { useEffect } from 'react';
import { toast } from '@/ui/toast';

/**
 * One change this session made, with the way back and the way forward again.
 * `label` completes Linear's sentence, "Undo <label>." — e.g. "pause 2 campaigns".
 * Both directions throw when the server did not confirm them.
 */
export interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** Deep enough for a working session; older changes stay reachable through Inbox. */
const MAX_ENTRIES = 50;

const past: HistoryEntry[] = [];
let future: HistoryEntry[] = [];
let running = false;

/** Records a change the user just made. A new change discards what could be redone. */
export function pushHistory(entry: HistoryEntry): void {
  past.push(entry);
  if (past.length > MAX_ENTRIES) past.shift();
  future = [];
}

export function clearHistory(): void {
  past.length = 0;
  future = [];
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The change could not be confirmed.';
}

async function step(direction: 'undo' | 'redo'): Promise<void> {
  const source = direction === 'undo' ? past : future;
  const entry = source.pop();
  if (!entry) return;
  running = true;
  try {
    await entry[direction]();
    (direction === 'undo' ? future : past).push(entry);
    toast.show({
      tone: direction,
      title: direction === 'undo' ? 'Undo' : 'Redo',
      message: `${entry.label}.`,
    });
  } catch (error) {
    // What the server holds is no longer what this entry describes, so it is
    // dropped rather than offered again.
    toast.show({
      tone: 'error',
      title: direction === 'undo' ? "Couldn't undo" : "Couldn't redo",
      message: `${entry.label}.`,
      description: failureMessage(error),
    });
  } finally {
    running = false;
  }
}

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element
    && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable),
  );
};

/**
 * Ctrl/Cmd+Z undoes the last change and Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes
 * it, as in Linear. Text fields keep their own undo, and a modal dialog owns
 * the keyboard while it is open. Mounted once per workspace; the history is
 * dropped with it, because its changes belong to that workspace.
 */
export function useUndoShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      const undo = key === 'z' && !event.shiftKey;
      if (!undo && !redo) return;
      event.preventDefault();
      if (running) return;
      void step(undo ? 'undo' : 'redo');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearHistory();
    };
  }, []);
}
