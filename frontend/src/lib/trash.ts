import { apiRequest } from '@/lib/api';

export type DeletedKind = 'rule' | 'rule_group';

/** A deleted rule or group, restorable until `purge_at`. */
export interface DeletedItem {
  id: number;
  kind: DeletedKind;
  entity_id: number;
  name: string;
  deleted_at: string;
  purge_at: string;
  deleted_by: string;
}

export interface RestoreResult {
  kind: DeletedKind;
  entity_id: number;
  name: string;
  /** Ad accounts a restored rule could not return to. */
  skipped_account_ids: string[];
  /** Rules of a restored group that are themselves deleted. */
  missing_rule_ids: number[];
}

/** Deleted items stay restorable for this long; the server enforces it. */
export const TRASH_RETENTION_DAYS = 30;

export function fetchDeletedItems(): Promise<DeletedItem[]> {
  return apiRequest<DeletedItem[]>('/api/deleted-items');
}

export function restoreDeletedItem(itemId: number): Promise<RestoreResult> {
  return apiRequest<RestoreResult>(`/api/deleted-items/${itemId}/restore`, { method: 'POST' });
}

/** What a restore could not bring back, in words, or '' when it all came back. */
export function describeRestoreGaps(result: RestoreResult): string {
  const accounts = result.skipped_account_ids.length;
  const rules = result.missing_rule_ids.length;
  if (accounts > 0) {
    return `${accounts} ${accounts === 1 ? 'ad account' : 'ad accounts'} could not take it back: the account is gone or now runs a rule it would contradict.`;
  }
  if (rules > 0) {
    return `${rules} of its ${rules === 1 ? 'rule is' : 'rules are'} still deleted and did not come back with it.`;
  }
  return '';
}
