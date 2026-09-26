import { apiRequest } from './api';

export interface AuditEventItem {
  id: number;
  workspace_id: number | null;
  actor_type: string;
  actor_id: string | null;
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
  correlation_id: string | null;
  reverts_event_id: number | null;
  reverted_by_event_id: number | null;
  is_reverted: boolean;
  display_status: string;
  can_undo: boolean;
  undo_reason: string;
  duration_ms: number | null;
  created_at: string;
}

export interface AuditEventListResponse {
  items: AuditEventItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  status_counts: Record<string, number>;
}

export interface AuditUndoResponse {
  success: boolean;
  already_reverted: boolean;
  original_event_id: number;
  reversal_event_id: number;
  message: string;
}

export type AuditInboxFilter = 'all' | 'error' | 'reverted';

interface AuditEventQuery {
  page: number;
  pageSize?: number;
  filter?: AuditInboxFilter;
  search?: string;
}

export function fetchAuditEvents({
  page,
  pageSize = 25,
  filter = 'all',
  search = '',
}: AuditEventQuery): Promise<AuditEventListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (filter === 'error') params.set('status', 'ERROR');
  if (filter === 'reverted') params.set('status', 'REVERTED');
  if (search.trim()) params.set('search', search.trim());
  return apiRequest<AuditEventListResponse>(`/api/audit-events?${params.toString()}`);
}

export function undoAuditEvent(eventId: number): Promise<AuditUndoResponse> {
  return apiRequest<AuditUndoResponse>(`/api/audit-events/${eventId}/undo`, {
    method: 'POST',
  });
}

export function humanizeAuditValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'Unknown';
  return normalized
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function auditEventTitle(event: AuditEventItem): string {
  return humanizeAuditValue(event.action || event.event_type || event.category);
}

const UNDO_ENTITY_NOUNS: Record<string, string> = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };

/** Undoing a rule's action also keeps the rules from repeating it on that entity until the day ends. */
export function auditUndoHint(event: AuditEventItem): string {
  const restore = 'Buyerly will ask Meta to restore the state recorded before this action.';
  if (event.category !== 'RULE_ACTION' || event.actor_type !== 'system') return restore;
  const noun = UNDO_ENTITY_NOUNS[event.entity_level || 'adset'] ?? 'ad set';
  return `${restore} Rules won't repeat it on this ${noun} today.`;
}

export function auditEventTarget(event: AuditEventItem): string {
  return (
    event.entity_name ||
    event.adset_name ||
    event.account_name ||
    event.entity_id ||
    event.adset_id ||
    event.account_id ||
    'Workspace event'
  );
}

export function formatAuditRelativeTime(value: string, now: number = Date.now()): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Unknown time';
  const elapsed = Math.max(0, now - parsed);
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

export function formatAuditTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Timestamp unavailable';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}
