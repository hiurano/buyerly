import type { SyncActionKind, SyncActionMessage, SyncedModel } from '@buyerly/shared';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import type { ActingMember } from '../workspaces/access.ts';

// The sync engine's change log, as Linear's sync actions (#504). Read side
// only: the rows of `sync_actions` are written by PostgreSQL triggers that
// Alembic installs (database/sync_log.py install_statements), so every
// writer, the Python worker included, logs alike. Each committing write
// sends one NOTIFY on NOTIFY_CHANNEL; the stream (sync/hub.ts) listens.
//
// Sync groups are strings: `workspace:<id>`, `workspace:<id>:members`
// (everyone but guests), `team:<id>`, `member:<id>` (one member's own data).

// NOTIFY channel a committed write wakes the stream on, one notification per transaction.
export const NOTIFY_CHANNEL = 'sync_actions';
// automation_runtime_states row that remembers how far compaction dropped the log.
const STATE_KEY = 'sync_log';

export interface Synced {
  model: SyncedModel;
  // Secrets and worker bookkeeping no client holds.
  excluded: readonly string[];
  // Columns that go to the row's own member group only (workspace members).
  private: readonly string[];
}

// Every synced table, in bootstrap's order. Must match database/sync_log.py
// SYNCED_TABLES, which the triggers are built from.
export const SYNCED_TABLES: Record<string, Synced> = {
  workspaces: { model: 'Workspace', excluded: [], private: [] },
  workspace_members: {
    model: 'WorkspaceMember',
    excluded: [],
    private: ['inbox_read_before', 'inbox_deleted_before', 'inbox_display', 'notification_channels'],
  },
  users: {
    model: 'User',
    excluded: [
      'telegram_id', 'email_verified_at', 'unconfirmed_email', 'onboarding_step',
      'onboarding_completed', 'auth_token', 'role', 'is_approved', 'active_workspace_id',
    ],
    private: [],
  },
  teams: { model: 'Team', excluded: [], private: [] },
  team_members: { model: 'TeamMember', excluded: [], private: [] },
  team_accounts: { model: 'TeamAccount', excluded: [], private: [] },
  team_documents: { model: 'TeamDocument', excluded: [], private: [] },
  accounts: {
    model: 'Account',
    excluded: ['access_token', 'access_token_encrypted', 'last_started_date', 'last_day_start_date'],
    private: [],
  },
  rule_presets: { model: 'Rule', excluded: [], private: [] },
  rule_groups: { model: 'Label', excluded: [], private: [] },
  rule_group_items: { model: 'RuleLabel', excluded: [], private: [] },
  audit_events: { model: 'InboxEvent', excluded: [], private: [] },
  inbox_notification_states: { model: 'InboxNotificationState', excluded: [], private: [] },
  favorites: { model: 'Favorite', excluded: [], private: [] },
  view_settings: { model: 'ViewSetting', excluded: [], private: [] },
  workspace_view_defaults: { model: 'WorkspaceViewDefault', excluded: [], private: [] },
  account_notification_settings: { model: 'AccountNotificationSetting', excluded: [], private: [] },
};

// A row of sync_actions as read here; sync_id is BIGINT, which node-postgres
// returns as a string.
export interface SyncActionRow {
  sync_id: string;
  model: string;
  model_id: string;
  action: string;
  data: Record<string, unknown> | null;
  sync_groups: string[];
}

export const SYNC_ACTION_COLUMNS = 'sync_id, model, model_id, action, data, sync_groups';

// One change as the client receives it, over the socket and from /sync/delta alike.
export function actionMessage(row: SyncActionRow): SyncActionMessage {
  return {
    sync_id: Number(row.sync_id),
    model: row.model,
    model_id: row.model_id,
    action: row.action as SyncActionKind,
    data: (row.data ?? {}) as SyncActionMessage['data'],
  };
}

function sorted(groups: Iterable<string>): string[] {
  // Python's sorted(): by code point, which for these ASCII strings is UTF-16 order.
  return [...new Set(groups)].sort();
}

// The sync groups a workspace member receives, as Linear's /sync/user_sync_groups.
// Deleted teams stay in: their archive entry still has to reach the people who had the team.
export async function memberSyncGroups(tx: EntityManager, member: ActingMember & { id: number }): Promise<string[]> {
  const ws = member.workspaceId;
  const groups = [`workspace:${ws}`, `member:${member.id}`];
  const own = 'SELECT team_id FROM team_members WHERE member_id = $2';
  let teams: { id: number }[];
  if (member.role !== 'guest') {
    groups.push(`workspace:${ws}:members`);
    teams = await rows(tx, `SELECT id FROM teams WHERE workspace_id = $1 AND (private IS false OR id IN (${own}))`, [ws, member.id]);
  } else {
    teams = await rows(tx, `SELECT id FROM teams WHERE workspace_id = $1 AND id IN (${own})`, [ws, member.id]);
  }
  return sorted([...groups, ...teams.map((team) => `team:${team.id}`)]);
}

// The member's groups; support access without a membership row sees the
// workspace as an admin would, every team included, and has no private data.
export async function bootstrapSyncGroups(tx: EntityManager, member: ActingMember): Promise<string[]> {
  if (member.id !== null) return memberSyncGroups(tx, { ...member, id: member.id });
  const ws = member.workspaceId;
  const teams = await rows<{ id: number }>(tx, 'SELECT id FROM teams WHERE workspace_id = $1', [ws]);
  return sorted([`workspace:${ws}`, `workspace:${ws}:members`, ...teams.map((team) => `team:${team.id}`)]);
}

// Entries after sync id `after` in any of `groups`, oldest first: one query on the sync id and group indexes.
export async function changesSince(tx: EntityManager, groups: string[], after: number, limit: number): Promise<SyncActionRow[]> {
  return rows<SyncActionRow>(
    tx,
    `SELECT ${SYNC_ACTION_COLUMNS} FROM sync_actions
      WHERE sync_id > $1 AND sync_groups && $2::text[]
      ORDER BY sync_id LIMIT $3`,
    [after, groups, limit],
  );
}

// The highest sync id already dropped; a client behind it must bootstrap again.
export async function compactedThrough(tx: EntityManager): Promise<number> {
  const [state] = await rows<{ through: string | null }>(
    tx,
    "SELECT payload->>'compacted_through' AS through FROM automation_runtime_states WHERE state_key = $1",
    [STATE_KEY],
  );
  return Number(state?.through ?? 0) || 0;
}

// The newest sync id; a fresh client starts from here after bootstrapping.
// An emptied log still remembers how far it went.
export async function lastSyncId(tx: EntityManager): Promise<number> {
  const [newest] = await rows<{ max: string | null }>(tx, 'SELECT max(sync_id) AS max FROM sync_actions');
  return Math.max(Number(newest?.max ?? 0), await compactedThrough(tx));
}

export async function needsBootstrap(tx: EntityManager, after: number): Promise<boolean> {
  return after < (await compactedThrough(tx));
}
