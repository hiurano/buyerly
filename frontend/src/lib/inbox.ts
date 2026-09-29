import { apiRequest } from './api';
import type { AuditEventItem } from './audit';

/** A workspace event as one person's Inbox notification, like Linear's. */
export interface InboxItem extends AuditEventItem {
  is_read: boolean;
  snoozed_until: string | null;
}

export interface InboxListResponse {
  items: InboxItem[];
  has_more: boolean;
  unread_count: number;
  hidden_by_filters: number;
}

/** One Linear-style filter clause, sent to the server as is. */
export interface InboxFilterClause {
  field: 'type' | 'from' | 'account' | 'status';
  operator: 'is' | 'is_not';
  values: string[];
}

export interface InboxFacetValue {
  value: string;
  label?: string;
  count: number;
}

export type InboxFacets = Record<InboxFilterClause['field'], InboxFacetValue[]>;

export interface InboxActionResponse {
  success: boolean;
  unread_count: number;
}

export type InboxOrdering = 'newest' | 'oldest';

export interface InboxQuery {
  offset: number;
  limit?: number;
  ordering: InboxOrdering;
  unreadOnly: boolean;
  showSnoozed: boolean;
  unreadFirst: boolean;
  filters?: InboxFilterClause[];
}

export const INBOX_PAGE_SIZE = 50;

export function fetchInbox({
  offset,
  limit = INBOX_PAGE_SIZE,
  ordering,
  unreadOnly,
  showSnoozed,
  unreadFirst,
  filters = [],
}: InboxQuery): Promise<InboxListResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    ordering,
  });
  if (unreadOnly) params.set('unread_only', 'true');
  if (showSnoozed) params.set('show_snoozed', 'true');
  if (unreadFirst) params.set('unread_first', 'true');
  if (filters.length) params.set('filter', JSON.stringify(filters));
  return apiRequest<InboxListResponse>(`/api/inbox?${params.toString()}`);
}

export function fetchInboxFacets(unreadOnly: boolean, showSnoozed: boolean): Promise<InboxFacets> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread_only', 'true');
  if (showSnoozed) params.set('show_snoozed', 'true');
  return apiRequest<InboxFacets>(`/api/inbox/facets?${params.toString()}`);
}

/** Linear keeps the filter in the address as base64 JSON, so a filtered Inbox can be shared. */
export function encodeInboxFilter(clauses: InboxFilterClause[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(clauses));
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
}

export function decodeInboxFilter(value: string | null): InboxFilterClause[] {
  if (!value) return [];
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((clause): clause is InboxFilterClause =>
      Boolean(clause)
      && ['type', 'from', 'account', 'status'].includes(clause.field)
      && ['is', 'is_not'].includes(clause.operator)
      && Array.isArray(clause.values)
      && clause.values.every((entry: unknown) => typeof entry === 'string'));
  } catch {
    return [];
  }
}

export function fetchInboxUnreadCount(): Promise<{ unread_count: number }> {
  return apiRequest<{ unread_count: number }>('/api/inbox/unread-count');
}

export function markInboxRead(eventId: number, read: boolean): Promise<InboxActionResponse> {
  return apiRequest<InboxActionResponse>(`/api/inbox/${eventId}/read`, {
    method: 'POST',
    body: JSON.stringify({ read }),
  });
}

export function deleteInboxNotification(eventId: number): Promise<InboxActionResponse> {
  return apiRequest<InboxActionResponse>(`/api/inbox/${eventId}/delete`, { method: 'POST' });
}

export function snoozeInboxNotification(eventId: number, until: Date | null): Promise<InboxActionResponse> {
  return apiRequest<InboxActionResponse>(`/api/inbox/${eventId}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ until: until ? until.toISOString() : null }),
  });
}

export function deleteAllInbox(onlyRead: boolean): Promise<InboxActionResponse> {
  return apiRequest<InboxActionResponse>(
    onlyRead ? '/api/inbox/delete-all-read' : '/api/inbox/delete-all',
    { method: 'POST' },
  );
}

/** Linear's short age next to each notification: 5m, 3h, 4d, 2w. */
export function formatInboxAge(value: string, now: number = Date.now()): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  const minutes = Math.floor(Math.max(0, now - parsed) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

export interface SnoozeOption {
  id: string;
  label: string;
  until: Date;
}

function atNine(date: Date): Date {
  const result = new Date(date);
  result.setHours(9, 0, 0, 0);
  return result;
}

/** Linear's snooze choices; the fixed-day ones land at 9:00 local time. */
export function snoozeOptions(now: Date = new Date()): SnoozeOption[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + (((8 - now.getDay()) % 7) || 7));
  const nextMonth = new Date(now);
  nextMonth.setMonth(now.getMonth() + 1);
  return [
    { id: 'hour', label: 'An hour from now', until: new Date(now.getTime() + 3_600_000) },
    { id: 'tomorrow', label: 'Tomorrow', until: atNine(tomorrow) },
    { id: 'week', label: 'Next week', until: atNine(nextMonday) },
    { id: 'month', label: 'A month from now', until: atNine(nextMonth) },
  ];
}

/** "Wed, 30 Sep, 4:05 AM", as Linear labels a snooze time. */
export function formatSnoozeTime(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${weekday}, ${date.getDate()} ${month}, ${time}`;
}
