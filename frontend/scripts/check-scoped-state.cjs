// Execute the production store and API client with controlled, delayed HTTP responses.
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
  const requireSource = name => name.startsWith('.') || name.startsWith('@/')
    ? load(path.resolve(name.startsWith('@/') ? root : path.dirname(file), name.replace(/^@\//, '') + '.ts'))
    : require(name);
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}
global.window = { location: { pathname: '/a/rules', search: '' }, localStorage: { getItem: () => null } };
global.document = { cookie: '' };
const pending = [];
global.fetch = (url, init) => new Promise(resolve => pending.push({
  url, method: init.method, workspace: init.headers.get('X-Workspace-Slug'),
  reply: (body, status = 200) => resolve({ ok: status < 400, status, json: async () => body }),
}));
const { useAppStore: store } = load(path.join(root, 'store/useAppStore.ts'));
const state = () => store.getState();
function enter(slug) {
  window.location.pathname = slug ? `/${slug}/rules` : '/login';
  state().setWorkspaceScope(slug ? `user:${slug}` : null, slug || undefined);
}
function take(url, method = 'GET') {
  const index = pending.findIndex(item => item.url === url && item.method === method);
  assert.notEqual(index, -1, `${method} ${url} was sent`);
  return pending.splice(index, 1)[0];
}
const preset = (id, name = `Rule ${id}`) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true, conditions: [],
  condition_logic: 'and', cooldown_minutes: 0, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, currency_mode: 'account',
  needs_review: false, review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});
function rulesReplies() {
  return [take('/api/presets'), take('/api/rule-groups'), take('/api/accounts')];
}
function replyRules(requests, presets, groups = []) {
  requests[0].reply(presets); requests[1].reply(groups); requests[2].reply([]);
}
async function seed(slug = 'a', groups = []) {
  enter(slug);
  const promise = state().loadRules(); replyRules(rulesReplies(), [preset(1), preset(2)], groups); await promise;
}
async function main() {
  enter('a');
  state().setInterfaceTheme('dark'); state().setSidebarWidth(300);
  state().setRuleSelection(['1']); state().openEditRuleModal('1'); state().requestDeletion('rule', ['1']);
  const a = state().loadRules(); const ar = rulesReplies();
  enter('b');
  assert.deepEqual(state().selectedRuleIds, []); assert.equal(state().editingRuleId, null);
  assert.equal(state().isCreateRuleModalOpen, false); assert.equal(state().pendingDeletion, null);
  assert.equal(state().interfaceTheme, 'dark');
  assert.equal(state().sidebarWidth, 300);
  const b = state().loadRules(); replyRules(rulesReplies(), [preset(2, 'B')]); await b;
  replyRules(ar, [preset(1, 'A')]); await a;
  assert.equal(state().rules[0].name, 'B');

  // Same workspace refreshes also use latest-request-wins, including errors.
  const old = state().loadRules(); const oldReplies = rulesReplies();
  const fresh = state().loadRules(); replyRules(rulesReplies(), [preset(3)]); await fresh;
  oldReplies[0].reply({ detail: 'old error' }, 500); oldReplies[1].reply([]); oldReplies[2].reply([]); await old;
  assert.equal(state().rulesLoadState, 'ready'); assert.equal(state().rules[0].id, '3');

  enter('a'); const late = state().loadRules(); const lateReplies = rulesReplies();
  enter('b'); const failed = state().loadRules(); const failure = rulesReplies();
  failure[0].reply({ detail: 'B unavailable' }, 503); failure[1].reply([]); failure[2].reply([]); await failed;
  replyRules(lateReplies, [preset(1)]); await late;
  assert.deepEqual(state().rules, []); assert.equal(state().rulesError, 'B unavailable');
  await assert.rejects(state().deleteRule('1')); assert.equal(pending.length, 0);

  // Account A/B race and failed B must never leave A writable.
  const aa = state().loadAccountRuleAttachments('A'); const aar = take('/api/accounts');
  const ab = state().loadAccountRuleAttachments('B'); const abr = take('/api/accounts');
  abr.reply([{ account_id: 'B', active_rules: [{ preset_id: 2, scope: { level: 'campaign', ids: ['b'] } }] }]); await ab;
  aar.reply([{ account_id: 'A', active_rules: [{ preset_id: 1 }] }]); await aa;
  assert.equal(state().attachedRulesAccountId, 'B'); assert.deepEqual(Object.keys(state().attachedRuleScopes), ['2']);
  const bad = state().loadAccountRuleAttachments('C'); take('/api/accounts').reply({ detail: 'C unavailable' }, 500); await bad;
  assert.deepEqual(state().attachedRuleScopes, {});
  await state().toggleRuleForEntity('campaign', 'old', '1'); assert.equal(pending.length, 0);

  // Logout/login to the SAME user/workspace invalidates old requests (ABA).
  enter('a'); const logout = state().loadRules(); const logoutReplies = rulesReplies();
  enter(null); enter('a'); replyRules(logoutReplies, [preset(1)]); await logout;
  assert.deepEqual(state().rules, []);
  await seed(); const mutation = state().toggleRuleStatus('1'); const write = take('/api/presets/1', 'PUT');
  enter('b'); write.reply(preset(1)); await mutation;
  assert.equal(pending.length, 0); assert.deepEqual(state().rules, []);

  await seed(); const bulk = state().setRulesEnabled(['1', '2'], false); const first = take('/api/presets/1', 'PUT');
  enter('b'); first.reply(preset(1)); await bulk; assert.equal(pending.length, 0);

  await seed('a', [{ id: 9, name: 'Group', description: '', icon: 'custom', preset_ids: [] }]);
  const create = state().addRule(preset(3), '9'); const creating = take('/api/presets', 'POST');
  enter('b'); creating.reply(preset(3)); await create; assert.equal(pending.length, 0);

  // URL changes immediately, before React commits its scope reset.
  await seed(); window.location.pathname = '/b/rules';
  await assert.rejects(state().deleteRule('1')); assert.equal(pending.length, 0);

  enter('a'); const attach = state().loadAccountRuleAttachments('A');
  take('/api/accounts').reply([{ account_id: 'A', active_rules: [] }]); await attach;
  const toggle = state().toggleRuleForEntity('campaign', 'a', '1');
  const attachmentWrite = pending.shift(); assert.equal(attachmentWrite.workspace, 'a');
  const switched = state().loadAccountRuleAttachments('B');
  take('/api/accounts').reply([{ account_id: 'B', active_rules: [] }]); await switched;
  attachmentWrite.reply({ success: true }); await toggle;
  assert.equal(pending.length, 0); assert.equal(state().attachedRulesAccountId, 'B');
  console.log('Scoped state: workspace/account races, failures, ABA logout, stale targets and mutation continuations passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
