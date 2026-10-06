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
  /** What was recorded with the event; a rule's result carries `campaign_id`. */
  details?: Record<string, unknown>;
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

/**
 * Plain names for what the automation and the buyer did. The raw action is
 * too coarse here: a stop candidate, a cooldown skip and the stop itself all
 * carry action STOP. Budget titles stay neutral because a manual budget edit
 * records the same event types as a rule.
 */
const AUDIT_EVENT_TITLES: Record<string, string> = {
  STOP: 'Turned off',
  AUTO_REACTIVATE: 'Turned on',
  MANUAL_PAUSE: 'Turned off manually',
  MANUAL_REACTIVATE: 'Turned on manually',
  INCREASE_BUDGET: 'Budget raised',
  DECREASE_BUDGET: 'Budget lowered',
  NOTIFY_ONLY: 'Rule alert',
  PROPOSE_REACTIVATE: 'Suggested turning on',
  STOP_CONFIRMATION_STARTED: 'Rechecking before turning off',
  RULE_ACTION_COOLDOWN: "Skipped during the rule's pause",
  RULE_ACTION_PENDING: 'Waiting for Meta',
  RULE_ACTION_RECONCILED: 'Confirmed with Meta',
  UNDO_ACTION: 'Undone',
  UNDO_ACTION_FAILED: 'Undo failed',
  ACCOUNT_DAY_STARTED: 'New day in the ad account',
  ACCOUNT_HEALTH_ALERT: 'Ad account needs attention',
  ACCOUNT_HEALTH_RECOVERED: 'Ad account is back to normal',
  ACCOUNT_ISSUE: 'Ad account issue',
  TOKEN_EXPIRED: 'Meta access expired',
  DELETE_RULE_PRESET: 'Rule deleted',
  RESTORE_RULE_PRESET: 'Rule restored',
  ASSISTANT_CREATE_RULE: 'AI assistant created a rule',
  ASSISTANT_ATTACH_RULE: 'AI assistant attached a rule',
  ASSISTANT_DETACH_RULE: 'AI assistant detached a rule',
};

/** The Notification type filter names event types the way the rows title them. */
export function auditEventTypeTitle(eventType: string): string {
  return AUDIT_EVENT_TITLES[eventType] ?? humanizeAuditValue(eventType);
}

export const KNOWN_AUDIT_EVENT_TYPES = Object.keys(AUDIT_EVENT_TITLES);

export function auditEventTitle(event: AuditEventItem): string {
  return (
    AUDIT_EVENT_TITLES[event.event_type] ??
    humanizeAuditValue(event.action || event.event_type || event.category)
  );
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

const ADS_MANAGER_ENTITIES: Record<string, string> = { campaign: 'campaigns', adset: 'adsets', ad: 'ads' };

/**
 * Where a notification's rule, campaign and ad set or ad open: their rows in
 * Rules and Ads Manager, at the record addresses search uses. A link is left
 * out when the event does not name the record, e.g. the campaign of an ad set
 * alert recorded before campaign ids were kept.
 */
export function auditEventPaths(
  workspace: string,
  event: AuditEventItem,
): { rule?: string; campaign?: string; entity?: string } {
  const paths: { rule?: string; campaign?: string; entity?: string } = {};
  if (event.rule_id !== null) paths.rule = `/${workspace}/rules/${event.rule_id}`;
  if (!event.account_id) return paths;
  const account = `?account=${encodeURIComponent(event.account_id)}`;
  const recorded = event.details?.campaign_id;
  const campaignId = event.entity_level === 'campaign'
    ? event.entity_id
    : typeof recorded === 'string' ? recorded : '';
  if (campaignId) paths.campaign = `/${workspace}/ads-manager/campaigns/${encodeURIComponent(campaignId)}${account}`;
  const level = event.entity_level ?? '';
  if (event.entity_id && level !== 'campaign' && ADS_MANAGER_ENTITIES[level]) {
    paths.entity = `/${workspace}/ads-manager/${ADS_MANAGER_ENTITIES[level]}/${encodeURIComponent(event.entity_id)}${account}`;
  }
  return paths;
}

/** The row's second line: which campaign, ad set or ad, then what was recorded. */
export function auditEventSummary(event: AuditEventItem): string {
  const entity = event.entity_name || event.adset_name;
  if (!event.message) return auditEventTarget(event);
  return entity ? `${entity} · ${event.message}` : event.message;
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
