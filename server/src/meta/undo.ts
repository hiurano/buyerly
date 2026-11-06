import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AUDIT_EVENT_COLUMNS, recordAuditEvent, userActorId, type AuditEventRow } from '../audit/events.ts';
import { ENTITY_NOUNS, MUTATING_EVENT_TYPES, undoEntityId, undoEntityIdSql, undoEntityLevel, withinUndoWindow } from '../audit/undo.ts';
import { rows } from '../database.ts';
import type { AuditEventEntity, UserEntity } from '../entities/index.ts';
import { ensureWriteAccess, scopeOf } from '../graphql/areas/accounts/scope.ts';
import { RouteError } from '../graphql/errors.ts';
import { pyFloat } from '../python-numbers.ts';
import { accountAccess, allowsAccount } from '../workspaces/account-access.ts';
import { metaClient } from './app-client.ts';
import { accountAccessToken, reflectEntityChange } from './delivery.ts';
import { get, isRecord, strOr, type Json } from './python.ts';
import { redactSecrets } from './redact.ts';
import { normalizeCurrency, UNKNOWN_CURRENCY } from './units.ts';

// Undoing one Meta change from the history (core/action_undo.py
// reverse_audit_event, api/routers/audit.py undo_audit_event; #611 stage 4):
// safely and once. The change must be the newest on its entity, inside the
// 24-hour window, and Meta must still show its result; a retry after a crash
// or a failed write that did land confirms it instead of writing again.

export const UNDO_PENDING_LEASE_SECONDS = 120;
export const STATE_CHANGED_ERROR = 'Meta state no longer matches the original action';
// Undoing a rule's action keeps the rules from repeating it on the same
// entity until the account's day ends; the worker reads the undo from the history.
const RULE_HOLD_PHRASES: Record<string, string> = {
  STOP: 'turn this {noun} off',
  AUTO_REACTIVATE: 'turn this {noun} on',
  INCREASE_BUDGET: "raise this {noun}'s budget",
  DECREASE_BUDGET: "lower this {noun}'s budget",
};

// UndoError: 409 unless said otherwise.
const undoError = (message: string, status = 409): RouteError => new RouteError(status, message);

interface UndoSpec {
  kind: 'status' | 'budget';
  expected: Json;
  desired: Json;
}

// _load_state
function loadState(value: unknown): Json {
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value || '{}');
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

// undo_spec_for_event
export function undoSpecFor(event: Pick<AuditEventRow, 'event_type' | 'before_state' | 'after_state'>): UndoSpec {
  const type = String(event.event_type || '').toUpperCase();
  if (type === 'STOP' || type === 'MANUAL_PAUSE') return { kind: 'status', expected: { status: 'PAUSED' }, desired: { status: 'ACTIVE' } };
  if (type === 'AUTO_REACTIVATE' || type === 'MANUAL_REACTIVATE') return { kind: 'status', expected: { status: 'ACTIVE' }, desired: { status: 'PAUSED' } };
  if (type === 'INCREASE_BUDGET' || type === 'DECREASE_BUDGET') {
    const before = loadState(event.before_state);
    const after = loadState(event.after_state);
    const previous = pyFloat(before.daily_budget);
    const changed = pyFloat(after.daily_budget);
    if (previous === undefined || changed === undefined) throw undoError('The history has no exact before and after budget values for this action.');
    if (![previous, changed].every((value) => Number.isFinite(value) && value >= 1.0)) throw undoError('The budget values in the history are not safe to undo.');
    return { kind: 'budget', expected: { daily_budget: changed }, desired: { daily_budget: previous } };
  }
  throw undoError('This action cannot be undone safely.');
}

// rule_hold_notice
function ruleHoldNotice(event: Pick<AuditEventRow, 'category' | 'actor_type' | 'event_type'>, level: string): string {
  if (event.category !== 'RULE_ACTION' || event.actor_type !== 'system') return '';
  const phrase = RULE_HOLD_PHRASES[String(event.event_type || '').toUpperCase()];
  return phrase ? `Rules won't ${phrase.replace('{noun}', ENTITY_NOUNS[level])} again today.` : '';
}

// state_matches
function stateMatches(spec: UndoSpec, current: Json, target: Json): boolean {
  if (spec.kind === 'status') return strOr(get(current, 'status'), '').toUpperCase() === String(target.status).toUpperCase();
  const value = pyFloat(get(current, 'daily_budget'));
  return value !== undefined && Math.abs(value - Number(target.daily_budget)) <= 0.011;
}

