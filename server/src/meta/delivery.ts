import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { EntityManager } from 'typeorm';
import { recordAuditEvent, userActorId } from '../audit/events.ts';
import { rows } from '../database.ts';
import { AuditEventEntity, type UserEntity } from '../entities/index.ts';
import { ensureWriteAccess, refuseRecorded, scopeOf, writableAccount, type AccountRow } from '../graphql/areas/accounts/scope.ts';
import { RouteError } from '../graphql/errors.ts';
import { pyRound } from '../python-numbers.ts';
import { accountAccess, allowsAccountPk } from '../workspaces/account-access.ts';
import { metaClient } from './app-client.ts';
import { updateCachedAdsetStatus } from './inventory-cache.ts';
import { get, strOr, type Json } from './python.ts';
import { redactSecrets } from './redact.ts';
import { MetaTokenKeyring, resolveAccountAccessToken } from './tokens.ts';
import { fromMetaBudgetUnits, normalizeCurrency, toMetaBudgetUnits } from './units.ts';

// Turning one campaign, ad set or ad on or off, moving its daily budget, and
// turning a stopped ad set back on (api/routers/delivery.py, adsets.py
// reactivate_adset; #611 stage 4). These change real delivery and spend in
// Meta, so each reads the live state first, commits what it is about to try
// before asking Meta, and records how it ended: the audit row is what undo
// (core/action_undo.py) reverses.

export const ENTITY_NOUNS: Record<string, string> = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
// A budget less than a cent of the account currency away is the same budget,
// the tolerance undo already uses.
export const BUDGET_EPSILON = 0.011;

type Account = AccountRow & { currency: string | null; meta_connection_id: number | null; access_token: string | null; access_token_encrypted: string | null };

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// time.perf_counter() as milliseconds since `started`, kept as build_audit_event keeps it.
const durationSince = (started: number): number => Math.max(0, Math.trunc(performance.now() - started));

// resolve_account_access_token for an accounts row.
export async function accountAccessToken(app: FastifyInstance, tx: EntityManager, account: Account): Promise<string> {
  return resolveAccountAccessToken(
    {
      metaConnectionId: account.meta_connection_id,
      workspaceId: account.workspace_id,
      ownerUserId: account.owner_user_id,
      accessTokenEncrypted: account.access_token_encrypted,
      accessToken: account.access_token,
    },
    new MetaTokenKeyring(app.config.metaTokenEncryptionKey),
    async (id) => {
      const [connection] = await rows<{ status: string; workspace_id: number | null; owner_user_id: number | null; access_token_encrypted: string }>(
        tx,
        'SELECT status, workspace_id, owner_user_id, access_token_encrypted FROM meta_connections WHERE id = $1',
        [id],
      );
      return connection
        ? { status: connection.status, workspaceId: connection.workspace_id, ownerUserId: connection.owner_user_id, accessTokenEncrypted: connection.access_token_encrypted }
        : null;
    },
  );
}

interface Attempt {
  account: Account;
  user: UserEntity;
  level: string;
  entityId: string;
  entityName: string;
  eventType: string;
  action: string;
}

// _record: the audit row of a manual action, as build_audit_event builds it.
function auditFields(attempt: Attempt, status: string, message: string, before: Json, after: Json, started: number): Partial<AuditEventEntity> {
  const { account, user, level, entityId, entityName } = attempt;
  return {
    workspaceId: account.workspace_id,
    ownerUserId: account.owner_user_id,
    actorType: 'user',
    actorId: userActorId(user),
    category: 'MANUAL_ACTION',
    eventType: attempt.eventType,
    status,
    accountId: account.account_id ?? '',
    accountName: account.name ?? '',
    // Ad set actions keep filling the legacy columns the older history uses.
    adsetId: level === 'adset' ? entityId : '',
    adsetName: level === 'adset' ? entityName : '',
    entityLevel: level || 'adset',
    entityId,
    entityName,
    ruleId: null,
    ruleName: '',
    action: attempt.action,
    message: redactSecrets(message),
    beforeState: before as AuditEventEntity['beforeState'],
    afterState: after as AuditEventEntity['afterState'],
    details: {},
    correlationId: randomUUID().replaceAll('-', ''),
    durationMs: durationSince(started),
  };
}

// The intent, committed before Meta is asked; null when history cannot be written.
async function recordIntent(app: FastifyInstance, attempt: Attempt, before: Json, after: Json, started: number): Promise<number | null> {
  try {
    return await app.db.transaction(async (tx) => {
      const event = await recordAuditEvent(tx, {
        ...auditFields(attempt, 'PENDING', 'Manual action awaiting Meta confirmation.', before, after, started),
        eventType: attempt.eventType,
        status: 'PENDING',
      });
      return event.id;
    });
  } catch {
    app.log.error('Failed to persist manual action intent');
    return null;
  }
}

