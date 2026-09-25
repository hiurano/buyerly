// Run in CI; compile the pure TypeScript mappers without adding a test runtime.
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
const { hierarchyAdSetToRow, hierarchyAdToRow, hierarchyCampaignToRow } = load(path.join(root, 'components/campaigns/liveCampaigns.ts'));
// Shaped like GET /api/analytics/hierarchy items for parent_id=<account>.
const item = (entity_level, entity_id, parent_entity_id) => ({
  entity_id, entity_name: `${entity_id} name`, entity_level, parent_entity_id,
  account_id: 'act_1', currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE',
  daily_budget: 0, data_as_of: null, spend: 1, impressions: 0, reach: 0, frequency: 0,
  cpm: 0, clicks: 0, unique_clicks: 0, link_clicks: 0, outbound_clicks: 0,
  landing_page_views: 0, leads: 0, registrations: 0, purchases: 0, cost_per_lead: null,
  cost_per_registration: null, cost_per_purchase: null, cost_per_landing_page_view: null,
  cpc: 0, ctr: 0, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
});
const campaigns = [item('campaign', 'cmp_a', 'act_1'), item('campaign', 'cmp_b', 'act_1')].map(hierarchyCampaignToRow);
const campaignNames = new Map(campaigns.map(c => [c.id, c.name]));
const adSets = [item('adset', 'set_a1', 'cmp_a'), item('adset', 'set_b1', 'cmp_b')]
  .map(i => hierarchyAdSetToRow(i, campaignNames));
assert.deepEqual(adSets.map(s => [s.id, s.campaignId, s.campaignName]), [
  ['set_a1', 'cmp_a', 'cmp_a name'], ['set_b1', 'cmp_b', 'cmp_b name'],
]);
const adSetsById = new Map(adSets.map(s => [s.id, s]));
const ads = [item('ad', 'ad_x', 'set_a1'), item('ad', 'ad_y', 'set_b1')].map(i => hierarchyAdToRow(i, adSetsById));
assert.deepEqual(ads.map(a => [a.id, a.adSetId, a.adSetName, a.campaignName]), [
  ['ad_x', 'set_a1', 'set_a1 name', 'cmp_a name'], ['ad_y', 'set_b1', 'set_b1 name', 'cmp_b name'],
]);
console.log('Hierarchy parent mapping passed');
