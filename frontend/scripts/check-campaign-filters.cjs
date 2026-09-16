// Run in CI; compile the pure TypeScript model without adding a test runtime.
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
const { createLiveFields, filterView, groupView } = load(path.join(root, 'components/campaigns/campaignViewModel.ts'));
const { applyFilterClauses } = load(path.join(root, 'components/filters/filterModel.ts'));
const rows = [
  { id: 'A', name: 'A', status: 'active' },
  { id: 'B', name: 'B', status: 'paused' },
  { id: 'C', name: 'C', status: 'active' },
  { id: 'D', name: 'D', status: 'paused' },
];
const account = { account_id: 'account-1', active_rules: [
  { preset_id: 1, name: 'Bug', scope: { level: 'campaign', ids: ['A', 'B'] } },
  { preset_id: 2, name: 'Feature', scope: { level: 'campaign', ids: ['B', 'C'] } },
] };
const fields = createLiveFields(rows, account, [{ id: 8, name: 'Real group', account_ids: ['account-1'] }], 'campaigns', []);
const clause = (operator, values) => ({ fieldId: 'rule', operator, values });
const ids = items => items.map(row => row.id);
const view = filterView(rows, fields, [clause('includes_all', ['1'])], { fieldId: 'rule', value: '2' });
assert.deepEqual(ids(view.baseRows), ['A', 'B']);
assert.deepEqual(ids(view.visibleRows), ['B']);
assert.deepEqual(view.facets.find(f => f.id === 'rule').options.map(o => [o.value, o.count]), [['1', 2], ['2', 1]]);
for (const [operator, expected] of [
  ['includes_all', ['B']], ['includes_any', ['A', 'B', 'C']],
  ['excludes_any', ['D']], ['excludes_all', ['A', 'C', 'D']],
]) assert.deepEqual(ids(applyFilterClauses(rows, fields, [clause(operator, ['1', '2'])])), expected);
assert.deepEqual(groupView(view.baseRows, fields, 'status').map(g => ids(g.rows)), [['A'], ['B']]);
const unknownRows = [{ id: 'unknown', name: 'Unknown', status: 'unknown' }];
const unknownFields = createLiveFields(unknownRows, account, [], 'campaigns', []);
assert.deepEqual(groupView(unknownRows, unknownFields, 'status').flatMap(g => ids(g.rows)), ['unknown']);
assert.equal(filterView(rows, fields, [clause('is', ['missing'])], null).facets.every(f => f.options.length === 0), true);
assert.deepEqual(ids(filterView(rows, fields, [], { fieldId: 'rule', value: 'no-rule' }).visibleRows), ['D']);
// Account groups never leak from another account.
const other = createLiveFields(rows, { account_id: 'account-2' }, [{ id: 8, name: 'Real group', account_ids: ['account-1'] }], 'campaigns', []);
assert.equal(other.find(f => f.id === 'group').options.find(o => o.value === '8').count, 0);
// Explicit ad-set scope must not promote itself to a campaign.
const scoped = { account_id: 'a', active_rules: [{ preset_id: 3, name: 'Scoped', scope: { level: 'adset', ids: ['S'] } }] };
assert.deepEqual(createLiveFields(rows, scoped, [], 'campaigns', []).find(f => f.id === 'rule').getValue(rows[0]), ['no-rule']);
const ad = { id: 'AD', name: 'Ad', status: 'active', adSetId: 'S' };
assert.deepEqual(createLiveFields([ad], scoped, [], 'ads', [{ id: 'S', campaignId: 'A' }]).find(f => f.id === 'rule').getValue(ad), ['3']);
console.log('Campaign filter semantics passed');
