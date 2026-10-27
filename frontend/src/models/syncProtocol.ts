/**
 * What a tab and the sync hub (syncHub.ts) say to each other (#498). The hub
 * holds a workspace's sync connection for every tab that has it open: in a
 * SharedWorker where the browser has one, else in the tab itself. Everything
 * here crosses postMessage, so it is plain data.
 */

/** A row of a synced model, as bootstrap and the change log give it. */
export type SyncRow = Record<string, unknown> & { id: number };

/** One change from the log, as /api/sync/ws and /api/sync/delta send it. */
export interface SyncAction {
  sync_id: number;
  model: string;
  model_id: string;
  action: 'insert' | 'update' | 'archive' | 'delete';
  data: Record<string, unknown> | null;
}

/**
 * What the app shows of it, as Linear's: `connecting` until the socket is
 * open and caught up, `synced` while changes come as they happen, `offline`
 * while it waits to open again. `off` with no workspace open, or when the
 * server has no sync engine for it.
 */
export type SyncStatus = 'off' | 'connecting' | 'synced' | 'offline';

/**
 * A write of the transaction queue (#508) as it is kept and shown to the other
 * tabs: the queue's own fields are opaque to the hub but for these.
 */
export interface SharedTransaction {
  id: string;
  state: 'queued' | 'confirmed';
  [field: string]: unknown;
}

/** A request the hub sends for a tab, its headers already made there (a worker reads no cookies). */
export interface HubRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** The server's answer to a request; `error` when it never came (the network). */
export type HubResponse =
  | { status: number; body: unknown }
  | { error: string };

/** What a tab says to the hub. */
export type TabMessage =
  /** Opens the workspace for this tab; `pending` is what its queue holds already (after the hub restarted). */
  | { type: 'join'; tab: string; scope: string; slug: string; account: number | null; headers: Record<string, string>; pending: SharedTransaction[] }
  | { type: 'leave'; tab: string }
  /** Every few seconds: a hub that doesn't answer is gone, and the tab opens another. */
  | { type: 'ping'; tab: string }
  /** The tab's queue changed: kept for the next visit, and drawn by the other tabs. */
  | { type: 'pending'; tab: string; transactions: SharedTransaction[] }
  | { type: 'request'; tab: string; id: number; request: HubRequest };

/** What the hub says to a tab. */
export type HubMessage =
  /** Every model held, from the local database or bootstrap: the tab's copy is replaced. */
  | { type: 'hold'; models: Record<string, SyncRow[]>; lastSyncId: number; syncGroups: string[] }
  /** Changes applied after what was held, in order. */
  | { type: 'delta'; actions: SyncAction[]; lastSyncId: number }
  /** `booting` while the models are being read: the pages wait for them. */
  | { type: 'status'; status: SyncStatus; live: boolean; booting: boolean }
  /** The other tabs' writes, to draw until the sync engine holds them. */
  | { type: 'peers'; transactions: SharedTransaction[] }
  /** Writes a closed tab (or the last visit) left unsent: this tab sends them now. */
  | { type: 'adopt'; transactions: SharedTransaction[] }
  | { type: 'response'; id: number; response: HubResponse }
  | { type: 'pong' }
  /** The hub doesn't know this tab (it was dropped as gone): it joins again. */
  | { type: 'unknown' };

/** Sent on the `buyerly-sync` BroadcastChannel when an account's local data is deleted (sign-out). */
export interface WipeMessage {
  type: 'wipe';
  /** Every account's with null. */
  username: string | null;
}

export const SYNC_CHANNEL = 'buyerly-sync';

/** Whether a scope (`<username>:<workspace>:<slug>`) belongs to the account a wipe names. */
export const wipes = (message: WipeMessage, scope: string) => (
  message.username === null || scope.startsWith(`${message.username}:`)
);
