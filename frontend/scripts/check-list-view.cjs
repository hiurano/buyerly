// Run in CI; compile the pure list-view and filter models without adding a test runtime (#385).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const requireSource = name => load(path.resolve(name.startsWith('@/') ? root : path.dirname(file), name.replace(/^@\//, '') + '.ts'));
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}
const {
  listViewDefaults, readListView, displayDiffers, sortByColumn, arrangeGroups, orderGroups,
} = load(path.join(root, 'ui/listView.ts'));
const {
  sanitizeFilterClauses, resolveFilterDate, filterDateLabel, matchesFilterClause, getFilterValueSummary,
} = load(path.join(root, 'components/filters/filterModel.ts'));

const defaults = listViewDefaults({ grouping: 'status', ordering: 'manual', direction: 'asc', properties: { status: true, spend: true } });

// A saved view falls back to the defaults field by field; junk never gets through.
assert.deepEqual(readListView(null, defaults), defaults);
assert.deepEqual(readListView(['x'], defaults), defaults);
const saved = readListView({
  layout: 'board', grouping: 'groups', direction: 'sideways', showEmptyGroups: true,
  properties: { status: false, unknown: true, spend: 'no' },
  groupOrder: { status: ['paused', 'active', 7] }, hiddenGroups: { status: [] },
  filters: [{ fieldId: 'status', operator: 'is', values: ['active'] }, { fieldId: 'x', operator: 'drop_table', values: ['1'] }],
}, defaults);
assert.equal(saved.layout, 'board');
assert.equal(saved.grouping, 'groups');
assert.equal(saved.direction, 'asc');
assert.deepEqual(saved.properties, { status: false, spend: true });
assert.deepEqual(saved.groupOrder, { status: ['paused', 'active'] });
assert.deepEqual(saved.hiddenGroups, {});
assert.deepEqual(saved.filters, [{ fieldId: 'status', operator: 'is', values: ['active'] }]);

// Display options differ from the defaults; filters alone do not count (Linear's Reset ignores them).
assert.equal(displayDiffers(defaults, defaults), false);
assert.equal(displayDiffers({ ...defaults, filters: saved.filters }, defaults), false);
assert.equal(displayDiffers({ ...defaults, direction: 'desc' }, defaults), true);
assert.equal(displayDiffers({ ...defaults, showEmptyGroups: true }, defaults), true);

// A header click turns the direction round on its own column, starts another in its natural direction.
assert.deepEqual(sortByColumn({ ...defaults, ordering: 'spend', direction: 'desc' }, 'spend', 'desc'), { direction: 'asc' });
assert.deepEqual(sortByColumn({ ...defaults, ordering: 'spend', direction: 'asc' }, 'name', 'asc'), { ordering: 'name', direction: 'asc' });

// Group ordering: the member's order first, unmoved groups after in their natural order; hidden and empty ones drop.
const groups = [
  { id: 'active', rows: [1] }, { id: 'paused', rows: [2] }, { id: 'review', rows: [] }, { id: 'archived', rows: [3] },
];
const ordered = { ...defaults, groupOrder: { status: ['archived', 'paused'] } };
assert.deepEqual(orderGroups(groups, ordered).map(g => g.id), ['archived', 'paused', 'active', 'review']);
assert.deepEqual(arrangeGroups(groups, ordered).map(g => g.id), ['archived', 'paused', 'active']);
assert.deepEqual(arrangeGroups(groups, { ...ordered, showEmptyGroups: true }).map(g => g.id), ['archived', 'paused', 'active', 'review']);
assert.deepEqual(arrangeGroups(groups, { ...ordered, showEmptyGroups: true }, { allowEmpty: false }).map(g => g.id), ['archived', 'paused', 'active']);
assert.deepEqual(arrangeGroups(groups, { ...ordered, hiddenGroups: { status: ['paused'] } }).map(g => g.id), ['archived', 'active']);
// Another grouping keeps its own order.
assert.deepEqual(orderGroups(groups, { ...ordered, grouping: 'rules' }).map(g => g.id), ['active', 'paused', 'review', 'archived']);

