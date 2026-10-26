import {
  DEFAULT_INBOX_DISPLAY,
  fetchInboxDisplay,
  fetchInboxUnreadCount,
  inboxBadgeCount,
  saveInboxDisplay,
  type InboxDisplay,
  type InboxUnread,
} from '@/lib/inbox';
import { reaction } from 'mobx';
import { localDatabase } from './localDatabase';
import { afterPaint } from './pool';
import { scopeStore } from './scopeStore';
import { makeStore, useStore } from './store';

export type { InboxDisplay };

/** What Inbox keeps in the local database (#496): its Display options and the badge's counts. */
interface StoredInbox {
  display: InboxDisplay;
  unread: number;
  priorityUnread: number;
}

/** Inbox's unread counts and its Display options, kept per member on the server. */
export class InboxStore {
  inboxUnreadCount = 0;
  inboxPriorityUnreadCount = 0;
  inboxDisplay: InboxDisplay = DEFAULT_INBOX_DISPLAY;
  /** False until this workspace's saved Display options arrive (or the member changes one). */
  inboxDisplayLoaded = false;
  #displaySave: Promise<unknown> = Promise.resolve();

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.inboxUnreadCount = 0;
      this.inboxPriorityUnreadCount = 0;
      this.inboxDisplay = DEFAULT_INBOX_DISPLAY;
      this.inboxDisplayLoaded = false;
    });
    // Kept between visits, so a reload draws Inbox with the member's options and badge at once (#496).
    localDatabase.keep('inbox', (value) => this.hydrate(value as StoredInbox));
    reaction(
      () => (this.inboxDisplayLoaded
        ? { display: this.inboxDisplay, unread: this.inboxUnreadCount, priorityUnread: this.inboxPriorityUnreadCount }
        : null),
      (stored) => {
        if (stored) localDatabase.saveLater('inbox', () => stored);
      },
    );
  }

  /** Takes what the local database kept, then reads the saved options again behind the page. */
  hydrate(stored: StoredInbox) {
    if (this.inboxDisplayLoaded || !stored?.display) return;
    this.inboxUnreadCount = stored.unread;
    this.inboxPriorityUnreadCount = stored.priorityUnread;
    this.showDisplay({ ...DEFAULT_INBOX_DISPLAY, ...stored.display });
    const kept = this.inboxDisplay;
    const inScope = scopeStore.captureScope();
    afterPaint(() => {
      fetchInboxDisplay().then((display) => {
        // A choice made since wins over the saved one.
        if (inScope() && this.inboxDisplay === kept) this.showDisplay(display);
      }, () => {});
    });
  }

  /** The number next to Inbox in the sidebar and in the tab title. */
  get badgeCount(): number {
    return inboxBadgeCount(this.inboxDisplay, this.inboxUnreadCount, this.inboxPriorityUnreadCount);
  }

  /** Takes the unread counts every Inbox answer carries. */
  setInboxUnread(unread: InboxUnread) {
    this.inboxUnreadCount = unread.unread_count;
    this.inboxPriorityUnreadCount = unread.priority_unread_count ?? unread.unread_count;
  }

  async refreshInboxUnreadCount() {
    const inScope = scopeStore.captureScope();
    try {
      const unread = await fetchInboxUnreadCount();
      if (inScope() && typeof unread.unread_count === 'number') this.setInboxUnread(unread);
    } catch {
      // The badge keeps its last value; Inbox itself reports load errors.
    }
  }

  async loadInboxDisplay() {
    const inScope = scopeStore.captureScope();
    let display = DEFAULT_INBOX_DISPLAY;
    try {
      display = await fetchInboxDisplay();
    } catch {
      // Inbox still opens, with Linear's defaults.
    }
    // A choice made while this was loading wins over the saved one.
    if (inScope() && !this.inboxDisplayLoaded) this.showDisplay(display);
  }

  setInboxDisplay(patch: Partial<InboxDisplay>) {
    const inboxDisplay = { ...this.inboxDisplay, ...patch };
    this.showDisplay(inboxDisplay);
    const inScope = scopeStore.captureScope();
    // Saved one after another, so the last choice is the one that stays;
    // a save still queued when the workspace changes must not land in the new one.
    this.#displaySave = this.#displaySave
      .then(() => (inScope() ? saveInboxDisplay(inboxDisplay) : undefined))
      .catch(() => {
        // The choice still applies until the page is reloaded.
      });
  }

  private showDisplay(display: InboxDisplay) {
    this.inboxDisplay = display;
    this.inboxDisplayLoaded = true;
  }
}

export const inboxStore = new InboxStore();

export const useInboxStore = <T,>(select: (store: InboxStore) => T): T => useStore(inboxStore, select);