const undoEntityName = (event: Pick<AuditEventRow, 'entity_name' | 'adset_name'>): string => event.entity_name || event.adset_name || '';

interface UndoAccount {
  id: number;
  account_id: string;
  name: string | null;
  workspace_id: number | null;
  owner_user_id: number | null;
  currency: string | null;
  meta_connection_id: number | null;
  access_token: string | null;
  access_token_encrypted: string | null;
  lead_user_id: number | null;
  custom_name: string | null;
  note: string | null;
}

interface UndoStateRow {
  id: number;
  status: string;
  correlation_id: string;
  last_error: string;
  pending_age: number;
}

const perfMs = (started: number): number => Math.max(0, Math.trunc(performance.now() - started));

// build_audit_event for an undo row.
function undoEvent(
  account: UndoAccount,
  source: AuditEventRow,
  fields: { eventType: string; status: string; correlationId: string; message: string; before: Json; after: Json; details: Json; actorId: string; started: number; adsetId: string; adsetName: string; entityName: string },
): Partial<AuditEventEntity> & Pick<AuditEventEntity, 'eventType' | 'status'> {
  return {
    workspaceId: account.workspace_id,
    ownerUserId: account.owner_user_id,
    actorType: 'user',
    actorId: fields.actorId,
    category: 'MANUAL_ACTION',
    eventType: fields.eventType,
    status: fields.status,
    accountId: account.account_id ?? '',
    accountName: account.name ?? '',
    adsetId: fields.adsetId,
    adsetName: fields.adsetName,
    entityLevel: undoEntityLevel(source),
    entityId: undoEntityId(source),
    entityName: fields.entityName,
    ruleId: null,
    ruleName: '',
    action: `UNDO_${source.action || source.event_type}`,
    message: redactSecrets(fields.message),
    beforeState: fields.before as AuditEventEntity['beforeState'],
    afterState: fields.after as AuditEventEntity['afterState'],
    details: fields.details as AuditEventEntity['details'],
    correlationId: fields.correlationId,
    durationMs: perfMs(fields.started),
  };
}

