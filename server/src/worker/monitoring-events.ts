import type { FastifyBaseLogger } from 'fastify';
import type { EntityManager } from 'typeorm';
import { recordAuditEvent } from '../audit/events.ts';
import { rows } from '../database.ts';
import type { MetaTokenAuthError } from '../meta/errors.ts';
import { redactSecrets } from '../meta/redact.ts';
import { pyInt, type RuleEvaluationResult } from '../rules/engine.ts';
import { pyStr } from '../rules/validation.ts';
import { errorText, recordAccountHealth, type HealthUpdate } from './account-health.ts';

// The history and health writes both halves of the monitoring cycle share
// (scheduler/worker.py _persist_audit_event, core/audit.py build_audit_event,
// _set_account_health, _handle_token_error; #611 stage 4).

export type MonitoringLog = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

// The accounts columns these writes read.
export interface MonitoredAccount {
  id: number;
  account_id: string;
  name: string | null;
  workspace_id: number | null;
  owner_user_id: number | null;
  meta_connection_id: number | null;
}

export interface MonitoringEvent {
  eventType: string;
  status: string;
  category?: string;
  evaluation?: RuleEvaluationResult;
  action?: string;
  message?: string;
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
  durationMs?: number;
}

// core/audit.py _YIELDED_ACTION_LABELS
const YIELDED_ACTION_LABELS: Record<string, string> = {
  STOP: 'turn off',
  DECREASE_BUDGET: 'lower budget',
  INCREASE_BUDGET: 'raise budget',
  AUTO_REACTIVATE: 'turn on',
};

// core/audit.py yielded_rules_note
export function yieldedRulesNote(yielded: Array<{ rule_name: unknown; action: unknown }>): string {
  const names = yielded
    .map((rule) => `"${rule.rule_name ? pyStr(rule.rule_name) : 'Unnamed rule'}" (${YIELDED_ACTION_LABELS[pyStr(rule.action)] ?? 'change'})`)
    .join(', ');
  return `Gave way to this rule: ${names}.`;
}

// _optional_int
function optionalInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  try {
    return pyInt(value);
  } catch {
    return null;
  }
}

// MonitoringWorker._persist_audit_event: an account in no workspace is
// quarantined, one without an owner takes the workspace's. A failure is
// logged and leaves the caller's other writes in place. Returns the id.
export async function persistMonitoringEvent(tx: EntityManager, log: MonitoringLog, cycleId: string, account: MonitoredAccount, event: MonitoringEvent): Promise<number | null> {
  await tx.query('SAVEPOINT monitoring_audit');
  try {
    if (account.workspace_id === null) throw new Error(`Account ${account.account_id} has no workspace; audit event is quarantined`);
    if (account.owner_user_id === null) {
      const [workspace] = await rows<{ owner_user_id: number | null }>(tx, 'SELECT owner_user_id FROM workspaces WHERE id = $1', [account.workspace_id]);
      if (!workspace || workspace.owner_user_id === null) throw new Error(`Account ${account.account_id} has no resolvable audit owner`);
      await tx.query('UPDATE accounts SET owner_user_id = $2 WHERE id = $1', [account.id, workspace.owner_user_id]);
      account.owner_user_id = workspace.owner_user_id;
    }
    const evaluation = event.evaluation;
    let evaluationDetails: Record<string, unknown> = {};
    let message = event.message || (evaluation ? evaluation.reason : '');
    if (evaluation) {
      evaluationDetails = {
        reason: evaluation.reason,
        conditions: evaluation.conditions_snapshot,
        spend: evaluation.spend,
        leads: evaluation.leads,
        registrations: evaluation.registrations,
        purchases: evaluation.purchases,
        cpl: evaluation.cpl,
        cpreg: evaluation.cpreg,
        cpp: evaluation.cpp,
        cooldown_minutes: evaluation.cooldown_minutes,
        currency: evaluation.currency,
        // The campaign an Inbox notification links to; for a campaign result
        // that is the entity itself.
        campaign_id: evaluation.entity_level === 'campaign' ? evaluation.entity_id : evaluation.campaign_id,
      };
      if (evaluation.yielded_rules.length) {
        evaluationDetails.yielded_rules = evaluation.yielded_rules;
        message = `${message} · ${yieldedRulesNote(evaluation.yielded_rules)}`;
      }
    }
    const isAdset = evaluation?.entity_level === 'adset';
    const created = await recordAuditEvent(tx, {
      workspaceId: account.workspace_id,
      ownerUserId: account.owner_user_id,
      actorType: 'system',
      actorId: 'monitoring_worker',
      category: event.category ?? 'RULE_ACTION',
      eventType: event.eventType,
      status: event.status,
      accountId: String(account.account_id ?? ''),
      accountName: String(account.name ?? ''),
      // adset_id/adset_name stay empty for a campaign or ad action.
      adsetId: isAdset ? pyStr(evaluation.entity_id) : '',
      adsetName: isAdset ? pyStr(evaluation.entity_name) : '',
      entityLevel: evaluation ? evaluation.entity_level : 'adset',
      entityId: evaluation ? pyStr(evaluation.entity_id) : '',
      entityName: evaluation ? pyStr(evaluation.entity_name) : '',
      ruleId: optionalInt(evaluation?.rule_id),
      ruleName: evaluation ? pyStr(evaluation.rule_name) : '',
      action: event.action || (evaluation ? evaluation.action : ''),
      message: redactSecrets(message),
      beforeState: (event.before ?? {}) as never,
      afterState: (event.after ?? {}) as never,
      details: { ...evaluationDetails, ...(event.details ?? {}) } as never,
      correlationId: cycleId,
      durationMs: Math.max(0, Math.trunc(event.durationMs ?? 0)),
    });
    await tx.query('RELEASE SAVEPOINT monitoring_audit');
    return created.id;
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT monitoring_audit');
    log.error(`Failed to persist audit event ${event.eventType}: ${errorText(error)}`);
    return null;
  }
}

