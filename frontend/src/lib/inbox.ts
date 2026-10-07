import { apiRequest } from './api';
import type { AuditEventItem } from './audit';

/**
 * Kinds of notification, in the order Focus grouping shows them. They stand in
 * for Linear's kinds (Urgent, Mentions & replies, …), which ad events do not
 * have; the server decides which kind each event is.
 */
export const INBOX_KINDS = [
  'urgent',
  'rule_alerts',
  'rule_actions',
  'assistant',
  'manual',
  'team',
  'system',
] as const;
export type InboxKind = typeof INBOX_KINDS[number];

export const INBOX_KIND_LABELS: Record<InboxKind, string> = {
  urgent: 'Urgent',
  rule_alerts: 'Rule alerts',
  rule_actions: 'Rule actions',
  assistant: 'AI assistant',
  manual: 'Manual changes',
  team: 'Team',
  system: 'System',
};

/** A workspace event as one person's Inbox notification, like Linear's. */
export interface InboxItem extends AuditEventItem {
  is_read: boolean;
  snoozed_until: string | null;
  /** When the snooze ran out, while the notification waits unread on top. */
  unsnoozed_at: string | null;
  kind: InboxKind;
}

/** Unread notifications in all and in the priority inbox, sent back with every Inbox answer. */
export interface InboxUnread {
  unread_count: number;
  priority_unread_count?: number;
}

export interface InboxListResponse extends InboxUnread {
  items: InboxItem[];
  has_more: boolean;
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

/**
 * A priority inbox custom filter: Linear's chips over Notification type and
 * From, all of which must match.
 */
export type InboxPriorityRule = Array<InboxFilterClause & { field: 'type' | 'from' }>;

export interface InboxActionResponse extends InboxUnread {
  success: boolean;
}

export type InboxOrdering = 'newest' | 'oldest';
export type InboxGrouping = 'none' | 'focus';
/** Linear's Badge count: Priority & Other, Priority only, None. */
export type InboxBadgeCount = 'all' | 'priority' | 'none';
export type InboxTab = 'priority' | 'other';

/** Inbox header toggles and Display options, as in Linear. */
export interface InboxDisplay {
  unreadOnly: boolean;
  ordering: InboxOrdering;
  showSnoozed: boolean;
  unreadFirst: boolean;
  grouping: InboxGrouping;
  priorityInbox: boolean;
  priorityKinds: InboxKind[];
  priorityRules: InboxPriorityRule[];
  badgeCount: InboxBadgeCount;
}

export const DEFAULT_INBOX_DISPLAY: InboxDisplay = {
  unreadOnly: false,
  ordering: 'newest',
  showSnoozed: false,
  unreadFirst: false,
  grouping: 'none',
  priorityInbox: false,
  // Linear starts with every kind in the priority inbox.
  priorityKinds: [...INBOX_KINDS],
  priorityRules: [],
  badgeCount: 'all',
};

interface InboxDisplayPayload {
  unread_only: boolean;
  ordering: InboxOrdering;
  show_snoozed: boolean;
  unread_first: boolean;
  grouping: InboxGrouping;
  priority_inbox: boolean;
  priority_kinds: InboxKind[];
  priority_rules: InboxPriorityRule[];
  badge_count: InboxBadgeCount;
}

function inboxDisplayFromPayload(payload: Partial<InboxDisplayPayload> | null): InboxDisplay {
  const kinds = payload?.priority_kinds;
  return {
    unreadOnly: payload?.unread_only === true,
    ordering: payload?.ordering === 'oldest' ? 'oldest' : 'newest',
    showSnoozed: payload?.show_snoozed === true,
    unreadFirst: payload?.unread_first === true,
    grouping: payload?.grouping === 'focus' ? 'focus' : 'none',
    priorityInbox: payload?.priority_inbox === true,
    priorityKinds: Array.isArray(kinds)
      ? INBOX_KINDS.filter((kind) => kinds.includes(kind))
      : [...INBOX_KINDS],
    priorityRules: Array.isArray(payload?.priority_rules) ? payload.priority_rules : [],
    badgeCount: payload?.badge_count === 'priority' || payload?.badge_count === 'none'
      ? payload.badge_count
      : 'all',
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
    grouping: display.grouping,
    priority_inbox: display.priorityInbox,
    priority_kinds: display.priorityKinds,
    priority_rules: display.priorityRules,
    badge_count: display.badgeCount,
  };
  return inboxDisplayFromPayload(await apiRequest<InboxDisplayPayload>('/api/inbox/display', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }));
}

