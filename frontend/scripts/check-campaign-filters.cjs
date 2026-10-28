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
const { createLiveFields, filterView, groupView, deliveryStatus } = load(path.join(root, 'components/campaigns/campaignViewModel.ts'));
const { applyFilterClauses } = load(path.join(root, 'components/filters/filterModel.ts'));
const rows = [
  { id: 'A', name: 'A', status: 'active', accountId: 'account-1' },
  { id: 'B', name: 'B', status: 'paused', accountId: 'account-1' },
  { id: 'C', name: 'C', status: 'active', accountId: 'account-1' },
  { id: 'D', name: 'D', status: 'paused', accountId: 'account-1' },
];
const account = { account_id: 'account-1', active_rules: [
  { preset_id: 1, name: 'Bug', scope: { level: 'campaign', ids: ['A', 'B'] } },
  { preset_id: 2, name: 'Feature', scope: { level: 'campaign', ids: ['B', 'C'] } },
] };
const fields = createLiveFields(rows, [account], 'campaigns', []);
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
const unknownRows = [{ id: 'unknown', name: 'Unknown', status: 'unknown', accountId: 'account-1' }];
const unknownFields = createLiveFields(unknownRows, [account], 'campaigns', []);
assert.deepEqual(groupView(unknownRows, unknownFields, 'status').flatMap(g => ids(g.rows)), ['unknown']);
assert.equal(filterView(rows, fields, [clause('is', ['missing'])], null).facets.every(f => f.options.length === 0), true);
assert.deepEqual(ids(filterView(rows, fields, [], { fieldId: 'rule', value: 'no-rule' }).visibleRows), ['D']);
// Account groups are gone: ad accounts belong to teams. No field offers them.
assert.equal(fields.some(f => f.id === 'group'), false);
assert.equal(fields.find(f => f.id === 'status').label, 'Status');
// Explicit ad-set scope must not promote itself to a campaign.
const scoped = { account_id: 'a', active_rules: [{ preset_id: 3, name: 'Scoped', scope: { level: 'adset', ids: ['S'] } }] };
const inA = row => ({ ...row, accountId: 'a' });
assert.deepEqual(createLiveFields(rows.map(inA), [scoped], 'campaigns', []).find(f => f.id === 'rule').getValue(inA(rows[0])), ['no-rule']);
const ad = { id: 'AD', name: 'Ad', status: 'active', adSetId: 'S', accountId: 'a' };
assert.deepEqual(createLiveFields([ad], [scoped], 'ads', [{ id: 'S', campaignId: 'A' }]).find(f => f.id === 'rule').getValue(ad), ['3']);
// Several ad accounts at once, as Linear's team Issues lists every project's issues:
// each row reads the rules and groups of its own account; Ad account filters and groups, A→Z.
const zulu = { account_id: 'act_2', name: 'Zulu', active_rules: [{ preset_id: 9, name: 'Stop loss', scope: { level: 'account', ids: [] } }] };
const alpha = { account_id: 'act_1', name: 'Alpha', custom_name: '', active_rules: [] };
const mixed = [
  { id: 'z1', name: 'Z one', status: 'active', accountId: 'act_2' },
  { id: 'a1', name: 'A one', status: 'active', accountId: 'act_1' },
  { id: 'z2', name: 'Z two', status: 'paused', accountId: 'act_2' },
];
const mixedFields = createLiveFields(mixed, [zulu, alpha], 'campaigns', []);
const accountOptions = mixedFields.find(f => f.id === 'account').options;
assert.deepEqual(accountOptions.map(o => [o.value, o.label, o.count]), [['act_1', 'Alpha', 1], ['act_2', 'Zulu', 2]]);
assert.deepEqual(groupView(mixed, mixedFields, 'account').map(g => [g.label, ids(g.rows)]), [['Alpha', ['a1']], ['Zulu', ['z1', 'z2']]]);
assert.deepEqual(ids(applyFilterClauses(mixed, mixedFields, [{ fieldId: 'account', operator: 'is', values: ['act_2'] }])), ['z1', 'z2']);
assert.deepEqual(mixedFields.find(f => f.id === 'rule').getValue(mixed[0]), ['9'], 'Zulu\'s account-wide rule reaches its rows');
assert.deepEqual(mixedFields.find(f => f.id === 'rule').getValue(mixed[1]), ['no-rule'], 'and not Alpha\'s');
// Status is where delivery really stands (Meta's effective_status), not the switch (#367).
for (const [effectiveStatus, expected] of [
  ['ACTIVE', 'active'], ['PAUSED', 'paused'], ['CAMPAIGN_PAUSED', 'paused'], ['ADSET_PAUSED', 'paused'],
  ['PENDING_REVIEW', 'in_review'], ['IN_PROCESS', 'in_review'], ['PREAPPROVED', 'in_review'],
  ['DISAPPROVED', 'disapproved'], ['WITH_ISSUES', 'with_issues'], ['PENDING_BILLING_INFO', 'with_issues'],
  ['ARCHIVED', 'archived'], ['DELETED', 'archived'], ['SOMETHING_NEW', 'unknown'],
]) assert.equal(deliveryStatus({ status: 'active', effectiveStatus }), expected, effectiveStatus);
assert.equal(deliveryStatus({ status: 'paused' }), 'paused', 'without effective_status the switch decides');
const delivered = [
  { id: 'on', name: 'On', status: 'active', effectiveStatus: 'ACTIVE' },
  { id: 'rejected', name: 'Rejected', status: 'active', effectiveStatus: 'DISAPPROVED' },
  { id: 'parent-off', name: 'Parent off', status: 'active', effectiveStatus: 'CAMPAIGN_PAUSED' },
];
const deliveredFields = createLiveFields(delivered, [account], 'adsets', []);
const statusFacet = filterView(delivered, deliveredFields, [], null).facets.find(f => f.id === 'status');
assert.deepEqual(statusFacet.options.map(o => [o.value, o.count]), [['active', 1], ['paused', 1], ['disapproved', 1]]);
assert.deepEqual(ids(filterView(delivered, deliveredFields, [], { fieldId: 'status', value: 'disapproved' }).visibleRows), ['rejected']);
// A shared link's old "Status is Paused" still finds what is not delivering because it is paused.
assert.deepEqual(ids(applyFilterClauses(delivered, deliveredFields, [{ fieldId: 'status', operator: 'is', values: ['paused'] }])), ['parent-off']);
// Every figure of the period filters as a number (#389); a row without one never matches.
const { readMetrics, metricsFor, readAdsManagerPeriod } = load(path.join(root, 'components/campaigns/adsManagerMetrics.ts'));
const { migrateAdsManagerClauses } = load(path.join(root, 'components/campaigns/campaignViewModel.ts'));
const measured = [
  { id: 'cheap', name: 'Cheap leads', status: 'active', campaignId: 'C1', metrics: readMetrics({ spend: 30, leads: 6, cost_per_lead: 5, daily_budget: 50, ctr: 1.5 }) },
  { id: 'dear', name: 'Dear leads', status: 'active', campaignId: 'C1', metrics: readMetrics({ spend: 40, leads: 2, cost_per_lead: 20, daily_budget: 0, ctr: 0.4 }) },
  { id: 'none', name: 'No leads', status: 'paused', campaignId: 'C2', metrics: readMetrics({ spend: 12, leads: 0, cost_per_lead: null }) },
];
assert.equal(measured[1].metrics.budget, null, 'no budget of its own is no budget, not zero');
const measuredFields = createLiveFields(measured, [account], 'adsets', [], [{ id: 'C1', name: 'Leads NL' }, { id: 'C2', name: 'Zeta' }, { id: 'C3', name: 'Empty' }]);
const metric = (fieldId, operator, value) => ids(applyFilterClauses(measured, measuredFields, [{ fieldId, operator, values: [value] }]));
assert.deepEqual(metric('cpl', 'lt', 10), ['cheap']);
assert.deepEqual(metric('cpl', 'gte', 5), ['cheap', 'dear'], 'no CPL is not a CPL of 0');
assert.deepEqual(metric('leads', 'gt', 0), ['cheap', 'dear']);
assert.deepEqual(metric('budget', 'gt', 0), ['cheap']);
assert.deepEqual(metric('ctr', 'gte', 1), ['cheap']);
assert.equal(measuredFields.filter(f => f.section === 'metrics').map(f => f.id).join(','),
  'budget,spend,impressions,cpm,clicks,ctr,cpc,leads,cpl,registrations,cpreg,purchases,cpp');
