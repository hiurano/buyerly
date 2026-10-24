// Run in CI; compile the Rules page's pure view model without adding a test runtime (#390).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
// The view hook is React's; the model under test only needs its defaults.
cache.set(path.join(root, 'ui/useListView.ts'), { exports: { useListView: () => ({}) } });
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // A package (react since #492) comes from node_modules; the app's own modules are compiled here.
  const requireSource = name => (/^(\.|@\/)/.test(name) ? load(path.resolve(name.startsWith('@/') ? root : path.dirname(file), name.replace(/^@\//, '') + '.ts')) : require(name));
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}
const { ruleGroupsFor, ruleGroupIds, sortRules, RULES_VIEW_DEFAULTS, RULE_PROPERTIES } = load(path.join(root, 'components/rules/rulesViewModel.ts'));
const { createRuleFilterFields } = load(path.join(root, 'components/filters/filterCatalogs.ts'));
const { applyFilterClauses, filterDateLabel } = load(path.join(root, 'components/filters/filterModel.ts'));

const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
const rule = (id, fields = {}, preset = {}) => ({
  id, presetId: Number(id), identifier: `RUL-${id}`, name: `Rule ${id}`, condition: '', action: '', actionKind: 'turn_off',
  status: 'active', lastRun: '', lastCheck: '', labelIds: [], needsReview: false, reviewReason: '', ...fields,
  preset: {
    level: 'adset', conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'today' }],
    attached_account_ids: [], attached_scopes: {}, last_run_at: '', last_checked_at: '', created_at: ago(30),
    check_interval_minutes: 5, cooldown_minutes: 1440, ...preset,
  },
});
const rules = [
  rule('1', { labelIds: ['L1'] }, {
    conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'lifetime' }, { metric: 'leads', operator: 'eq', value: 0, time_window: 'lifetime' }],
    attached_account_ids: ['act_1'], attached_scopes: { act_1: { level: 'account', ids: [] } }, last_run_at: ago(0.2), last_checked_at: ago(0.01), created_at: ago(40),
  }),
  rule('2', { actionKind: 'increase_budget', status: 'paused', labelIds: ['L1', 'L2'] }, {
    level: 'adset', conditions: [{ metric: 'cpl', operator: 'lte', value: 2, time_window: 'last_3d' }],
    attached_account_ids: ['act_1', 'act_2'], attached_scopes: { act_1: { level: 'campaign', ids: ['c'] }, act_2: { level: 'account', ids: [] } },
    last_checked_at: ago(3), created_at: ago(2),
  }),
  rule('3', { actionKind: 'notify_only', needsReview: true }, { level: 'campaign', created_at: ago(10) }),
];
const labels = [{ id: 'L1', name: 'NL launch', color: '#f2994a' }, { id: 'L2', name: 'Scaling', color: '#5e6ad2' }];
const accounts = [{ account_id: 'act_1', name: 'Main' }, { account_id: 'act_2', name: 'Second' }];
const ids = (list) => list.map((item) => item.id);

// Display properties: the issue's list, the short set on at first.
assert.deepEqual(RULE_PROPERTIES.map((property) => property.label),
  ['Status', 'ID', 'Labels', 'Condition', 'Action', 'Applies to', 'Scope', 'Check', 'Repeat', 'Last check', 'Last action', 'Created']);
assert.deepEqual(Object.entries(RULES_VIEW_DEFAULTS.properties).filter(([, on]) => on).map(([id]) => id),
  ['status', 'labels', 'condition', 'action', 'scope', 'lastCheck', 'lastRun']);

// Filters.
const fields = createRuleFilterFields({ rules, ruleLabels: labels, accounts });
assert.deepEqual(fields.map((field) => field.label),
  ['Status', 'Labels', 'Action', 'Applies to', 'Metric', 'Window', 'Ad account', 'Scope', 'Name', 'Last action', 'Last check', 'Created date']);