// Filters from a link or a saved view: malformed clauses drop, the rest stay.
assert.deepEqual(sanitizeFilterClauses('nope'), []);
assert.deepEqual(sanitizeFilterClauses([
  { fieldId: 'spend', operator: 'gte', values: [100] },
  { fieldId: 'spend', operator: 'lt', values: [5] },
  { fieldId: 'name', operator: 'contains', values: ['x'.repeat(201)] },
  { fieldId: 'lastRun', operator: 'after', values: ['-P1W'] },
  { fieldId: 'status', operator: 'is', values: [] },
  { fieldId: '<script>', operator: 'is', values: ['a'] },
]), [
  { fieldId: 'spend', operator: 'gte', values: [100] },
  { fieldId: 'lastRun', operator: 'after', values: ['-P1W'] },
]);

// Dates: Linear's ready-made values count back from now; a picked day starts at local midnight.
const now = new Date(2026, 9, 11, 15, 0, 0);
assert.equal(resolveFilterDate('-P1D', now), new Date(2026, 9, 10, 15, 0, 0).getTime());
assert.equal(resolveFilterDate('-P1W', now), new Date(2026, 9, 4, 15, 0, 0).getTime());
assert.equal(resolveFilterDate('-P3M', now), new Date(2026, 6, 11, 15, 0, 0).getTime());
assert.equal(resolveFilterDate('-P1Y', now), new Date(2025, 9, 11, 15, 0, 0).getTime());
assert.equal(resolveFilterDate('2026-09-01', now), new Date(2026, 8, 1).getTime());
assert.equal(filterDateLabel('-P1W'), '1 week ago');
assert.equal(filterDateLabel('-P2W'), '2 weeks ago');
assert.equal(filterDateLabel('2026-09-01'), 'Sep 1, 2026');

const dateField = { id: 'lastRun', label: 'Last action', section: 'dates', type: 'date', operators: ['after', 'before'], defaultOperator: 'after', getValue: row => row.at };
const recent = { at: new Date(Date.now() - 2 * 86400000).toISOString() };
const never = { at: null };
assert.equal(matchesFilterClause(recent, dateField, { fieldId: 'lastRun', operator: 'after', values: ['-P1W'] }), true);
assert.equal(matchesFilterClause(recent, dateField, { fieldId: 'lastRun', operator: 'after', values: ['-P1D'] }), false);
assert.equal(matchesFilterClause(recent, dateField, { fieldId: 'lastRun', operator: 'before', values: ['-P1D'] }), true);
assert.equal(matchesFilterClause(never, dateField, { fieldId: 'lastRun', operator: 'after', values: ['-P1Y'] }), false);
assert.equal(getFilterValueSummary(dateField, { fieldId: 'lastRun', operator: 'after', values: ['-P3M'] }), '3 months ago');

// Numbers: > ≥ < ≤ against the metric.
const spend = { id: 'spend', label: 'Spend', section: 'metrics', type: 'number', operators: ['gt', 'gte', 'lt', 'lte'], defaultOperator: 'gt', getValue: row => row.spend };
const row = { spend: 100 };
assert.equal(matchesFilterClause(row, spend, { fieldId: 'spend', operator: 'gt', values: [100] }), false);
assert.equal(matchesFilterClause(row, spend, { fieldId: 'spend', operator: 'gte', values: [100] }), true);
assert.equal(matchesFilterClause(row, spend, { fieldId: 'spend', operator: 'lt', values: [150.5] }), true);
assert.equal(matchesFilterClause({ spend: null }, spend, { fieldId: 'spend', operator: 'lte', values: [5] }), false);
assert.equal(getFilterValueSummary(spend, { fieldId: 'spend', operator: 'gt', values: [1500] }), '1,500');

console.log('List view and filter model passed');
