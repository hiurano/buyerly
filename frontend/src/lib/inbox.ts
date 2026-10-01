import { apiRequest } from './api';
import type { AuditEventItem } from './audit';

/** A workspace event as one person's Inbox notification, like Linear's. */
export interface InboxItem extends AuditEventItem {
  is_read: boolean;
  snoozed_until: string | null;
  /** When the snooze ran out, while the notification waits unread on top. */
  unsnoozed_at: string | null;
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

/** Inbox header toggles and Display options, as in Linear. */
export interface InboxDisplay {
  unreadOnly: boolean;
  ordering: InboxOrdering;
  showSnoozed: boolean;
  unreadFirst: boolean;
}

export const DEFAULT_INBOX_DISPLAY: InboxDisplay = {
  unreadOnly: false,
  ordering: 'newest',
  showSnoozed: false,
  unreadFirst: false,
};

interface InboxDisplayPayload {
  unread_only: boolean;
  ordering: InboxOrdering;
  show_snoozed: boolean;
  unread_first: boolean;
}

function inboxDisplayFromPayload(payload: Partial<InboxDisplayPayload> | null): InboxDisplay {
  return {
    unreadOnly: payload?.unread_only === true,
    ordering: payload?.ordering === 'oldest' ? 'oldest' : 'newest',
    showSnoozed: payload?.show_snoozed === true,
    unreadFirst: payload?.unread_first === true,
  };
}

/** Linear remembers Display options for each member of a workspace, on every device. */
export async function fetchInboxDisplay(): Promise<InboxDisplay> {
  return inboxDisplayFromPayload(await apiRequest<InboxDisplayPayload>('/api/inbox/display'));
}

export async function saveInboxDisplay(display: InboxDisplay): Promise<InboxDisplay> {
  const payload: InboxDisplayPayload = {
    unread_only: display.unreadOnly,
    ordering: display.ordering,
    show_snoozed: display.showSnoozed,
    unread_first: display.unreadFirst,
  };
  return inboxDisplayFromPayload(await apiRequest<InboxDisplayPayload>('/api/inbox/display', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }));
}

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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 4.35 * WEEK_MS;
const YEAR_MS = 12 * MONTH_MS;

type DistanceUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const SHORT_UNITS: Record<DistanceUnit, string> = {
  minute: 'min', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y',
};

/** Linear rounds a part up once it is two thirds of the way to the next one. */
function roundTwoThirds(value: number): number {
  const whole = Math.floor(value);
  return Math.max(1, whole + (value - whole >= 0.66 ? 1 : 0));
}

/** Linear's distance between two times as [amount, unit], or null under a minute. */
function linearDistance(ms: number): [number, DistanceUnit] | null {
  if (ms < MINUTE_MS) return null;
  if (ms < HOUR_MS) {
    const minutes = Math.round(ms / MINUTE_MS);
    return minutes === 60 ? [1, 'hour'] : [minutes, 'minute'];
  }
  if (ms < 8 * HOUR_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.round((ms - hours * HOUR_MS) / MINUTE_MS);
    return [minutes >= 0.66 * 60 ? hours + 1 : hours, 'hour'];
  }
  if (ms < DAY_MS) return [Math.round(ms / HOUR_MS), 'hour'];
  if (ms < 5 * DAY_MS) {
    const days = Math.floor(ms / DAY_MS);
    const hours = Math.round((ms - days * DAY_MS) / HOUR_MS);
    return [hours >= 0.66 * 24 ? days + 1 : days, 'day'];
  }
  if (ms < MONTH_MS) {
    const days = Math.round(ms / DAY_MS);
    return days % 7 === 0 ? [days / 7, 'week'] : [days, 'day'];
  }
  if (ms < 10 * WEEK_MS) return [roundTwoThirds(ms / WEEK_MS), 'week'];
  if (ms < YEAR_MS) {
    const months = roundTwoThirds(ms / MONTH_MS);
    return months === 12 ? [1, 'year'] : [months, 'month'];
  }
  return [roundTwoThirds(ms / YEAR_MS), 'year'];
}

/** "Snoozed for 59min", "Snoozed for 2d", "Snoozed for 3w"; under a minute Linear says "Snoozed for now". */
export function formatSnoozedFor(value: string, now: number = Date.now()): string {
  const distance = linearDistance(Math.abs(Date.parse(value) - now));
  return `Snoozed for ${distance ? `${distance[0]}${SHORT_UNITS[distance[1]]}` : 'now'}`;
}

/** "Unsnoozed just now", "Unsnoozed 2 minutes ago", "Unsnoozed 1 day ago". */
export function formatUnsnoozedAgo(value: string, now: number = Date.now()): string {
  const distance = linearDistance(Math.abs(now - Date.parse(value)));
  if (!distance) return 'Unsnoozed just now';
  const [amount, unit] = distance;
  return `Unsnoozed ${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
}

/** The hover title on those lines: "Oct 3, 9:00 AM", with the year when it is not this one. */
export function formatInboxMoment(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${new Intl.DateTimeFormat('en-US', options).format(date)}, ${time}`;
}

/** Linear's command search: the letters in order, anywhere ("uz" finds "Unsnooze"). */
export function matchesTyped(label: string, typed: string): boolean {
  const letters = typed.trim().toLowerCase().replace(/\s+/g, '');
  if (!letters) return true;
  const text = label.toLowerCase();
  let position = 0;
  for (const letter of letters) {
    position = text.indexOf(letter, position) + 1;
    if (position === 0) return false;
  }
  return true;
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

export { formatSnoozeTime } from './snoozeQuery';
