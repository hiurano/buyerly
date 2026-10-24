import { sanitizeFilterClauses, type FilterClause } from '@/components/filters/filterModel';

export type SortDirection = 'asc' | 'desc';
export type ListLayout = 'list' | 'board';

/**
 * One list page's view, as Linear remembers it for each view (#385): layout,
 * grouping with its group order and hidden groups, ordering with its
 * direction, empty groups, display properties and filters. Each page gives
 * its defaults; the saved copy lives on the server per member (see
 * `useListView`) and filters also travel in the address.
 */
export interface ListViewSettings {
  layout: ListLayout;
  grouping: string;
  subGrouping: string;
  ordering: string;
  direction: SortDirection;
  /** Per grouping, the group ids in the order the member dragged them (Linear's Group ordering). */
  groupOrder: Record<string, string[]>;
  /** Per grouping, the groups the member hid with the eye in Group ordering. */
  hiddenGroups: Record<string, string[]>;
  showEmptyGroups: boolean;
  /** Board's "Show empty rows": bands of Rows with no cards. */
  showEmptySubGroups: boolean;
  properties: Record<string, boolean>;
  filters: FilterClause[];
}

export type ListViewDefaults = Pick<ListViewSettings, 'grouping' | 'ordering' | 'direction' | 'properties'> &
  Partial<ListViewSettings>;