// The intent's outcome; false when it could not be saved (_commit_quietly).
async function recordOutcome(
  app: FastifyInstance,
  eventId: number,
  attempt: Attempt,
  status: string,
  message: string,
  before: Json,
  after: Json,
  started: number,
  what: string,
): Promise<boolean> {
  try {
    await app.db.transaction(async (tx) => {
      const fields = auditFields(attempt, status, message, before, after, started);
      await rows(
        tx,
        'UPDATE audit_events SET status = $2, message = $3, before_state = $4::jsonb, after_state = $5::jsonb, duration_ms = $6 WHERE id = $1 RETURNING id',
        [eventId, fields.status, fields.message, JSON.stringify(before), JSON.stringify(after), fields.durationMs],
      );
    });
    return true;
  } catch {
    app.log.error(`Failed to persist ${what}`);
    return false;
  }
}

// AnalyticsFactService.reflect_entity_change: Meta's confirmed change written
// into the entity's newest fact, so Ads Manager shows it before the next
// sync overwrites the row. Never raises: Meta has already changed.
export async function reflectEntityChange(
  app: FastifyInstance,
  change: { workspaceId: number | null; accountId: string; level: string; entityId: string; status?: string; dailyBudget?: number },
): Promise<boolean> {
  if (!change.workspaceId || !change.accountId || !change.entityId) return false;
  if (change.status === undefined && change.dailyBudget === undefined) return false;
  try {
    return await app.db.transaction(async (tx) => {
      const [fact] = await rows<{ id: string }>(
        tx,
        `SELECT id FROM analytics_entity_daily_facts WHERE workspace_id = $1 AND account_id = $2 AND entity_level = $3 AND entity_id = $4
          ORDER BY date DESC LIMIT 1 FOR UPDATE`,
        [change.workspaceId, change.accountId, change.level, change.entityId],
      );
      if (!fact) return false;
      const status = change.status === undefined ? null : change.status.slice(0, 32);
      const budget = change.dailyBudget === undefined ? null : pyRound(Number.isFinite(change.dailyBudget) ? change.dailyBudget : 0, 2);
      await rows(
        tx,
        `UPDATE analytics_entity_daily_facts SET status = coalesce($2, status), effective_status = coalesce($2, effective_status),
           daily_budget = coalesce($3, daily_budget), updated_at = now() WHERE id = $1 RETURNING id`,
        [fact.id, status, budget],
      );
      return true;
    });
  } catch (error) {
    app.log.warn(`Could not reflect a confirmed change of ${change.level} ${change.entityId} in the fact store: ${String(error)}`);
    return false;
  }
}

interface Prepared {
  account: Account;
  accessToken: string;
  state: Json;
}

// _prepare: the caller may write to the ad account, and Meta reports the
// entity's live state in that account.
async function prepare(
  app: FastifyInstance,
  user: UserEntity,
  level: string,
  entityId: string,
  accountId: string,
  action: string,
  description: string,
): Promise<Prepared> {
  const { account, accessToken } = await app.db.transaction(async (tx) => {
    const scope = await scopeOf(tx, user);
    ensureWriteAccess(scope, description, true);
    const found = (await writableAccount(tx, user, scope, accountId, action)) as Account;
    return { account: found, accessToken: await accountAccessToken(app, tx, found) };
  });
  let state: Json;
  try {
    state = await metaClient(app).getEntityState(entityId, accessToken, level, normalizeCurrency(account.currency));
  } catch {
    app.log.error(`Could not read ${level} ${entityId} before a manual action; details in audit history`);
    throw new RouteError(502, `Meta did not return the current state of this ${ENTITY_NOUNS[level]}. Nothing was changed.`);
  }
  const entityAccount = strOr(get(state, 'account_id'), '').replace(/^act_/, '');
  if (!entityAccount || entityAccount !== account.account_id.replace(/^act_/, '')) throw new RouteError(404, 'Entity not found in this ad account.');
  return { account, accessToken, state };
}

const entityNameOf = (state: Json): string => strOr(get(state, 'entity_name'), strOr(get(state, 'adset_name'), ''));