export async function undoAuditEvent(app: FastifyInstance, user: UserEntity, eventId: number): Promise<Json> {
  const actorId = userActorId(user);
  // Everything checked and the undo claimed (PENDING) in one transaction, as
  // Python commits before it asks Meta.
  const claimed = await app.db.transaction(async (tx) => {
    const scope = await scopeOf(tx, user);
    ensureWriteAccess(scope, 'undoing an action');
    const workspaceId = scope.workspaceId;
    const [owned] = await rows<{ account_id: string | null }>(tx, 'SELECT account_id FROM audit_events WHERE id = $1 AND workspace_id = $2', [eventId, workspaceId]);
    if (owned?.account_id && !allowsAccount(await accountAccess(tx, scope.member.id === null ? null : scope.member, workspaceId), owned.account_id)) {
      throw new RouteError(404, 'Event not found');
    }

    const [source] = await rows<AuditEventRow>(tx, `SELECT ${AUDIT_EVENT_COLUMNS} FROM audit_events WHERE id = $1 FOR UPDATE`, [eventId]);
    if (!source) throw undoError('Event not found.', 404);
    // Undo is scoped by an explicit workspace; legacy rows without one stay out.
    if (source.workspace_id !== workspaceId) throw undoError('Access to this action is denied.', 403);
    const reversals = await rows<{ id: number }>(tx, 'SELECT id FROM audit_events WHERE reverts_event_id = $1 AND workspace_id = $2', [source.id, workspaceId]);
    if (reversals.length > 1) throw new Error(`Multiple reversals of audit event ${source.id}`);
    if (reversals.length) {
      return {
        done: {
          success: true,
          already_reverted: true,
          original_event_id: source.id,
          reversal_event_id: reversals[0].id,
          message: 'This action has already been undone.',
        },
      };
    }
    if (String(source.status).toUpperCase() !== 'SUCCESS') throw undoError('Only a successfully completed action can be undone.');
    const spec = undoSpecFor(source);
    const level = undoEntityLevel(source);
    const entityId = undoEntityId(source);
    if (!source.account_id || !entityId) throw undoError('The history has no ad account or entity to undo.');
    // An ad has no budget of its own.
    if (spec.kind === 'budget' && level !== 'adset' && level !== 'campaign') throw undoError('Undoing a budget change is supported for ad sets and campaigns only.');
    if (!withinUndoWindow(source.created_at)) throw undoError('The 24-hour safe undo window has already closed.');
    const [newer] = await rows<{ id: number }>(
      tx,
      `SELECT id FROM audit_events WHERE id > $1 AND account_id = $2 AND ${undoEntityIdSql()} = $3 AND status = 'SUCCESS'
          AND event_type = ANY($4::text[]) AND workspace_id = $5 LIMIT 1`,
      [source.id, source.account_id, entityId, [...MUTATING_EVENT_TYPES], workspaceId],
    );
    if (newer) throw undoError(`The ${ENTITY_NOUNS[level]} has changed since this event. Undoing an older action is blocked.`);
    const [account] = await rows<UndoAccount>(tx, 'SELECT * FROM accounts WHERE account_id = $1 AND workspace_id = $2', [source.account_id, workspaceId]);
    if (!account) throw undoError('The ad account for this action was not found, or is unavailable.', 403);

    const [existing] = await rows<UndoStateRow>(
      tx,
      `SELECT id, status, correlation_id, last_error, extract(epoch FROM now() - updated_at)::float8 AS pending_age
         FROM action_undo_states WHERE original_event_id = $1 FOR UPDATE`,
      [source.id],
    );
    // A previous attempt whose write failed may still have landed (a timeout
    // after Meta applied it); then Meta shows the undone state and a retry confirms it.
    const retryAfterFailedWrite = Boolean(existing && existing.status === 'ERROR' && existing.last_error !== STATE_CHANGED_ERROR);
    let retryAfterCrash = false;
    const correlationId = randomUUID().replaceAll('-', '');
    let stateId: number;
    if (!existing) {
      const [created] = await rows<{ id: number }>(
        tx,
        `INSERT INTO action_undo_states (original_event_id, owner_user_id, status, correlation_id, attempt_count, expected_state, desired_state, last_error, created_at, updated_at)
         VALUES ($1, $2, 'PENDING', $3, 1, $4::jsonb, $5::jsonb, '', now(), now()) RETURNING id`,
        [source.id, source.owner_user_id, correlationId, JSON.stringify(spec.expected), JSON.stringify(spec.desired)],
      );
      stateId = created.id;
    } else {
      if (existing.status === 'PENDING') {
        if (existing.pending_age < UNDO_PENDING_LEASE_SECONDS) throw undoError('An undo is already running. Refresh the history in a couple of minutes.');
        retryAfterCrash = true;
      }
      await rows(
        tx,
        `UPDATE action_undo_states SET status = 'PENDING', attempt_count = attempt_count + 1, correlation_id = $2, last_error = '', updated_at = now()
          WHERE id = $1 RETURNING id`,
        [existing.id, correlationId],
      );
      stateId = existing.id;
    }
    return { work: { source, spec, level, entityId, account, stateId, correlationId, retry: retryAfterCrash || retryAfterFailedWrite, workspaceId } };
  });
  if ('done' in claimed) return claimed.done!;
  const { source, spec, level, entityId, account, stateId, correlationId, retry, workspaceId } = claimed.work;
  const client = metaClient(app);
  const started = performance.now();
  const sourceAfter = loadState(source.after_state);

  // _mark_failed: the undo state and an UNDO_ACTION_FAILED row; never raises.
  const markFailed = async (error: unknown): Promise<void> => {
    const message = redactSecrets(error instanceof Error ? error.message : String(error));
    try {
      await app.db.transaction(async (tx) => {
        await rows(tx, "UPDATE action_undo_states SET status = 'ERROR', last_error = $2, updated_at = now() WHERE id = $1 RETURNING id", [stateId, message]);
        await recordAuditEvent(tx, undoEvent(account, source, {
          eventType: 'UNDO_ACTION_FAILED', status: 'ERROR', correlationId, message, before: sourceAfter, after: sourceAfter,
          details: { original_event_id: source.id, original_event_type: source.event_type }, actorId, started,
          adsetId: source.adset_id ?? '', adsetName: source.adset_name ?? '', entityName: undoEntityName(source),
        }));
      });
    } catch {
      // As Python: the failure is already being reported to the caller.
    }
  };

  let accessToken: string;
  let currency: string;
  let current: Json;
  try {
    accessToken = await app.db.transaction((tx) => accountAccessToken(app, tx, account));
    currency = normalizeCurrency(account.currency);
    if (currency === UNKNOWN_CURRENCY) {
      const info = await client.getAccountInfo(account.account_id, accessToken);
      currency = normalizeCurrency(strOr(get(info, 'currency'), ''));
      if (currency === UNKNOWN_CURRENCY) throw new Error('Meta did not return the ad account currency');
      const known = currency;
      await app.db.transaction((tx) => rows(tx, 'UPDATE accounts SET currency = $2 WHERE id = $1 RETURNING id', [account.id, known]));
    }
    current = await client.getEntityState(entityId, accessToken, level, currency);
  } catch (error) {
    await markFailed(error);
    throw undoError('Meta did not return the current state. Nothing was undone.', 502);
  }

  const reconciled = retry && stateMatches(spec, current, spec.desired);
  if (!reconciled && !stateMatches(spec, current, spec.expected)) {
    await app.db.transaction((tx) =>
      rows(tx, "UPDATE action_undo_states SET status = 'ERROR', last_error = $2, updated_at = now() WHERE id = $1 RETURNING id", [stateId, STATE_CHANGED_ERROR]),
    );
    throw undoError("Meta's current state already differs from the result of the original action.");
  }
  if (!reconciled) {
    try {
      if (spec.kind === 'status') await client.setEntityStatus(entityId, accessToken, String(spec.desired.status), level, account.account_id);
      else await client.updateEntityBudget(entityId, accessToken, Number(spec.desired.daily_budget), currency, level, account.account_id);
    } catch (error) {
      await markFailed(error);
      throw undoError('Meta could not undo the action. Details were saved to the logs.', 502);
    }
  }

  const name = undoEntityName(source);
  let reversalId: number;
  try {
    reversalId = await app.db.transaction(async (tx) => {
      const reversal = await recordAuditEvent(tx, {
        ...undoEvent(account, source, {
          eventType: 'UNDO_ACTION', status: 'SUCCESS', correlationId, message: `Action #${source.id} was undone safely.`,
          before: current, after: spec.desired,
          details: { original_event_id: source.id, original_event_type: source.event_type, reconciled_after_restart: reconciled, currency },
          actorId, started,
          // The ad set columns stay empty above the ad set level, as the worker records the original.
          adsetId: level === 'adset' ? entityId : '',
          adsetName: level === 'adset' ? name || strOr(get(current, 'adset_name'), '') : '',
          entityName: name || strOr(get(current, 'entity_name'), '') || strOr(get(current, 'adset_name'), '') || entityId,
        }),
        revertsEventId: source.id,
      });
      await rows(tx, "UPDATE action_undo_states SET status = 'SUCCESS', updated_at = now() WHERE id = $1 RETURNING id", [stateId]);
      // Reactivation tracking is an ad set concept, as everywhere else.
      if (level === 'adset' && spec.kind === 'status') {
        if (spec.desired.status === 'ACTIVE') {
          await rows(tx, 'UPDATE stopped_adsets SET is_resolved = true, updated_at = now() WHERE adset_id = $1 RETURNING id', [entityId]);
        } else {
          const [stopped] = await rows<{ id: number }>(tx, 'UPDATE stopped_adsets SET is_resolved = false, updated_at = now() WHERE adset_id = $1 RETURNING id', [entityId]);
          if (!stopped) {
            await rows(
              tx,
              `INSERT INTO stopped_adsets (account_id, adset_id, adset_name, stop_spend, stop_leads, stop_registrations, is_resolved, stopped_at, updated_at)
               VALUES ($1, $2, $3, 0, 0, 0, false, now(), now()) RETURNING id`,
              [account.account_id, entityId, name || strOr(get(current, 'adset_name'), '') || entityId],
            );
          }
        }
      }
      return reversal.id;
    });
  } catch {
    throw undoError('Meta applied the undo, but Buyerly has not closed it in the history yet. Try again in two minutes.', 500);
  }

  // Ads Manager shows the restored state now, not after the next sync.
  await reflectEntityChange(app, {
    workspaceId,
    accountId: account.account_id,
    level,
    entityId,
    ...(spec.kind === 'status' ? { status: String(spec.desired.status) } : { dailyBudget: Number(spec.desired.daily_budget) }),
  });
  const notice = ruleHoldNotice(source, level);
  return {
    success: true,
    already_reverted: false,
    original_event_id: source.id,
    reversal_event_id: reversalId,
    message: ['Action undone and confirmed by Meta.', notice].filter(Boolean).join(' '),
  };
}
