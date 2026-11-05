import { randomBytes } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { AuditEventEntity, type UserEntity } from '../entities/index.ts';
import {
  ENTITY_NOUNS,
  MUTATING_EVENT_TYPES,
  REVERSIBLE_EVENT_TYPES,
  undoEntityId,
  undoEntityIdSql,
  undoEntityLevel,
  withinUndoWindow,
} from './undo.ts';

// The workspace's audit log (AuditEvent): writing an event, and reading rows
// back as the Activity page and Inbox show them (api/routers/audit.py
// serialize_audit_events). Every area that records what a person did uses
// recordAuditEvent, so the history reads the same whichever server wrote it.

// An audit_events row as `SELECT ${AUDIT_EVENT_COLUMNS}` reads it.
export interface AuditEventRow {
  id: number;
  workspace_id: number | null;
  owner_user_id: number | null;
  actor_type: string;
  actor_id: string;
  category: string;
  event_type: string;
  status: string;
  account_id: string | null;
  account_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  entity_level: string | null;
  entity_id: string | null;
  entity_name: string | null;
  rule_id: number | null;
  rule_name: string | null;
  action: string | null;
  message: string | null;
  before_state: unknown;
  after_state: unknown;
  details: unknown;
  correlation_id: string;
  reverts_event_id: number | null;
  duration_ms: number | null;
  created_at: Date | null;
  // api/deps.py _utc_iso(created_at), formatted by Postgres to keep microseconds.
  created_at_iso: string;
}

// _utc_iso in SQL: isoformat() in UTC with "Z", microseconds only when there
// are any, "" for NULL.
export function utcIsoSql(column: string): string {
  return `coalesce(to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || CASE WHEN extract(microseconds FROM ${column})::bigint % 1000000 = 0 THEN ''
            ELSE to_char(${column} AT TIME ZONE 'UTC', '.US') END
    || 'Z', '')`;
}

export const AUDIT_EVENT_COLUMNS = `audit_events.*, ${utcIsoSql('audit_events.created_at')} AS created_at_iso`;

// api/deps.py _load_json_object: a JSON object, or {} for anything else.
export function jsonObject(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export interface SerializeOptions {
  workspaceId: number | null;
  canWriteWorkspace: boolean;
  user: UserEntity;
}

// Audit rows as the client reads them, with whether each can be undone and why not.
export async function serializeAuditEvents(
  tx: EntityManager,
  rows: AuditEventRow[],
  { workspaceId, canWriteWorkspace, user }: SerializeOptions,
): Promise<Record<string, unknown>[]> {
  const reversedBy = new Map<number, number>();
  if (rows.length) {
    const reversals = await tx.query<{ reverts_event_id: number | null; id: number }[]>(
      'SELECT reverts_event_id, id FROM audit_events WHERE reverts_event_id = ANY($1::int[]) AND workspace_id = $2',
      [rows.map((row) => row.id), workspaceId],
    );
    for (const reversal of reversals) if (reversal.reverts_event_id !== null) reversedBy.set(reversal.reverts_event_id, reversal.id);
  }

  // Keyed on the entity, so a campaign or ad action is its own target.
  const key = (accountId: string, entityId: string): string => JSON.stringify([accountId, entityId]);
  const targets = rows.filter((row) => row.account_id && undoEntityId(row));
  const latestByTarget = new Map<string, number>();
  if (targets.length) {
    const entity = undoEntityIdSql();
    const latest = await tx.query<{ account_id: string; entity_key: string; latest_id: number }[]>(
      `SELECT account_id, ${entity} AS entity_key, max(id) AS latest_id FROM audit_events
        WHERE account_id = ANY($1::text[]) AND ${entity} = ANY($2::text[]) AND status = 'SUCCESS'
          AND event_type = ANY($3::text[]) AND workspace_id = $4
        GROUP BY account_id, ${entity}`,
      [
        [...new Set(targets.map((row) => row.account_id!))],
        [...new Set(targets.map((row) => undoEntityId(row)))],
        [...MUTATING_EVENT_TYPES],
        workspaceId,
      ],
    );
    for (const row of latest) latestByTarget.set(key(row.account_id, row.entity_key), row.latest_id);
  }

  return rows.map((row) => {
    const reversalId = reversedBy.get(row.id) ?? null;
    const entityId = undoEntityId(row);
    const reversible = row.status === 'SUCCESS' && REVERSIBLE_EVENT_TYPES.has(row.event_type) && !!(row.account_id && entityId);
    const latestId = latestByTarget.get(key(row.account_id ?? '', entityId)) ?? null;
    const inWindow = withinUndoWindow(row.created_at);
    const canUndo = canWriteWorkspace && reversible && reversalId === null && latestId === row.id && inWindow;
    let undoReason = '';
    if (!canWriteWorkspace) undoReason = "Guests can't undo actions.";
    else if (reversalId !== null) undoReason = 'This action has already been undone.';
    else if (!reversible) undoReason = 'This event cannot be reversed by an opposite command.';
    else if (latestId !== row.id) undoReason = `The ${ENTITY_NOUNS[undoEntityLevel(row)]} has changed since this event.`;
    else if (!inWindow) undoReason = 'The 24-hour safe undo window has closed.';
    return {
      id: row.id,
      owner_user_id: user.role === 'admin' ? row.owner_user_id : null,
      workspace_id: row.workspace_id,
      actor_type: row.actor_type,
      actor_id: row.actor_id,
      category: row.category,
      event_type: row.event_type,
      status: row.status,
      account_id: row.account_id,
      account_name: row.account_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      entity_level: row.entity_level,
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      rule_id: row.rule_id,
      rule_name: row.rule_name,
      action: row.action,
      message: row.message,
      before_state: jsonObject(row.before_state),
      after_state: jsonObject(row.after_state),
      details: jsonObject(row.details),
      correlation_id: row.correlation_id,
      reverts_event_id: row.reverts_event_id,
      reverted_by_event_id: reversalId,
      is_reverted: reversalId !== null,
      display_status: reversalId !== null ? 'REVERTED' : row.status,
      can_undo: canUndo,
      undo_reason: undoReason,
      duration_ms: row.duration_ms,
      created_at: row.created_at_iso,
    };
  });
}

// What a person did, written in the caller's transaction, as the Python
// routes write AuditEvent(...): a user actor, a fresh correlation id
// (secrets.token_hex(16)) and the table's defaults for what is not given.
export type AuditEventInit = Partial<Omit<AuditEventEntity, 'id'>> & Pick<AuditEventEntity, 'eventType' | 'status'>;

export async function recordAuditEvent(tx: EntityManager, init: AuditEventInit): Promise<AuditEventEntity> {
  return tx.save(tx.create(AuditEventEntity, { correlationId: randomBytes(16).toString('hex'), ...init }));
}

// The actor id of a person, as the Python routes write it: str(user.telegram_id or user.id).
export function userActorId(user: UserEntity): string {
  return String(user.telegramId || user.id);
}