// set_entity_delivery
export async function setEntityDelivery(
  app: FastifyInstance,
  user: UserEntity,
  level: string,
  entityId: string,
  request: { account_id: string; status: 'ACTIVE' | 'PAUSED' },
): Promise<Json> {
  const noun = ENTITY_NOUNS[level];
  const { account, accessToken, state } = await prepare(app, user, level, entityId, request.account_id, 'SET_ENTITY_DELIVERY', `turning a ${noun} on or off`);
  const currentStatus = strOr(get(state, 'status'), 'UNKNOWN').toUpperCase();
  const entityName = entityNameOf(state);
  if (currentStatus !== 'ACTIVE' && currentStatus !== 'PAUSED') throw new RouteError(409, 'This entity cannot be toggled in its current state.');
  if (currentStatus === request.status) {
    return {
      entity_id: entityId,
      level,
      status: currentStatus,
      changed: false,
      audit_event_id: null,
      message: `This ${noun} is already ${request.status.toLowerCase()}.`,
    };
  }

  const attempt: Attempt = {
    account, user, level, entityId, entityName,
    eventType: request.status === 'PAUSED' ? 'MANUAL_PAUSE' : 'MANUAL_REACTIVATE',
    action: 'SET_ENTITY_DELIVERY',
  };
  const before = { status: currentStatus };
  const after = { status: request.status };
  const started = performance.now();
  const attemptId = await recordIntent(app, attempt, before, after, started);
  if (attemptId === null) throw new RouteError(503, 'History is unavailable. Nothing was sent to Meta.');
  try {
    await metaClient(app).setEntityStatus(entityId, accessToken, request.status, level, account.account_id);
  } catch {
    app.log.error(`Meta refused a manual delivery change on ${level} ${entityId}; details in audit history`);
    await recordOutcome(app, attemptId, attempt, 'ERROR', 'Meta could not confirm the change; verify its current state before retrying.', before, before, started, 'manual delivery error');
    throw new RouteError(502, `Meta could not change this ${noun}. Check its current state before retrying.`);
  }

  if (level === 'adset') {
    try {
      await app.db.transaction((tx) => updateCachedAdsetStatus(tx, account.account_id, entityId, request.status));
    } catch (error) {
      app.log.warn(`Failed to update adset ${entityId} status in inventory cache for ${account.account_id}: ${String(error)}`);
    }
  }
  const turned = request.status === 'PAUSED' ? 'off' : 'on';
  const saved = await recordOutcome(app, attemptId, attempt, 'SUCCESS', `${capitalize(noun)} turned ${turned} manually.`, before, after, started, 'manual delivery result');
  await reflectEntityChange(app, { workspaceId: account.workspace_id, accountId: account.account_id, level, entityId, status: request.status });
  return {
    entity_id: entityId,
    level,
    status: request.status,
    changed: true,
    audit_event_id: saved ? attemptId : null,
    message: saved ? `${capitalize(noun)} turned ${turned}.` : 'Meta applied the change, but history confirmation failed. Undo is unavailable.',
  };
}

// set_entity_budget: a budget is only moved, never created, so an entity that
// reports none keeps it on the other level of the hierarchy.
export async function setEntityBudget(
  app: FastifyInstance,
  user: UserEntity,
  level: string,
  entityId: string,
  request: { account_id: string; daily_budget: number },
): Promise<Json> {
  if (level === 'ad') throw new RouteError(400, 'An ad has no budget of its own.');
  const noun = ENTITY_NOUNS[level];
  const { account, accessToken, state } = await prepare(app, user, level, entityId, request.account_id, 'SET_ENTITY_BUDGET', `changing a ${noun} budget`);
  const entityName = entityNameOf(state);
  const reported = Number(get(state, 'daily_budget') || 0);
  const currentBudget = Number.isNaN(reported) ? 0 : reported;
  if (currentBudget < 1.0) {
    const other = level === 'campaign' ? 'its ad sets' : 'its campaign';
    throw new RouteError(409, `This ${noun} carries no daily budget; the budget is held by ${other}.`);
  }
  let dailyBudget: number;
  try {
    dailyBudget = fromMetaBudgetUnits(toMetaBudgetUnits(request.daily_budget, account.currency), account.currency);
  } catch (error) {
    throw new RouteError(409, (error as Error).message);
  }
  if (Math.abs(currentBudget - dailyBudget) <= BUDGET_EPSILON) {
    return {
      entity_id: entityId,
      level,
      daily_budget: currentBudget,
      changed: false,
      audit_event_id: null,
      message: 'The daily budget is already set to this amount.',
    };
  }

  const attempt: Attempt = {
    account, user, level, entityId, entityName,
    eventType: dailyBudget > currentBudget ? 'INCREASE_BUDGET' : 'DECREASE_BUDGET',
    action: 'SET_ENTITY_BUDGET',
  };
  const status = get(state, 'status') ?? null;
  const before = { daily_budget: currentBudget, status };
  const after = { daily_budget: dailyBudget, status };
  const started = performance.now();
  const attemptId = await recordIntent(app, attempt, before, after, started);
  if (attemptId === null) throw new RouteError(503, 'History is unavailable. Nothing was sent to Meta.');
  try {
    await metaClient(app).updateEntityBudget(entityId, accessToken, dailyBudget, normalizeCurrency(account.currency), level, account.account_id);
  } catch {
    app.log.error(`Meta refused a manual budget change on ${level} ${entityId}; details in audit history`);
    await recordOutcome(app, attemptId, attempt, 'ERROR', 'Meta could not confirm the change; verify its current state before retrying.', before, before, started, 'manual budget error');
    throw new RouteError(502, `Meta could not change this ${noun} budget. Check its current state before retrying.`);
  }

  const saved = await recordOutcome(app, attemptId, attempt, 'SUCCESS', `${capitalize(noun)} daily budget changed manually.`, before, after, started, 'manual budget result');
  await reflectEntityChange(app, { workspaceId: account.workspace_id, accountId: account.account_id, level, entityId, dailyBudget });
  return {
    entity_id: entityId,
    level,
    daily_budget: dailyBudget,
    previous_daily_budget: currentBudget,
    changed: true,
    audit_event_id: saved ? attemptId : null,
    message: saved ? `${capitalize(noun)} daily budget updated.` : 'Meta applied the change, but history confirmation failed. Undo is unavailable.',
  };
}

