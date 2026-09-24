import { apiRequest } from '@/lib/api';

export type EntityLevel = 'campaign' | 'adset' | 'ad';

/**
 * A live delivery control handed to a row. Its `status` already includes what
 * this session wrote, which the stored snapshot has not caught up with yet.
 */
export interface DeliveryControl {
  status: 'active' | 'paused';
  busy: boolean;
  onChange: (next: boolean) => void;
}
export type DeliveryStatus = 'ACTIVE' | 'PAUSED';

export interface DeliveryResult {
  entity_id: string;
  level: EntityLevel;
  status: DeliveryStatus;
  /** False when the entity was already in the requested state: nothing was written. */
  changed: boolean;
  /** The audit row to reverse through the existing undo endpoint; null on a no-op. */
  audit_event_id: number | null;
  message: string;
}

export interface BudgetResult {
  entity_id: string;
  level: EntityLevel;
  daily_budget: number;
  previous_daily_budget?: number;
  changed: boolean;
  audit_event_id: number | null;
  message: string;
}

/**
 * Product confirmation threshold for substantial budget edits. This is not a
 * guarantee about Meta's learning-phase behavior.
 */
export const SIGNIFICANT_BUDGET_CHANGE = 0.25;

export function isSignificantBudgetChange(current: number, next: number): boolean {
  if (!Number.isFinite(current) || current <= 0) return true;
  return Math.abs(next - current) / current >= SIGNIFICANT_BUDGET_CHANGE;
}

export function setEntityDelivery(
  level: EntityLevel,
  entityId: string,
  accountId: string,
  status: DeliveryStatus,
): Promise<DeliveryResult> {
  return apiRequest<DeliveryResult>(
    `/api/entities/${level}/${encodeURIComponent(entityId)}/delivery`,
    { method: 'POST', body: JSON.stringify({ account_id: accountId, status }) },
  );
}

export function setEntityBudget(
  level: EntityLevel,
  entityId: string,
  accountId: string,
  dailyBudget: number,
): Promise<BudgetResult> {
  return apiRequest<BudgetResult>(
    `/api/entities/${level}/${encodeURIComponent(entityId)}/budget`,
    { method: 'PATCH', body: JSON.stringify({ account_id: accountId, daily_budget: dailyBudget }) },
  );
}

/** Reverses one recorded action through the audit history that already owns undo. */
export function undoAction(auditEventId: number): Promise<unknown> {
  return apiRequest(`/api/audit-events/${auditEventId}/undo`, { method: 'POST' });
}

export interface BulkDeliveryTarget {
  level: EntityLevel;
  entityId: string;
}

export interface BulkDeliveryOutcome {
  /** Entities Meta confirmed in the requested state, with the audit row to undo. */
  changed: { entityId: string; auditEventId: number | null }[];
  /** Already in the requested state: nothing was written. */
  unchanged: string[];
  failed: { entityId: string; error: string }[];
}

/** Meta rate-limits writes per ad account, so a selection is sent a few at a time. */
const BULK_DELIVERY_CONCURRENCY = 3;

/**
 * Sets delivery for every selected entity through the single-entity endpoint,
 * so each write keeps its own audit row and undo. One failure never hides the
 * others: every entity is reported as changed, unchanged or failed.
 */
export async function setDeliveryForMany(
  targets: BulkDeliveryTarget[],
  accountId: string,
  status: DeliveryStatus,
): Promise<BulkDeliveryOutcome> {
  const outcome: BulkDeliveryOutcome = { changed: [], unchanged: [], failed: [] };
  const queue = [...targets];
  const worker = async () => {
    for (let target = queue.shift(); target; target = queue.shift()) {
      try {
        const result = await setEntityDelivery(target.level, target.entityId, accountId, status);
        if (result.changed) {
          outcome.changed.push({ entityId: target.entityId, auditEventId: result.audit_event_id });
        } else {
          outcome.unchanged.push(target.entityId);
        }
      } catch (error) {
        outcome.failed.push({
          entityId: target.entityId,
          error: error instanceof Error ? error.message : 'The change could not be confirmed.',
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BULK_DELIVERY_CONCURRENCY, targets.length) }, worker));
  return outcome;
}

/** Reverses each recorded action; reports how many could not be undone. */
export async function undoActions(auditEventIds: number[]): Promise<{ failed: number; error: string }> {
  let failed = 0;
  let error = '';
  for (const id of auditEventIds) {
    try {
      await undoAction(id);
    } catch (cause) {
      failed += 1;
      error ||= cause instanceof Error ? cause.message : 'Undo could not be confirmed.';
    }
  }
  return { failed, error };
}

/**
 * The written result of a bulk delivery change, e.g.
 * "Paused 4 of 5 campaigns. 1 failed: Rate limit reached."
 */
export function describeBulkDelivery(
  outcome: BulkDeliveryOutcome,
  status: DeliveryStatus,
  noun: { singular: string; plural: string },
  skipped = 0,
): string {
  const total = outcome.changed.length + outcome.unchanged.length + outcome.failed.length + skipped;
  const done = outcome.changed.length + outcome.unchanged.length;
  const verb = status === 'PAUSED' ? 'Paused' : 'Resumed';
  const parts = [`${verb} ${done} of ${total} ${total === 1 ? noun.singular : noun.plural}.`];
  if (outcome.failed.length > 0) {
    parts.push(`${outcome.failed.length} failed: ${outcome.failed[0].error}`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped: delivery cannot be changed from here.`);
  }
  if (outcome.changed.length > 0) {
    parts.push('Stored Meta data still shows the previous value until its next sync.');
  }
  return parts.join(' ');
}