// MonitoringWorker._set_account_health: the row, and an alert or recovery
// event when its status or cause changed.
export async function setMonitoredHealth(tx: EntityManager, log: MonitoringLog, cycleId: string, account: MonitoredAccount, update: HealthUpdate, emitTransitionEvent = true): Promise<void> {
  const { row, transitioned } = await recordAccountHealth(tx, account, update);
  if (!row || !transitioned || !emitTransitionEvent) return;
  await persistMonitoringEvent(tx, log, cycleId, account, {
    eventType: update.success ? 'ACCOUNT_HEALTH_RECOVERED' : 'ACCOUNT_HEALTH_ALERT',
    status: update.success ? 'SUCCESS' : row.status.toUpperCase(),
    category: 'ACCOUNT_HEALTH',
    action: update.success ? 'MONITOR' : 'INVESTIGATE',
    message: update.success ? 'Account health recovered' : row.last_error_message,
    after: { status: row.status, cause: row.cause },
    details: { error_code: row.last_error_code, consecutive_failures: row.consecutive_failures },
  });
}

// MonitoringWorker._handle_token_error: Meta refused the token. The account
// stops being monitored and its connection shows the error.
export async function handleTokenError(
  tx: EntityManager,
  log: MonitoringLog,
  cycleId: string,
  account: MonitoredAccount,
  error: MetaTokenAuthError,
  connectionIds: ReadonlySet<number>,
): Promise<void> {
  log.error(`Token error for account ${account.account_id}: ${error.message}`);
  await tx.query('UPDATE accounts SET is_active = false WHERE id = $1 AND is_active', [account.id]);
  if (account.meta_connection_id && connectionIds.has(account.meta_connection_id)) {
    await tx.query("UPDATE meta_connections SET status = 'error', last_error = $2, updated_at = now() WHERE id = $1", [
      account.meta_connection_id,
      error.description || error.message,
    ]);
  }
  await persistMonitoringEvent(tx, log, cycleId, account, {
    eventType: 'TOKEN_EXPIRED',
    status: 'ERROR',
    category: 'ACCOUNT_HEALTH',
    action: 'DISABLE_MONITORING',
    message: error.description || error.message,
    before: { is_active: true },
    after: { is_active: false },
    details: {
      error_code: error.code,
      error_subcode: error.subcode,
      subcode_key: error.subcodeKey,
      subcode_title: error.title,
      subcode_description: error.description,
      action_hint: error.actionHint,
      error_user_msg: error.errorUserMsg,
      fbtrace_id: error.fbtraceId,
    },
  });
}
