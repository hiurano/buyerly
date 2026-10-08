// Run in CI; compile the pure TypeScript models without adding a test runtime.
// The details pane's widths, spring and saved state, and the Rules pane's
// quick filters, as read from Linear's DetailsPaneContainer (#367).
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
const pane = load(path.join(root, 'ui/detailsPaneModel.ts'));
const facets = load(path.join(root, 'components/rules/ruleFacets.ts'));

// Both panes start closed; a saved value survives, a broken one falls back.
assert.deepEqual(pane.parseDetailsPanes(null), { adsManager: { open: false, width: null }, rules: { open: false, width: null } });
assert.deepEqual(pane.parseDetailsPanes('{"rules":{"open":true,"width":420}}').rules, { open: true, width: 420 });
assert.deepEqual(pane.parseDetailsPanes('{"rules":{"open":"yes","width":"wide"}}').rules, { open: false, width: null });
assert.deepEqual(pane.parseDetailsPanes('not json').adsManager, { open: false, width: null });

// Beside the list: 350 until dragged, the dragged width after, never past 600 or into the list's 300px.
assert.equal(pane.detailsPaneWidth(null, 1500, false), 350);
assert.equal(pane.detailsPaneWidth(440, 1500, false), 440);
assert.equal(pane.detailsPaneWidth(900, 1500, false), 600);
assert.equal(pane.detailsPaneWidth(440, 1025, false), 395);
// Over the list (1024px and below): always 350, the window when narrower; a drag never applies.
assert.equal(pane.detailsPaneWidth(440, 1000, true), 350);
assert.equal(pane.detailsPaneWidth(null, 320, true), 321);
// A drag stays within 360–600 and the window's room.
assert.equal(pane.clampDetailsPaneWidth(200, 1500), 360);
assert.equal(pane.clampDetailsPaneWidth(480.4, 1500), 480);
assert.equal(pane.clampDetailsPaneWidth(800, 1500), 600);
assert.equal(pane.clampDetailsPaneWidth(800, 1100), 470);

// The spring brings 350px within 1% in about 170ms, never overshoots, and comes to rest.
let value = { position: -350, velocity: 0 };
let elapsed = 0;
let overshoot = false;
let nearlyThere = null;
while (elapsed < 1000) {
  value = pane.stepSpring(value, 0, 16);
  elapsed += 16;
  if (value.position > 0) overshoot = true;
  if (nearlyThere === null && value.position > -3.5) nearlyThere = elapsed;
  if (value.done) break;
}
assert.equal(overshoot, false, 'the pane spring overshoots');
assert.ok(nearlyThere >= 120 && nearlyThere <= 260, `the pane is within 1% after ${nearlyThere}ms`);
assert.equal(value.done, true, 'the pane spring never rests');
assert.equal(value.position, 0);
const halfway = pane.stepSpring({ position: -350, velocity: 0 }, 0, 48);
assert.ok(halfway.position > -175 && halfway.position < 0, `after 48ms the pane is ${halfway.position}px out`);

// A swipe to the right closes it: past 50px, within 50px up or down and 300ms.
assert.equal(pane.isSwipeRight({ x: 10, y: 100, at: 0 }, { x: 70, y: 110, at: 200 }), true);
assert.equal(pane.isSwipeRight({ x: 10, y: 100, at: 0 }, { x: 70, y: 110, at: 400 }), false);
assert.equal(pane.isSwipeRight({ x: 10, y: 100, at: 0 }, { x: 70, y: 200, at: 100 }), false);
assert.equal(pane.isSwipeRight({ x: 70, y: 100, at: 0 }, { x: 10, y: 100, at: 100 }), false);

// Rules: Status counts a held-back rule as "Needs review", Action and Groups list only what is there.
const rule = (id, fields) => ({ id, status: 'active', needsReview: false, actionKind: 'turn_off', ...fields });
const rules = [
  rule('1'),
  rule('2', { status: 'paused', actionKind: 'notify_only', groupId: 'g1' }),
  rule('3', { needsReview: true, actionKind: 'increase_budget', groupId: 'g1' }),
];
const groups = [{ id: 'g1', name: 'Scaling', ruleIds: ['2', '3'] }, { id: 'g2', name: 'Empty', ruleIds: [] }];
const built = facets.createRuleFacets(rules, groups);
const options = id => built.find(facet => facet.id === id).options.map(option => [option.value, option.label, option.count]);
assert.deepEqual(built.map(facet => facet.label), ['Status', 'Action', 'Groups']);
assert.deepEqual(options('status'), [['active', 'Active', 1], ['paused', 'Paused', 1], ['needs_review', 'Needs review', 1]]);
assert.deepEqual(options('action'), [['turn_off', 'Pause', 1], ['increase_budget', 'Increase budget', 1], ['notify_only', 'Notify', 1]]);
assert.deepEqual(options('group'), [['g1', 'Scaling', 2], ['ungrouped', 'Ungrouped', 1]]);
assert.deepEqual(facets.applyRuleQuickFilter(rules, { fieldId: 'group', value: 'g1' }).map(item => item.id), ['2', '3']);
assert.deepEqual(facets.applyRuleQuickFilter(rules, { fieldId: 'status', value: 'active' }).map(item => item.id), ['1']);
assert.equal(facets.applyRuleQuickFilter(rules, null), rules);
assert.deepEqual(facets.parseRuleQuickFilter('{"fieldId":"action","value":"turn_off"}'), { fieldId: 'action', value: 'turn_off' });
assert.equal(facets.parseRuleQuickFilter('{"fieldId":"rules","value":"7"}'), null);
assert.equal(facets.parseRuleQuickFilter('broken'), null);

console.log('Details pane and Rules quick filters passed');
