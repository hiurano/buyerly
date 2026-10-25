import { makeStore, useStore } from '@/models/store';

/**
 * What a toast reports. Linear never reports a plain success: a change shows
 * on the row itself. A toast appears only for a deletion, an undo or redo,
 * anything that failed, and news that happened outside the screen (`info`,
 * e.g. "Invite sent" — the invitee was notified by email).
 */
export type ToastTone = 'success' | 'error' | 'undo' | 'redo' | 'info' | 'warning';

export interface ToastOptions {
  tone: ToastTone;
  /** The leading word, set in strong weight: "Deleted", "Undo", "Couldn't pause". */
  title: string;
  /** Continues the title on the same line, e.g. "pause 2 campaigns." */
  message?: string;
  /** A second line under the title. */
  description?: string;
  /**
   * A link under the text; `button` draws it as Linear's small secondary
   * button instead, as on "New version available" → Reload.
   */
  action?: { label: string; onClick: () => void; button?: boolean };
  /** Stays until dismissed, like an error: news the person must not miss, e.g. "New version available". */
  persistent?: boolean;
}

export interface ToastItem extends ToastOptions {
  id: number;
}

/** Linear keeps a notification on screen for about eight seconds. */
export const TOAST_DURATION_MS = 8000;
/** Older toasts are dropped once this many are on screen. */
const MAX_VISIBLE = 3;

let nextId = 1;

/** The toasts on screen, oldest first. */
export class ToastStore {
  toasts: ToastItem[] = [];

  constructor() {
    makeStore(this);
  }

  show(options: ToastOptions): number {
    const id = nextId++;
    this.toasts = [...this.toasts, { ...options, id }].slice(-MAX_VISIBLE);
    return id;
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter((item) => item.id !== id);
  }

  clear() {
    this.toasts = [];
  }
}

export const toastStore = new ToastStore();

export const useToastStore = <T,>(select: (store: ToastStore) => T): T => useStore(toastStore, select);

/** Imperative entry point, usable from event handlers and stores alike. */
export const toast = {
  show: (options: ToastOptions) => toastStore.show(options),
  error: (title: string, description?: string) => toastStore.show({ tone: 'error', title, description }),
  dismiss: (id: number) => toastStore.dismiss(id),
};
