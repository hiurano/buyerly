import type { DeletedItemRow } from '@buyerly/shared';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import type { ActingMember } from '../workspaces/access.ts';
import { SYNCED_TABLES, bootstrapSyncGroups, lastSyncId } from './log.ts';
import { pythonJson } from './python-json.ts';

// The sync engine's bootstrap, as Linear's /sync/bootstrap and
// /sync/archived_models (#505; database/sync_bootstrap.py).
//
// Two rules keep bootstrap and the log in agreement:
// - visibility is the log's: a row is returned when `sync_log_groups`, the
//   very function the triggers use, gives it a group the member has, and its
//   fields are the log's (to_jsonb of the row less excluded and private columns);
// - everything is read in one REPEATABLE READ snapshot, the sync id included
//   (the caller's transaction), so every write with a sync id up to the one
//   returned is in the data and every write after it is not.
//
// Each model is aggregated to JSON inside PostgreSQL and joined into the
// response as text, so the server never parses the rows: the body is the one
// the Python API sends, byte for byte.

// Which rows of a table could be the workspace's: a cheap prefilter on indexed
// columns, so the groups function runs only on them. `sync_log_groups` decides.
// :ws is the workspace, :member the member's row id (NULL for support access),
// :user their user id; all integers, written into the statement.
const ACTIVE_TEAMS = 'SELECT id FROM teams WHERE workspace_id = :ws AND deleted_at IS NULL';
const DELETED_TEAMS = 'SELECT id FROM teams WHERE workspace_id = :ws AND deleted_at IS NOT NULL';
const EVENTS = 'SELECT id FROM audit_events WHERE workspace_id = :ws';

export const ACTIVE_SCOPES: Record<string, string> = {
  workspaces: 't.id = :ws',
  workspace_members: 't.workspace_id = :ws',
  users: 't.id IN (SELECT user_id FROM workspace_members WHERE workspace_id = :ws)',
  teams: 't.workspace_id = :ws AND t.deleted_at IS NULL',
  team_members: `t.team_id IN (${ACTIVE_TEAMS})`,
  team_accounts: `t.team_id IN (${ACTIVE_TEAMS})`,
  team_documents: `t.team_id IN (${ACTIVE_TEAMS})`,
  accounts: 't.workspace_id = :ws',
  rule_presets: 't.workspace_id = :ws',
  rule_groups: 't.workspace_id = :ws',
  rule_group_items: 't.preset_id IN (SELECT id FROM rule_presets WHERE workspace_id = :ws)',
  audit_events: 't.workspace_id = :ws',
  inbox_notification_states: `t.user_id = :user AND t.deleted_at IS NULL AND t.audit_event_id IN (${EVENTS})`,
  favorites: 't.member_id = :member',
  view_settings: 't.member_id = :member',
  workspace_view_defaults: 't.workspace_id = :ws',
  account_notification_settings: 't.member_id = :member',
};

export const ARCHIVED_SCOPES: Record<string, string> = {
  teams: 't.workspace_id = :ws AND t.deleted_at IS NOT NULL',
  team_members: `t.team_id IN (${DELETED_TEAMS})`,
  team_accounts: `t.team_id IN (${DELETED_TEAMS})`,
  team_documents: `t.team_id IN (${DELETED_TEAMS})`,
  inbox_notification_states: `t.user_id = :user AND t.deleted_at IS NOT NULL AND t.audit_event_id IN (${EVENTS})`,
};

// Recently deleted rules and labels, the models they were, as the rules list's
// own visibility (workspace:<id>:members).
const DELETED_ITEM_MODELS: Record<string, string> = { rule: 'Rule', rule_group: 'Label' };

interface ScopeValues {
  ws: number;
  member: number | null;
  user: number;
}

function integer(value: number | null): string {
  if (value === null) return 'NULL';
  if (!Number.isSafeInteger(value)) throw new Error(`Not an integer: ${value}`);
  return String(value);
}

function scoped(scope: string, values: ScopeValues): string {
  return scope.replace(/:(ws|member|user)\b/g, (_match, name: keyof ScopeValues) => integer(values[name]));
}

