// Run in CI; compile the rule window's pure model without adding a test runtime (#387).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = fs.existsSync(file) ? file : file.replace(/\.ts$/, '.tsx');
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const requireSource = name => load(path.resolve(name.startsWith('@/') ? root : path.dirname(source), name.replace(/^@\//, '') + '.ts'));
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}
// Storage stands in for the browser's.
const store = new Map();
global.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const draftModel = load(path.join(root, 'components/rules/ruleDraft.ts'));
const {
  emptyDraft, draftProblems, draftToPayload, autoRuleName, describeDraft, draftFromPreset,
  draftAttachments, sameRunOn, withLevel, readStoredDraft, writeStoredDraft, availableActions, conditionProblem,
} = draftModel;

const accounts = [{ account_id: 'act_1', name: 'Main', currency: 'USD' }, { account_id: 'act_2', name: 'Second', currency: 'USD' }];
const nl = {
  ...emptyDraft(),
  conditions: [
    { metric: 'spend', operator: 'gte', value: '4' },
    { metric: 'leads', operator: 'eq', value: '0' },
  ],
  timeWindow: 'lifetime',
};

// A value is checked in its own chip.
assert.equal(conditionProblem({ metric: 'spend', operator: 'gte', value: '' }), 'Enter a value for Spend');
assert.equal(conditionProblem({ metric: 'leads', operator: 'eq', value: '1.5' }), 'Leads is a whole number');
assert.equal(conditionProblem({ metric: 'cpl', operator: 'gt', value: '-1' }), 'CPL needs a number of 0 or more');
assert.equal(conditionProblem({ metric: 'ctr', operator: 'lt', value: '0.8' }), null);
assert.deepEqual(draftProblems(emptyDraft()), ['Enter a value for Spend']);
assert.equal(draftToPayload(emptyDraft(), []), null, 'nothing is sent while a value is missing');

// Budget actions need a percent and, to raise, a ceiling; only ad sets take them.
const raise = { ...nl, action: 'increase_budget', budgetMax: '' };
assert.deepEqual(draftProblems(raise), ['Set the daily ceiling']);
assert.deepEqual(draftProblems({ ...raise, budgetMax: '300', budgetPercent: '0' }), ['Change the budget by 1–100%']);
assert.deepEqual(availableActions('campaign'), ['turn_off', 'turn_on', 'notify_only']);
assert.equal(withLevel(raise, 'campaign').action, 'turn_off', 'a campaign cannot take a budget action');
assert.equal(withLevel(nl, 'ad').action, 'turn_off');

// The name is optional: left empty, it is made from the rule.
assert.equal(autoRuleName(nl), 'Spend ≥ 4 & Leads = 0 → Turn off');
assert.equal(autoRuleName({ ...nl, logic: 'or', action: 'notify_only' }), 'Spend ≥ 4 or Leads = 0 → Notify');
const payload = draftToPayload({ ...nl, labelIds: ['3', 'gone'] }, ['3']);
assert.equal(payload.name, 'Spend ≥ 4 & Leads = 0 → Turn off');
assert.deepEqual(payload.label_ids, [3], 'only labels that exist');
assert.deepEqual(payload.conditions, [
  { metric: 'spend', operator: 'gte', value: 4, time_window: 'lifetime' },
  { metric: 'leads', operator: 'eq', value: 0, time_window: 'lifetime' },
]);
assert.equal(payload.budget_change_percent, 0, 'no budget fields on a non-budget action');
assert.equal(draftToPayload({ ...nl, name: '  $4 and no lead ' }, []).name, '$4 and no lead');
const raised = draftToPayload({ ...raise, budgetMax: '300' }, []);
assert.deepEqual([raised.budget_change_percent, raised.budget_max_daily], [20, 300]);

// The sentence under the chips: what, how often, when and where.
assert.equal(
  describeDraft(nl, accounts),
  'Checks each ad set every 5 min and turns it off when spend ≥ USD 4 and leads = 0 (lifetime). '
  + 'Acts on the same ad set at most once a day. Runs nowhere until you pick where.',
);
assert.match(describeDraft({ ...nl, runOn: { act_1: { level: 'account', ids: [] } } }, accounts), /Runs on Main\.$/);
assert.match(describeDraft({ ...nl, runOn: { act_1: { level: 'campaign', ids: ['c1', 'c2'] } } }, accounts), /Runs on 2 campaigns in Main\.$/);
assert.match(describeDraft({ ...nl, runOn: { act_1: { level: 'account', ids: [] }, act_2: { level: 'account', ids: [] } } }, accounts), /Runs on 2 ad accounts\.$/);
assert.match(describeDraft({ ...raise, budgetMax: '300', checkInterval: 60 }, accounts), /every hour and raises its daily budget by 20% up to USD 300 a day/);
assert.match(describeDraft({ ...nl, conditions: [{ metric: 'ctr', operator: 'lt', value: '0.8' }] }, accounts), /when CTR < 0\.8%/);
// Mixed currencies: no unit is claimed.
assert.match(describeDraft(nl, [...accounts, { account_id: 'act_3', name: 'Euro', currency: 'EUR' }]), /spend ≥ 4 and/);

// Where it runs: created in one write; an edit sends it only when it changed.
assert.deepEqual(draftAttachments({ ...nl, runOn: { act_1: { level: 'campaign', ids: ['c1'] } } }),
  [{ account_id: 'act_1', scope: { level: 'campaign', ids: ['c1'] } }]);
assert.equal(sameRunOn({ a: { level: 'campaign', ids: ['1', '2'] } }, { a: { level: 'campaign', ids: ['2', '1'] } }), true);
assert.equal(sameRunOn({ a: { level: 'account', ids: [] } }, {}), false);

// A saved rule round-trips every field, where it runs included.
const preset = {
  id: 7, name: 'Cap', action: 'increase_budget', level: 'adset', enabled: true,
  conditions: [{ metric: 'cpl', operator: 'lte', value: 2.5, time_window: 'last_3d' }],
  condition_logic: 'or', cooldown_minutes: 360, check_interval_minutes: 15,
  budget_change_percent: 15, budget_max_daily: 250, attached_account_ids: ['act_2'],
  attached_scopes: { act_2: { level: 'adset', ids: ['s1'] } },
};
const loaded = draftFromPreset(preset, ['4']);
assert.deepEqual(
  [loaded.timeWindow, loaded.logic, loaded.repeatMinutes, loaded.checkInterval, loaded.budgetPercent, loaded.budgetMax, loaded.labelIds],
  ['last_3d', 'or', 360, 15, '15', '250', ['4']],
);
assert.deepEqual(loaded.runOn, { act_2: { level: 'adset', ids: ['s1'] } });
assert.equal(draftToPayload(loaded, ['4']).conditions[0].value, 2.5);

// An unsaved draft comes back; an empty one or a broken one does not.
writeStoredDraft('k', nl);
assert.deepEqual(readStoredDraft('k'), nl);
writeStoredDraft('k', emptyDraft());
assert.equal(readStoredDraft('k'), null, 'an empty window keeps no draft');
store.set('k', JSON.stringify({ ...nl, level: 'account' }));
assert.equal(readStoredDraft('k'), null, 'a malformed draft is ignored');
store.set('k', '{not json');
assert.equal(readStoredDraft('k'), null);
writeStoredDraft('k', null);
assert.equal(store.has('k'), false);
console.log('Rule window model passed');