/** The number next to Inbox in the sidebar and in the tab title, by Linear's Badge count. */
export function inboxBadgeCount(display: InboxDisplay, unreadCount: number, priorityUnreadCount: number): number {
  if (!display.priorityInbox || display.badgeCount === 'all') return unreadCount;
  if (display.badgeCount === 'none') return 0;
  return priorityUnreadCount;
}

/** What goes in the priority inbox: the chosen kinds, and whatever a custom filter matches. */
export interface InboxPriority {
  kinds: InboxKind[];
  rules: InboxPriorityRule[];
}

/** Which priority inbox tab the list shows, with what goes in it. */
export function inboxTabQuery(
  display: InboxDisplay,
  tab: InboxTab | null,
): Pick<InboxQuery, 'tab' | 'priority'> {
  if (!display.priorityInbox || !tab) return {};
  return { tab, priority: { kinds: display.priorityKinds, rules: display.priorityRules } };
}

export interface InboxQuery {
  offset: number;
  limit?: number;
  ordering: InboxOrdering;
  unreadOnly: boolean;
  showSnoozed: boolean;
  unreadFirst: boolean;
  filters?: InboxFilterClause[];
  tab?: InboxTab;
  priority?: InboxPriority;
}

export const INBOX_PAGE_SIZE = 50;

function setTabParams(params: URLSearchParams, { tab, priority }: Pick<InboxQuery, 'tab' | 'priority'>) {
  if (tab) params.set('tab', tab);
  if (priority) params.set('priority', JSON.stringify(priority));
}

export function fetchInbox({
  offset,
  limit = INBOX_PAGE_SIZE,
  ordering,
  unreadOnly,
  showSnoozed,
  unreadFirst,
  filters = [],
  tab,
  priority,
}: InboxQuery): Promise<InboxListResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    ordering,
  });
  if (unreadOnly) params.set('unread_only', 'true');
  if (showSnoozed) params.set('show_snoozed', 'true');
  if (unreadFirst) params.set('unread_first', 'true');
  setTabParams(params, { tab, priority });
  if (filters.length) params.set('filter', JSON.stringify(filters));
  return apiRequest<InboxListResponse>(`/api/inbox?${params.toString()}`);
}

export function fetchInboxFacets(
  unreadOnly: boolean,
  showSnoozed: boolean,
  tab: Pick<InboxQuery, 'tab' | 'priority'> = {},
): Promise<InboxFacets> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread_only', 'true');
  if (showSnoozed) params.set('show_snoozed', 'true');
  setTabParams(params, tab);
  return apiRequest<InboxFacets>(`/api/inbox/facets?${params.toString()}`);
}

/** Someone a notification can be from: a member, a rule or Buyerly itself. */
export interface InboxSender {
  value: string;
  label: string;
  kind: 'user' | 'rule' | 'buyerly';
}

/** Everyone in the workspace a notification can be from, whether or not anything came from them yet. */
export function fetchInboxSenders(): Promise<InboxSender[]> {
  return apiRequest<InboxSender[]>('/api/inbox/senders');
}

interface FocusNode {
  id: string;
  label: string;
  /** Kinds that land here; a node without them takes anything its children do not. */
  kinds?: InboxKind[];
  minCountToShow?: number;
  mergeTrailingSingletons?: boolean;
  children?: FocusNode[];
}

/** Linear's Focus tree (Urgent, …, Other with small groups inside), over Buyerly's kinds. */
const FOCUS_TREE: FocusNode[] = [
  { id: 'urgent', label: 'Urgent', kinds: ['urgent'] },
  { id: 'rule_alerts', label: 'Rule alerts', kinds: ['rule_alerts'] },
  { id: 'rule_actions', label: 'Rule actions', kinds: ['rule_actions'] },
  {
    id: 'other',
    label: 'Other',
    mergeTrailingSingletons: true,
    children: (['assistant', 'manual', 'team', 'system'] as const).map((kind) => ({
      id: kind,
      label: INBOX_KIND_LABELS[kind],
      kinds: [kind],
      minCountToShow: 2,
    })),
  },
];

export interface InboxGroup {
  id: string;
  label: string;
  items: InboxItem[];
}

type FocusBuckets = Map<string, InboxItem[]>;

function placeInFocusTree(item: InboxItem, nodes: FocusNode[]): FocusNode | undefined {
  for (const node of nodes) {
    if (node.kinds && !node.kinds.includes(item.kind)) continue;
    return (node.children && placeInFocusTree(item, node.children)) || node;
  }
  return undefined;
}

