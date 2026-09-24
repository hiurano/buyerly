import { create } from 'zustand';

/**
 * What a toast reports. Linear never reports a plain success: a change shows
 * on the row itself. A toast appears only for a deletion, an undo or redo,
 * and anything that failed.
 */
export type ToastTone = 'success' | 'error' | 'undo' | 'redo';

export interface ToastOptions {
  tone: ToastTone;
  /** The leading word, set in strong weight: "Deleted", "Undo", "Couldn't pause". */
  title: string;
  /** Continues the title on the same line, e.g. "pause 2 campaigns." */
  message?: string;
  /** A second line under the title. */
  description?: string;
  action?: { label: string; onClick: () => void };
}

export interface ToastItem extends ToastOptions {
  id: number;
}

/** Linear keeps a notification on screen for about eight seconds. */
export const TOAST_DURATION_MS = 8000;
/** Older toasts are dropped once this many are on screen. */
const MAX_VISIBLE = 3;

interface ToastState {
  toasts: ToastItem[];
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (options) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...options, id }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative entry point, usable from event handlers and stores alike. */
export const toast = {
  show: (options: ToastOptions) => useToastStore.getState().show(options),
  error: (title: string, description?: string) => useToastStore.getState().show({ tone: 'error', title, description }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
