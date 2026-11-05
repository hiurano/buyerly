// Which audit events can be undone, and when (core/action_undo.py). The undo
// itself talks to Meta and moves with the Meta client; what the history shows
// about it (the Activity page, Inbox) is decided here, from the rows alone.

export const UNDO_WINDOW_SECONDS = 24 * 60 * 60;

export const REVERSIBLE_EVENT_TYPES = new Set([
  'STOP',
  'AUTO_REACTIVATE',
  'MANUAL_REACTIVATE',
  'MANUAL_PAUSE',
  'INCREASE_BUDGET',
  'DECREASE_BUDGET',
]);

// Events that change an entity on Meta: the latest of them is the only one
// that can still be undone.
export const MUTATING_EVENT_TYPES = new Set([...REVERSIBLE_EVENT_TYPES, 'UNDO_ACTION']);

export const ENTITY_NOUNS: Record<string, string> = { adset: 'ad set', campaign: 'campaign', ad: 'ad' };

export interface UndoTarget {
  entity_level?: string | null;
  entity_id?: string | null;
  adset_id?: string | null;
}

// The level the event acted on; rows written before #124 are ad set actions.
export function undoEntityLevel(event: UndoTarget): string {
  const level = event.entity_level || 'adset';
  return level in ENTITY_NOUNS ? level : 'adset';
}

// The entity the event acted on, falling back to the pre-#124 ad set column.
export function undoEntityId(event: UndoTarget): string {
  return event.entity_id || event.adset_id || '';
}

// SQL mirror of undoEntityId over audit_events (`alias.` prefix optional).
export function undoEntityIdSql(alias = ''): string {
  return `coalesce(nullif(${alias}entity_id, ''), ${alias}adset_id)`;
}

export function withinUndoWindow(createdAt: Date | null, now = Date.now()): boolean {
  if (!createdAt) return false;
  const created = createdAt.getTime() / 1000;
  return created > 0 && now / 1000 - created <= UNDO_WINDOW_SECONDS;
}
