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