function countIn(node: FocusNode, buckets: FocusBuckets): number {
  return (buckets.get(node.id)?.length ?? 0)
    + (node.children ?? []).reduce((total, child) => total + countIn(child, buckets), 0);
}

function itemsIn(node: FocusNode, buckets: FocusBuckets): InboxItem[] {
  return [...(buckets.get(node.id) ?? []), ...(node.children ?? []).flatMap((child) => itemsIn(child, buckets))];
}

function childrenTooSmall(node: FocusNode, buckets: FocusBuckets): boolean {
  return (node.children ?? []).every((child) => countIn(child, buckets) < (child.minCountToShow ?? 1));
}

function shownOnItsOwn(node: FocusNode, buckets: FocusBuckets): boolean {
  return !childrenTooSmall(node, buckets) || countIn(node, buckets) >= (node.minCountToShow ?? 1);
}

/** A group with one non-empty child takes that child's name, as Linear does. */
function onlyChild(node: FocusNode, buckets: FocusBuckets): FocusNode | undefined {
  if (!node.children?.length || (buckets.get(node.id)?.length ?? 0) > 0) return undefined;
  const filled = node.children.filter((child) => countIn(child, buckets) > 0);
  if (filled.length !== 1) return undefined;
  return onlyChild(filled[0], buckets) ?? filled[0];
}

function trailingSingletons(children: FocusNode[], buckets: FocusBuckets): Set<FocusNode> {
  const merged = new Set<FocusNode>();
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const count = countIn(children[index], buckets);
    if (count === 0) continue;
    if (count > 1 || shownOnItsOwn(children[index], buckets)) break;
    merged.add(children[index]);
  }
  return merged.size > 1 ? merged : new Set();
}

function* wholeGroup(node: FocusNode, buckets: FocusBuckets): Generator<InboxGroup> {
  const items = itemsIn(node, buckets);
  if (items.length === 0) return;
  const named = onlyChild(node, buckets) ?? node;
  yield { id: named.id, label: named.label, items };
}

function* focusGroups(node: FocusNode, buckets: FocusBuckets): Generator<InboxGroup> {
  if (childrenTooSmall(node, buckets)) {
    yield* wholeGroup(node, buckets);
    return;
  }
  const children = node.children ?? [];
  const merged = node.mergeTrailingSingletons ? trailingSingletons(children, buckets) : undefined;
  const folded: FocusNode[] = [];
  for (const child of children) {
    if (shownOnItsOwn(child, buckets)) yield* focusGroups(child, buckets);
    else if (merged && !merged.has(child)) yield* wholeGroup(child, buckets);
    else folded.push(child);
  }
  const own = buckets.get(node.id) ?? [];
  const items = [...own, ...folded.flatMap((child) => itemsIn(child, buckets))];
  if (items.length === 0) return;
  let { id, label } = node;
  const filled = folded.filter((child) => countIn(child, buckets) > 0);
  if (own.length === 0 && filled.length === 1) {
    ({ id, label } = onlyChild(filled[0], buckets) ?? filled[0]);
  }
  yield { id, label, items };
}

function groupUnread(items: InboxItem[]): InboxGroup[] {
  const buckets: FocusBuckets = new Map();
  for (const item of items) {
    const node = placeInFocusTree(item, FOCUS_TREE);
    if (node) buckets.set(node.id, [...(buckets.get(node.id) ?? []), item]);
  }
  const groups = FOCUS_TREE.flatMap((node) => [...focusGroups(node, buckets)]);
  return groups.length === 1 ? [{ ...groups[0], label: 'Unread' }] : groups;
}

/**
 * Linear's "Group unreads by: Focus": unread notifications by kind, read ones
 * last under Read. Read state is taken as first seen, so reading a notification
 * does not move it between groups while the list is open.
 */
export function groupInboxItems(
  items: InboxItem[],
  grouping: InboxGrouping,
  readOnFirstSeen: (item: InboxItem) => boolean,
): InboxGroup[] | null {
  if (grouping !== 'focus') return null;
  const unread = items.filter((item) => !readOnFirstSeen(item));
  const read = items.filter((item) => readOnFirstSeen(item));
  if (unread.length === 0) return null;
  const groups = groupUnread(unread);
  if (read.length > 0) groups.push({ id: 'read', label: 'Read', items: read });
  return groups;
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

export function fetchInboxUnreadCount(): Promise<InboxUnread> {
  return apiRequest<InboxUnread>('/api/inbox/unread-count');
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