const by = (fieldId, operator, values) => ids(applyFilterClauses(rules, fields, [{ fieldId, operator, values }]));
assert.deepEqual(by('status', 'is', ['needs_review']), ['3'], 'a rule held back is "Needs review", not active');
assert.deepEqual(by('status', 'is', ['active']), ['1']);
assert.deepEqual(by('action', 'is', ['increase_budget']), ['2']);
assert.deepEqual(by('level', 'is', ['campaign']), ['3']);
assert.deepEqual(by('metric', 'includes_any', ['leads', 'cpl']), ['1', '2']);
assert.deepEqual(by('metric', 'includes_all', ['spend', 'leads']), ['1']);
assert.deepEqual(by('window', 'includes_any', ['lifetime']), ['1']);
assert.deepEqual(by('account', 'includes_any', ['act_2']), ['2']);
assert.deepEqual(by('account', 'includes_any', ['none']), ['3'], 'Not attached');
assert.deepEqual(by('scope', 'includes_any', ['campaign']), ['2']);
assert.deepEqual(by('name', 'contains', ['rul-3']), ['3'], 'the name or RUL- id');
assert.deepEqual(by('lastRun', 'is', ['never']), ['2', '3'], 'Last action is Never');
assert.deepEqual(by('lastRun', 'after', ['-P1D']), ['1']);
assert.deepEqual(by('lastCheck', 'after', ['-P1W']), ['1', '2']);
assert.deepEqual(by('lastCheck', 'is', ['never']), ['3']);
assert.deepEqual(by('created', 'after', ['-P1W']), ['2']);
assert.equal(filterDateLabel('never'), 'Never');
assert.ok(fields.find((field) => field.id === 'lastRun').allowNever && !fields.find((field) => field.id === 'created').allowNever);

// Groupings: a rule on two accounts or with two labels sits in both groups.
const groups = (grouping) => ruleGroupsFor(grouping, rules, labels, accounts).map((group) => [group.label, ids(group.rows)]);
assert.deepEqual(groups('labels'), [['NL launch', ['1', '2']], ['Scaling', ['2']], ['No label', ['3']]]);
assert.deepEqual(groups('status'), [['Active rules', ['1']], ['Paused rules', ['2']], ['Needs review', ['3']]]);
assert.deepEqual(groups('action'), [['Turn off', ['1']], ['Turn on', []], ['Notify', ['3']], ['Budget +', ['2']], ['Budget −', []]]);
assert.deepEqual(groups('level'), [['Campaign', ['3']], ['Ad set', ['1', '2']], ['Ad', []]]);
assert.deepEqual(groups('account'), [['Main', ['1', '2']], ['Second', ['2']], ['Not attached', ['3']]]);
assert.deepEqual(ruleGroupIds('account', rules[1], labels, accounts), ['account-act_1', 'account-act_2']);
// Only label and status columns take a dropped card on the board.
assert.deepEqual(ruleGroupsFor('labels', rules, labels, accounts).map((group) => group.drop),
  [{ kind: 'label', labelId: 'L1' }, { kind: 'label', labelId: 'L2' }, { kind: 'label', labelId: null }]);
assert.deepEqual(ruleGroupsFor('status', rules, labels, accounts).map((group) => group.drop),
  [{ kind: 'status', enabled: true }, { kind: 'status', enabled: false }, undefined]);
assert.ok(ruleGroupsFor('action', rules, labels, accounts).every((group) => !group.drop));

// Orderings, never-run last when newest first.
assert.deepEqual(ids(sortRules(rules, 'lastCheck', 'desc')), ['1', '2', '3']);
assert.deepEqual(ids(sortRules(rules, 'created', 'desc')), ['2', '3', '1']);
assert.deepEqual(ids(sortRules(rules, 'status', 'asc')), ['1', '2', '3']);
assert.deepEqual(ids(sortRules(rules, 'manual', 'asc')), ['1', '2', '3']);
console.log('Rules view model passed');