export function listViewDefaults(defaults: ListViewDefaults): ListViewSettings {
  return {
    layout: 'list',
    subGrouping: 'none',
    groupOrder: {},
    hiddenGroups: {},
    showEmptyGroups: false,
    showEmptySubGroups: false,
    filters: [],
    ...defaults,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanIds = (value: unknown): Record<string, string[]> => {
  if (!isObject(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(value).slice(0, 20)) {
    if (!Array.isArray(ids)) continue;
    const clean = ids.filter((id): id is string => typeof id === 'string' && id.length <= 200).slice(0, 200);
    if (clean.length) result[key] = clean;
  }
  return result;
};

/** A saved view over the page's defaults; anything unknown or malformed falls back to them. */
export function readListView(stored: unknown, defaults: ListViewSettings): ListViewSettings {
  if (!isObject(stored)) return defaults;
  const text = (key: keyof ListViewSettings) =>
    typeof stored[key] === 'string' && (stored[key] as string).length <= 64 ? (stored[key] as string) : (defaults[key] as string);
  const properties = { ...defaults.properties };
  if (isObject(stored.properties)) {
    for (const key of Object.keys(properties)) {
      if (typeof stored.properties[key] === 'boolean') properties[key] = stored.properties[key] as boolean;
    }
  }
  return {
    layout: stored.layout === 'board' || stored.layout === 'list' ? stored.layout : defaults.layout,
    grouping: text('grouping'),
    subGrouping: text('subGrouping'),
    ordering: text('ordering'),
    direction: stored.direction === 'asc' || stored.direction === 'desc' ? stored.direction : defaults.direction,
    groupOrder: 'groupOrder' in stored ? cleanIds(stored.groupOrder) : defaults.groupOrder,
    hiddenGroups: 'hiddenGroups' in stored ? cleanIds(stored.hiddenGroups) : defaults.hiddenGroups,
    showEmptyGroups: typeof stored.showEmptyGroups === 'boolean' ? stored.showEmptyGroups : defaults.showEmptyGroups,
    showEmptySubGroups: typeof stored.showEmptySubGroups === 'boolean' ? stored.showEmptySubGroups : defaults.showEmptySubGroups,
    properties,
    filters: 'filters' in stored ? sanitizeFilterClauses(stored.filters) : defaults.filters,
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Whether Display options differ from the page's defaults. As in Linear,
 * filters do not count: they have their own Clear.
 */
export function displayDiffers(view: ListViewSettings, defaults: ListViewSettings): boolean {
  return (Object.keys(defaults) as (keyof ListViewSettings)[])
    .some((key) => key !== 'filters' && !same(view[key], defaults[key]));
}

/** Header click: the same column turns the direction round, another one sorts by it in its natural direction. */
export function sortByColumn(
  view: ListViewSettings,
  columnId: string,
  naturalDirection: SortDirection,
): Partial<ListViewSettings> {
  if (view.ordering === columnId) return { direction: view.direction === 'asc' ? 'desc' : 'asc' };
  return { ordering: columnId, direction: naturalDirection };
}

export interface ViewGroup<T> {
  id: string;
  label: string;
  rows: T[];
}

/**
 * Groups in the member's order, without the hidden ones, and without empty
 * ones unless Show empty groups is on. Groups the member never moved keep
 * their natural place after the moved ones, in their natural order.
 */
export function arrangeGroups<G extends { id: string; rows: unknown[] }>(
  groups: G[],
  view: Pick<ListViewSettings, 'grouping' | 'groupOrder' | 'hiddenGroups' | 'showEmptyGroups'>,
  options: { allowEmpty?: boolean } = {},
): G[] {
  return orderGroups(groups, view).filter((group) =>
    !(view.hiddenGroups[view.grouping] ?? []).includes(group.id)
    && (group.rows.length > 0 || (options.allowEmpty !== false && view.showEmptyGroups)),
  );
}

/** Every group, hidden ones included, in the member's order: Group ordering lists them all. */
export function orderGroups<G extends { id: string }>(
  groups: G[],
  view: Pick<ListViewSettings, 'grouping' | 'groupOrder'>,
): G[] {
  const order = view.groupOrder[view.grouping] ?? [];
  if (order.length === 0) return groups;
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => rank(left.group.id) - rank(right.group.id) || left.index - right.index)
    .map(({ group }) => group);
}

/**
 * A board always has columns, as Linear's Columns offers no "No grouping":
 * a view grouped by nothing shows its board by the page's fallback.
 */
export const boardGrouping = (grouping: string, fallback: string) => (grouping === 'none' ? fallback : grouping);

/**
 * Grouping and Sub-grouping (a board's Columns and Rows) never show the same
 * property, as Linear's: picking in one what the other shows hands the other
 * this one's old value. Rows taken from columns that had no rows to swap with
 * leave the columns on the first other option, as columns never go ungrouped.
 */
export function groupingChange(
  which: 'grouping' | 'subGrouping',
  value: string,
  current: Pick<ListViewSettings, 'grouping' | 'subGrouping'>,
  options: { value: string }[],
): Partial<ListViewSettings> {
  const other = which === 'grouping' ? 'subGrouping' : 'grouping';
  if (value === 'none' || value !== current[other]) return { [which]: value };
  const previous = current[which];
  const handed = previous !== 'none' || which === 'grouping'
    ? previous
    : options.find((option) => option.value !== 'none' && option.value !== value)?.value ?? 'none';
  return { [which]: value, [other]: handed };
}

/**
 * Board columns in the member's order: the shown ones, and the rest for
 * Linear's "Hidden columns" lane — hidden with "Hide column", or empty while
 * Show empty columns is off.
 */
export function arrangeBoardColumns<G extends { id: string; rows: unknown[] }>(
  groups: G[],
  view: Pick<ListViewSettings, 'grouping' | 'groupOrder' | 'hiddenGroups' | 'showEmptyGroups'>,
): { shown: G[]; hidden: { group: G; hiddenByMember: boolean }[] } {
  const hiddenIds = view.hiddenGroups[view.grouping] ?? [];
  const shown: G[] = [];
  const hidden: { group: G; hiddenByMember: boolean }[] = [];
  for (const group of orderGroups(groups, view)) {
    const hiddenByMember = hiddenIds.includes(group.id);
    if (hiddenByMember || (group.rows.length === 0 && !view.showEmptyGroups)) hidden.push({ group, hiddenByMember });
    else shown.push(group);
  }
  return { shown, hidden };
}

/** Hides one group of the current grouping, or brings it back. */
export function toggleHiddenGroup(view: Pick<ListViewSettings, 'grouping' | 'hiddenGroups'>, id: string): Partial<ListViewSettings> {
  const hidden = view.hiddenGroups[view.grouping] ?? [];
  return {
    hiddenGroups: {
      ...view.hiddenGroups,
      [view.grouping]: hidden.includes(id) ? hidden.filter((entry) => entry !== id) : [...hidden, id],
    },
  };
}
