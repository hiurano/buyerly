// The pure list-view and filter models (#385).
import { describe, expect, it } from 'vitest';
import {
  sanitizeFilterClauses, resolveFilterDate, filterDateLabel, matchesFilterClause, getFilterValueSummary,
} from '@/components/filters/filterModel';
import {
  listViewDefaults, readListView, displayDiffers, sortByColumn, arrangeGroups, orderGroups,
  boardGrouping, arrangeBoardColumns, toggleHiddenGroup,
} from './listView';

const defaults = listViewDefaults({ grouping: 'status', ordering: 'manual', direction: 'asc', properties: { status: true, spend: true } });

const saved = readListView({
  layout: 'board', grouping: 'groups', direction: 'sideways', showEmptyGroups: true,
  properties: { status: false, unknown: true, spend: 'no' },
  groupOrder: { status: ['paused', 'active', 7] }, hiddenGroups: { status: [] },
  filters: [{ fieldId: 'status', operator: 'is', values: ['active'] }, { fieldId: 'x', operator: 'drop_table', values: ['1'] }],
}, defaults);

// Group ordering: the member's order first, unmoved groups after in their natural order; hidden and empty ones drop.
const groups = [
  { id: 'active', rows: [1] }, { id: 'paused', rows: [2] }, { id: 'review', rows: [] }, { id: 'archived', rows: [3] },
];

// Numbers: > ≥ < ≤ against the metric.
const spend = { id: 'spend', label: 'Spend', section: 'metrics', type: 'number', operators: ['gt', 'gte', 'lt', 'lte'], defaultOperator: 'gt', getValue: (row: any) => row.spend };

const row = { spend: 100 };

const columns = [{ id: 'a', rows: [1] }, { id: 'b', rows: [] }, { id: 'c', rows: [2] }];

const boardView = { ...defaults, grouping: 'status', groupOrder: { status: ['c'] }, hiddenGroups: { status: ['a'] } };

const board = arrangeBoardColumns(columns, boardView);

