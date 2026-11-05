// The sync engine's wire format (#497, #504–#509), as Linear's bootstrap /
// delta / socket: what /api/sync/* and the change stream send, and what the
// client sends back. The server builds these and the client (frontend/src/
// models/sync*.ts) reads them, so a field renamed on one side fails the
// other's typecheck. Names are the wire's, snake_case.

import type { JsonObject } from './json.ts';

// Every synced model, in the order bootstrap lists them (database/sync_log.py
// SYNCED_TABLES, server/src/sync/log.ts).
export const SYNCED_MODELS = [
  'Workspace',
  'WorkspaceMember',
  'User',
  'Team',
  'TeamMember',
  'TeamAccount',
  'TeamDocument',
  'Account',
  'Rule',
  'Label',
  'RuleLabel',
  'InboxEvent',
  'InboxNotificationState',
  'Favorite',
  'ViewSetting',
  'WorkspaceViewDefault',
  'AccountNotificationSetting',
] as const;

export type SyncedModel = (typeof SYNCED_MODELS)[number];

/** A row of a synced model, as bootstrap and the change log give it: its columns less secrets. */
export type SyncRow = Record<string, unknown> & { id: number };

export type SyncActionKind = 'insert' | 'update' | 'archive' | 'delete';

/** One change from the log, as the socket and /api/sync/delta send it. */
export interface SyncActionMessage {
  sync_id: number;
  model: string;
  model_id: string;
  action: SyncActionKind;
  /** The new row less secrets (insert), the changed fields (update, archive), `{}` (delete). */
  data: JsonObject;
}

/** `GET /api/sync/bootstrap`: every synced model the member may see, current to `last_sync_id`. */
export interface SyncBootstrap {
  last_sync_id: number;
  sync_groups: string[];
  models: Record<SyncedModel, SyncRow[]>;
}

/** A rule or label in Recently deleted, as archived models list it. */
export interface DeletedItemRow {
  /** The rule's or label's own id. */
  id: number;
  deleted_item_id: number;
  name: string;
  /** ISO 8601 with its offset, as Python's isoformat(). */
  deleted_at: string;
  deleted_by_user_id: number | null;
}

export const ARCHIVED_MODELS = [
  'Team',
  'TeamMember',
  'TeamAccount',
  'TeamDocument',
  'InboxNotificationState',
  'Rule',
  'Label',
] as const satisfies readonly SyncedModel[];

/** `GET /api/sync/archived-models`: deleted teams with what was on them, deleted Inbox notifications, Recently deleted. */
export interface SyncArchivedModels {
  last_sync_id: number;
  sync_groups: string[];
  models: Record<(typeof ARCHIVED_MODELS)[number], SyncRow[]>;
}

/** `GET /api/sync/delta?since=&limit=`: the member's changes after `since`; 410 `bootstrap` when too old. */
export interface SyncDelta {
  actions: SyncActionMessage[];
  last_sync_id: number;
  has_more: boolean;
  sync_groups: string[];
}

/** What `WS /api/sync/ws?since=&workspace=&account=` sends, every message a JSON object with a `type`. */
export type SyncSocketMessage =
  /** Changes in sync-id order; the client is current to `last_sync_id` once applied. */
  | { type: 'delta'; actions: SyncActionMessage[]; last_sync_id: number }
  /** Once, after the changes the client missed. */
  | { type: 'caught_up'; last_sync_id: number }
  /** The member's groups changed (a team joined, a role changed): the client bootstraps what it newly sees. */
  | { type: 'sync_groups'; sync_groups: string[]; added: string[]; removed: string[] }
  /** A heartbeat to a quiet socket, or the answer to the client's ping. */
  | { type: 'ping' }
  | { type: 'pong' };

/** What the client may send on the socket. */
export type SyncClientMessage = { type: 'ping' };

/** The socket's close codes, in the 4000–4999 range left to applications. */
export const SYNC_CLOSE = {
  /** Not signed in, or signed out while open. */
  unauthorized: 4401,
  /** No access to the workspace, taken out of it, or another site's page. */
  forbidden: 4403,
  /** No workspace. */
  notFound: 4404,
  /** `since` is older than the log keeps, or missing: bootstrap again. */
  bootstrap: 4410,
  /** Fell too far behind: reconnect and catch up from the database. */
  tooSlow: 4429,
} as const;