// reactivate_adset: a stopped ad set turned back on in Meta, its card resolved.
export async function reactivateAdset(app: FastifyInstance, user: UserEntity, adsetId: string): Promise<Json> {
  const found = await app.db.transaction(async (tx) => {
    const scope = await scopeOf(tx, user);
    ensureWriteAccess(scope, 'turning on an ad set', true);
    const stopped = await rows<{ id: number; account_id: string; adset_name: string | null }>(
      tx,
      'SELECT id, account_id, adset_name FROM stopped_adsets WHERE adset_id = $1',
      [adsetId],
    );
    // scalar_one_or_none: two rows are a server error, as in Python.
    if (stopped.length > 1) throw new Error(`Multiple stopped_adsets rows for ${adsetId}`);
    const [entry] = stopped;
    if (!entry) throw new RouteError(404, 'No record found for the stopped ad set.');
    let [account]: (Account | undefined)[] = await rows<Account>(
      tx,
      `SELECT * FROM accounts WHERE account_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND owner_user_id = $3))`,
      [entry.account_id, scope.workspaceId, user.id],
    );
    if (account && !allowsAccountPk(await accountAccess(tx, scope.member.id === null ? null : scope.member, scope.workspaceId), account.id)) {
      account = undefined;
    }
    if (!account) {
      return refuseRecorded(tx, user, scope.workspaceId, 403, 'Access denied.', 'REACTIVATE_ADSET', { type: 'adset', id: adsetId });
    }
    return { entry, account };
  });
  const { entry, account } = found;
  const attempt: Attempt = {
    account, user, level: 'adset', entityId: adsetId, entityName: entry.adset_name ?? '',
    eventType: 'MANUAL_REACTIVATE', action: 'REACTIVATE_ADSET',
  };
  const paused = { status: 'PAUSED', is_resolved: false };
  const started = performance.now();
  try {
    const accessToken = await app.db.transaction((tx) => accountAccessToken(app, tx, account));
    await metaClient(app).setAdsetStatus(adsetId, accessToken, 'ACTIVE', account.account_id);
  } catch (error) {
    app.log.error(`Error reactivating adset ${adsetId}; details stored in audit history`);
    try {
      await app.db.transaction((tx) =>
        recordAuditEvent(tx, { ...auditFields(attempt, 'ERROR', (error as Error).message ?? String(error), paused, paused, started), eventType: 'MANUAL_REACTIVATE', status: 'ERROR' }),
      );
    } catch (auditError) {
      app.log.error(`Failed to persist manual reactivation error: ${String(auditError)}`);
    }
    throw new RouteError(500, 'Meta could not turn the ad set on. Details were saved to the logs.');
  }

  try {
    await app.db.transaction(async (tx) => {
      await rows(tx, 'UPDATE stopped_adsets SET is_resolved = true, updated_at = now() WHERE id = $1 RETURNING id', [entry.id]);
      await updateCachedAdsetStatus(tx, account.account_id, adsetId, 'ACTIVE');
      await recordAuditEvent(tx, {
        ...auditFields(attempt, 'SUCCESS', 'Ad set turned on manually by the user.', paused, { status: 'ACTIVE', is_resolved: true }, started),
        eventType: 'MANUAL_REACTIVATE',
        status: 'SUCCESS',
      });
    });
  } catch (error) {
    app.log.warn(`Meta activated adset ${adsetId} but local state commit failed: ${String(error)}`);
    return {
      success: true,
      warning: true,
      message: `Ad set ${adsetId} was turned on in Meta; the local database will catch up on the next request.`,
    };
  }
  return { success: true, message: `Ad set ${adsetId} turned on.` };
}