describe('list view and filter model', () => {
  // A saved view falls back to the defaults field by field; junk never gets through.
  it('A saved view falls back to the defaults field by field; junk never gets through', () => {
    expect(readListView(null, defaults)).toStrictEqual(defaults);
    expect(readListView(['x'], defaults)).toStrictEqual(defaults);
    expect(saved.layout).toBe('board');
    expect(saved.grouping).toBe('groups');
    expect(saved.direction).toBe('asc');
    expect(saved.properties).toStrictEqual({ status: false, spend: true });
    expect(saved.groupOrder).toStrictEqual({ status: ['paused', 'active'] });
    expect(saved.hiddenGroups).toStrictEqual({});
    expect(saved.filters).toStrictEqual([{ fieldId: 'status', operator: 'is', values: ['active'] }]);
  });

  // Display options differ from the defaults; filters alone do not count (Linear's Reset ignores them).
  it('Display options differ from the defaults; filters alone do not count (Linear\'s Reset ignores them)', () => {
    expect(displayDiffers(defaults, defaults)).toBe(false);
    expect(displayDiffers({ ...defaults, filters: saved.filters }, defaults)).toBe(false);
    expect(displayDiffers(readListView({ filters: saved.filters }, defaults), defaults), 'a saved filter alone is no change').toBe(false);
    expect(displayDiffers({ ...defaults, direction: 'desc' }, defaults)).toBe(true);
    expect(displayDiffers({ ...defaults, showEmptyGroups: true }, defaults)).toBe(true);
  });

  // A header click turns the direction round on its own column, starts another in its natural direction.
  it('A header click turns the direction round on its own column, starts another in its natural direction', () => {
    expect(sortByColumn({ ...defaults, ordering: 'spend', direction: 'desc' }, 'spend', 'desc')).toStrictEqual({ direction: 'asc' });
    expect(sortByColumn({ ...defaults, ordering: 'spend', direction: 'asc' }, 'name', 'asc')).toStrictEqual({ ordering: 'name', direction: 'asc' });
  });

  // Group ordering: the member's order first, unmoved groups after in their natural order; hidden and empty ones drop.
  it('Group ordering: the member\'s order first, unmoved groups after in their natural order; hidden and empty ones drop', () => {
    const ordered = { ...defaults, groupOrder: { status: ['archived', 'paused'] } };
    expect(orderGroups(groups, ordered).map(g => g.id)).toStrictEqual(['archived', 'paused', 'active', 'review']);
    expect(arrangeGroups(groups, ordered).map(g => g.id)).toStrictEqual(['archived', 'paused', 'active']);
    expect(arrangeGroups(groups, { ...ordered, showEmptyGroups: true }).map(g => g.id)).toStrictEqual(['archived', 'paused', 'active', 'review']);
    expect(arrangeGroups(groups, { ...ordered, showEmptyGroups: true }, { allowEmpty: false }).map(g => g.id)).toStrictEqual(['archived', 'paused', 'active']);
    expect(arrangeGroups(groups, { ...ordered, hiddenGroups: { status: ['paused'] } }).map(g => g.id)).toStrictEqual(['archived', 'active']);
    // Another grouping keeps its own order.
    expect(orderGroups(groups, { ...ordered, grouping: 'rules' }).map(g => g.id)).toStrictEqual(['active', 'paused', 'review', 'archived']);
  });

  // Filters from a link or a saved view: malformed clauses drop, the rest stay.
  it('Filters from a link or a saved view: malformed clauses drop, the rest stay', () => {
    expect(sanitizeFilterClauses('nope')).toStrictEqual([]);
    expect(sanitizeFilterClauses([
      { fieldId: 'spend', operator: 'gte', values: [100] },
      { fieldId: 'spend', operator: 'lt', values: [5] },
      { fieldId: 'name', operator: 'contains', values: ['x'.repeat(201)] },
      { fieldId: 'lastRun', operator: 'after', values: ['-P1W'] },
      { fieldId: 'status', operator: 'is', values: [] },
      { fieldId: '<script>', operator: 'is', values: ['a'] },
    ])).toStrictEqual([
      { fieldId: 'spend', operator: 'gte', values: [100] },
      { fieldId: 'lastRun', operator: 'after', values: ['-P1W'] },
    ]);
  });

  // Dates: Linear's ready-made values count back from now; a picked day starts at local midnight.
  it('Dates: Linear\'s ready-made values count back from now; a picked day starts at local midnight', () => {
    const now = new Date(2026, 9, 11, 15, 0, 0);
    expect(resolveFilterDate('-P1D', now)).toBe(new Date(2026, 9, 10, 15, 0, 0).getTime());
    expect(resolveFilterDate('-P1W', now)).toBe(new Date(2026, 9, 4, 15, 0, 0).getTime());
    expect(resolveFilterDate('-P3M', now)).toBe(new Date(2026, 6, 11, 15, 0, 0).getTime());
    expect(resolveFilterDate('-P1Y', now)).toBe(new Date(2025, 9, 11, 15, 0, 0).getTime());
    expect(resolveFilterDate('2026-09-01', now)).toBe(new Date(2026, 8, 1).getTime());
    expect(filterDateLabel('-P1W')).toBe('1 week ago');
    expect(filterDateLabel('-P2W')).toBe('2 weeks ago');
    expect(filterDateLabel('2026-09-01')).toBe('Sep 1, 2026');
    const dateField = { id: 'lastRun', label: 'Last action', section: 'dates', type: 'date', operators: ['after', 'before'], defaultOperator: 'after', getValue: (row: any) => row.at };
    const recent = { at: new Date(Date.now() - 2 * 86400000).toISOString() };
    const never = { at: null };
    expect(matchesFilterClause(recent, dateField as never, { fieldId: 'lastRun', operator: 'after', values: ['-P1W'] })).toBe(true);
    expect(matchesFilterClause(recent, dateField as never, { fieldId: 'lastRun', operator: 'after', values: ['-P1D'] })).toBe(false);
    expect(matchesFilterClause(recent, dateField as never, { fieldId: 'lastRun', operator: 'before', values: ['-P1D'] })).toBe(true);
    expect(matchesFilterClause(never, dateField as never, { fieldId: 'lastRun', operator: 'after', values: ['-P1Y'] })).toBe(false);
    expect(getFilterValueSummary(dateField as never, { fieldId: 'lastRun', operator: 'after', values: ['-P3M'] })).toBe('3 months ago');
  });

  // Numbers: > ≥ < ≤ against the metric.
  it('Numbers: > ≥ < ≤ against the metric', () => {
    expect(matchesFilterClause(row, spend as never, { fieldId: 'spend', operator: 'gt', values: [100] })).toBe(false);
    expect(matchesFilterClause(row, spend as never, { fieldId: 'spend', operator: 'gte', values: [100] })).toBe(true);
    expect(matchesFilterClause(row, spend as never, { fieldId: 'spend', operator: 'lt', values: [150.5] })).toBe(true);
    expect(matchesFilterClause({ spend: null }, spend as never, { fieldId: 'spend', operator: 'lte', values: [5] })).toBe(false);
    expect(getFilterValueSummary(spend as never, { fieldId: 'spend', operator: 'gt', values: [1500] })).toBe('1,500');
  });

  // The board (Linear's): Columns never "No grouping"; hidden and empty columns wait in Hidden columns.
  it('The board (Linear\'s): Columns never "No grouping"; hidden and empty columns wait in Hidden columns', () => {
    expect(boardGrouping('none', 'status')).toBe('status');
    expect(boardGrouping('account', 'status')).toBe('account');
    expect(board.shown.map(g => g.id)).toStrictEqual(['c']);
    expect(board.hidden.map(h => [h.group.id, h.hiddenByMember])).toStrictEqual([['a', true], ['b', false]]);
    expect(arrangeBoardColumns(columns, { ...boardView, showEmptyGroups: true }).shown.map(g => g.id)).toStrictEqual(['c', 'b']);
    expect(toggleHiddenGroup(boardView, 'a').hiddenGroups).toStrictEqual({ status: [] });
    expect(toggleHiddenGroup(boardView, 'c').hiddenGroups).toStrictEqual({ status: ['a', 'c'] });
    // Show empty rows is saved like the other switches.
    expect(defaults.showEmptySubGroups).toBe(false);
    expect(readListView({ showEmptySubGroups: true }, defaults).showEmptySubGroups).toBe(true);
    expect(readListView({ showEmptySubGroups: 'yes' }, defaults).showEmptySubGroups).toBe(false);
  });
});