assert.equal(createLiveFields(measured, [account], 'ads', [], []).some(f => f.id === 'budget'), false, 'ads have no budget');
assert.equal(metricsFor('ads').some(m => m.id === 'budget'), false);
// Ad sets and ads filter and group by their campaign; only campaigns with rows are offered, A→Z.
const campaignField = measuredFields.find(f => f.id === 'campaign');
assert.deepEqual(campaignField.options.map(o => [o.label, o.count]), [['Leads NL', 2], ['Zeta', 1]]);
assert.deepEqual(groupView(measured, measuredFields, 'campaign').map(g => [g.label, ids(g.rows)]), [['Leads NL', ['cheap', 'dear']], ['Zeta', ['none']]]);
assert.equal(createLiveFields(measured, [account], 'campaigns', []).some(f => f.id === 'campaign'), false);
// An ad finds its campaign through its ad set; ads also filter by ad set.
const adRows = [{ id: 'ad1', name: 'Ad one', status: 'active', adSetId: 'S1' }, { id: 'ad2', name: 'Ad two', status: 'active', adSetId: 'S2' }];
const adFields = createLiveFields(adRows, [account], 'ads', [{ id: 'S1', campaignId: 'C1', name: 'Set one' }, { id: 'S2', campaignId: 'C2', name: 'Set two' }], [{ id: 'C1', name: 'Leads NL' }, { id: 'C2', name: 'Zeta' }]);
assert.deepEqual(ids(applyFilterClauses(adRows, adFields, [{ fieldId: 'campaign', operator: 'is', values: ['C2'] }])), ['ad2']);
assert.deepEqual(ids(applyFilterClauses(adRows, adFields, [{ fieldId: 'adSet', operator: 'is_not', values: ['S2'] }])), ['ad1']);
// Name contains matches the name or the Meta ID.
assert.deepEqual(ids(applyFilterClauses(measured, measuredFields, [{ fieldId: 'name', operator: 'contains', values: ['LEADS'] }])), ['cheap', 'dear', 'none']);
assert.deepEqual(ids(applyFilterClauses(measured, measuredFields, [{ fieldId: 'name', operator: 'contains', values: ['dear'] }])), ['dear']);
// Links from before #389: Results was leads and CPA was CPL.
assert.deepEqual(migrateAdsManagerClauses([{ fieldId: 'results', operator: 'gt', values: [1] }, { fieldId: 'cpa', operator: 'lt', values: [9] }]),
  [{ fieldId: 'leads', operator: 'gt', values: [1] }, { fieldId: 'cpl', operator: 'lt', values: [9] }]);
assert.deepEqual(migrateAdsManagerClauses([{ fieldId: 'cpa', operator: 'lt', values: [9] }, { fieldId: 'cpl', operator: 'lt', values: [5] }]),
  [{ fieldId: 'cpl', operator: 'lt', values: [5] }], 'a newer CPL clause wins over the old CPA one');
// Account groups are gone; a saved filter by them is dropped rather than left unseen.
assert.deepEqual(migrateAdsManagerClauses([{ fieldId: 'group', operator: 'includes_all', values: ['4'] }, { fieldId: 'name', operator: 'contains', values: ['x'] }]),
  [{ fieldId: 'name', operator: 'contains', values: ['x'] }]);
// The period comes from the address; anything unknown is today.
assert.equal(readAdsManagerPeriod('last_7d'), 'last_7d');
assert.equal(readAdsManagerPeriod('lifetime'), 'today');
assert.equal(readAdsManagerPeriod(''), 'today');
console.log('Campaign filter semantics passed');
