import { scopeStore } from './scopeStore';
import { makeStore, useStore } from './store';

/** Linear's "Open issue…" family: what each O-then-letter palette opens. */
export type OpenPaletteKind = 'campaign' | 'adset' | 'ad' | 'rule' | 'account' | 'settings' | 'favorite';

/** Ctrl/Cmd+K, the "Open …" palettes and the keyboard shortcuts panel. */
export class CommandMenuStore {
  isCommandMenuOpen = false;
  /** Linear's keyboard shortcuts panel (Cmd/Ctrl+/). */
  isShortcutsOpen = false;
  /** The "Open …" palette on screen (O then a letter), if any. */
  openPalette: OpenPaletteKind | null = null;
  /**
   * "kind:id" of the record whose actions menu opens once its row is on
   * screen: Alt+Enter ("More actions") in an "Open …" palette.
   */
  recordActionsFor: string | null = null;

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.isCommandMenuOpen = false;
      this.isShortcutsOpen = false;
      this.openPalette = null;
      this.recordActionsFor = null;
    });
  }

  setCommandMenuOpen(open: boolean) {
    this.isCommandMenuOpen = open;
  }

  setShortcutsOpen(open: boolean) {
    this.isShortcutsOpen = open;
  }

  setOpenPalette(kind: OpenPaletteKind | null) {
    this.openPalette = kind;
  }

  setRecordActionsFor(key: string | null) {
    this.recordActionsFor = key;
  }
}

export const commandMenuStore = new CommandMenuStore();

export const useCommandMenuStore = <T,>(select: (store: CommandMenuStore) => T): T => useStore(commandMenuStore, select);