// The rows of `table` in `scope` the groups may see, as a JSON array in id order.
async function modelJson(tx: EntityManager, table: string, scope: string, groups: string[], values: ScopeValues): Promise<string> {
  const synced = SYNCED_TABLES[table];
  // Private columns go to the row's own member group, as the log sends them.
  const [row] = await rows<{ json: string }>(
    tx,
    `SELECT CAST(coalesce(jsonb_agg(
               CASE WHEN 'member:' || (r.rec->>'id') = ANY($1::text[])
                    THEN r.rec - $2::text[]
                    ELSE r.rec - $2::text[] - $3::text[] END
               ORDER BY r.id), '[]') AS text) AS json
       FROM (SELECT t.id, to_jsonb(t) AS rec FROM ${table} t WHERE ${scoped(scope, values)}) r
      WHERE sync_log_groups('${table}', r.rec) && $1::text[]`,
    [groups, [...synced.excluded], [...synced.private]],
  );
  return row.json;
}

async function modelsJson(tx: EntityManager, scopes: Record<string, string>, groups: string[], values: ScopeValues): Promise<[string, string][]> {
  const models: [string, string][] = [];
  for (const [table, scope] of Object.entries(scopes)) {
    models.push([SYNCED_TABLES[table].model, await modelJson(tx, table, scope, groups, values)]);
  }
  return models;
}

// A JSON object from keys and values already encoded as JSON.
function object(fields: [string, string][]): string {
  return `{${fields.map(([key, value]) => `"${key}":${value}`).join(',')}}`;
}

function valuesOf(member: ActingMember): ScopeValues {
  return { ws: member.workspaceId, member: member.id, user: member.userId };
}

// Everything `member` may see, as {"last_sync_id", "sync_groups", "models": {Model: [rows]}}.
// Run inside a REPEATABLE READ transaction, or the sync id and the rows may come from different moments.
export async function bootstrapJson(tx: EntityManager, member: ActingMember): Promise<string> {
  const groups = await bootstrapSyncGroups(tx, member);
  const syncId = await lastSyncId(tx);
  const models = await modelsJson(tx, ACTIVE_SCOPES, groups, valuesOf(member));
  return object([
    ['last_sync_id', String(syncId)],
    ['sync_groups', pythonJson(groups)],
    ['models', object(models)],
  ]);
}

// Archived and recently deleted models `member` may see, in the same shape as bootstrap.
export async function archivedJson(tx: EntityManager, member: ActingMember): Promise<string> {
  const groups = await bootstrapSyncGroups(tx, member);
  const syncId = await lastSyncId(tx);
  const models = await modelsJson(tx, ARCHIVED_SCOPES, groups, valuesOf(member));
  const deleted = new Map<string, DeletedItemRow[]>(Object.values(DELETED_ITEM_MODELS).map((model) => [model, []]));
  if (groups.includes(`workspace:${member.workspaceId}:members`)) {
    // deleted_at as Python's datetime.isoformat() of a UTC timestamptz: microseconds only when there are any.
    const items = await rows<{ id: number; kind: string; entity_id: number; name: string; deleted_at: string; deleted_by_user_id: number | null }>(
      tx,
      `SELECT id, kind, entity_id, name, deleted_by_user_id,
              to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
              || CASE WHEN extract(microseconds FROM deleted_at)::bigint % 1000000 = 0 THEN ''
                      ELSE to_char(deleted_at AT TIME ZONE 'UTC', '.US') END
              || '+00:00' AS deleted_at
         FROM deleted_items WHERE workspace_id = $1 ORDER BY id`,
      [member.workspaceId],
    );
    for (const item of items) {
      const model = DELETED_ITEM_MODELS[item.kind];
      if (!model) continue;
      deleted.get(model)!.push({
        id: item.entity_id,
        deleted_item_id: item.id,
        name: item.name,
        deleted_at: item.deleted_at,
        deleted_by_user_id: item.deleted_by_user_id,
      });
    }
  }
  for (const [model, items] of deleted) models.push([model, pythonJson(items)]);
  return object([
    ['last_sync_id', String(syncId)],
    ['sync_groups', pythonJson(groups)],
    ['models', object(models)],
  ]);
}
