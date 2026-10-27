// Execute the production stores and API client with controlled, delayed HTTP responses.
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
global.window = { location: { pathname: '/a/rules', search: '' }, localStorage: { getItem: () => null }, addEventListener: () => {} };
global.document = { cookie: '' };
// No WebSocket, no sync engine: this checks scoped state over the REST API, which then serves every list.
// The sync engine's client is checked in the browser (scripts/sync-browser.mjs).
global.WebSocket = undefined;
// The client API (/api/graphql, #509) is held as the REST request of its field, as the browser
// checks hold it (scripts/graphql-mock.mjs, whose table of fields this reads), and answered as GraphQL.
const graphqlFields = (() => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/graphql-mock.mjs'), 'utf8');
  const table = /const FIELDS = String\.raw`([\s\S]*?)`;/.exec(source)[1];
  const qs = (params) => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(name, String(item));
    }
    const text = query.toString();
    return text ? `?${text}` : '';
  };
  return new Function('enc', 'qs', `return ${table};`)(encodeURIComponent, qs);
})();
/** One root field held as its REST request; `wrap` makes the field's GraphQL answer from the REST one. */
function fieldAsRest(kind, field, selection, variables) {
  const [method, restUrl] = graphqlFields[field](variables);
  const wrap = (body, status) => {
    if (status >= 400) {
      const message = typeof body?.detail === 'string' ? body.detail : 'Something went wrong';
      return { error: { message, path: [field], extensions: { statusCode: status } } };
    }
    const value = kind === 'query' ? body : Object.fromEntries(selection.split(/\s+/).filter(Boolean)
      .map((name) => [name, name === 'success' ? true : name === 'lastSyncId' ? 0 : body]));
    return { value };
  };
  return { url: restUrl, method, wrap };
}
/** A request as the REST requests it stands for: one, or one per write of a transaction batch (#508). */
function asRest(url, init) {
  if (url !== '/api/graphql') return [{ url, method: init.method, wrap: (body, status) => ({ value: body, status }) }];
  const { query, variables = {} } = JSON.parse(init.body);
  if (/^\s*mutation\s+Transactions\b/.test(query)) {
    return [...query.matchAll(/\b(t\d+):\s*(\w+)\s*(?:\([^)]*\))?\s*\{([^}]*)\}/g)].map(([, alias, field, selection]) => {
      const own = Object.fromEntries(Object.entries(variables)
        .filter(([name]) => name.startsWith(`${alias}_`)).map(([name, value]) => [name.slice(alias.length + 1), value]));
      return { ...fieldAsRest('mutation', field, selection, own), alias };
    });
  }
  const [, kind, field, selection = ''] = /^\s*(query|mutation)\b[^{]*\{\s*(\w+)\s*(?:\([^)]*\))?\s*(?:\{([^}]*)\})?/.exec(query);
  return [{ ...fieldAsRest(kind, field, selection, variables), alias: field }];
}
const pending = [];
global.fetch = (url, init) => new Promise(resolve => {
  const requests = asRest(url, init);
  const answers = new Array(requests.length);
  let left = requests.length;
  const finish = () => {
    if (url !== '/api/graphql') {
      const { value, status } = answers[0];
      resolve({ ok: status < 400, status, json: async () => value });
      return;
    }
    const data = {};
    const errors = [];
    requests.forEach((request, index) => {
      data[request.alias] = answers[index].error ? null : answers[index].value;
      if (answers[index].error) errors.push({ ...answers[index].error, path: [request.alias] });
    });
    resolve({ ok: true, status: 200, json: async () => (errors.length > 0 ? { data, errors } : { data }) });
  };
  requests.forEach((request, index) => pending.push({
    url: request.url, method: request.method, workspace: init.headers.get('X-Workspace-Slug'),
    reply: (body, status = 200) => {
      answers[index] = request.wrap(body, status);
      if (url !== '/api/graphql') answers[index].status = status;
      if ((left -= 1) === 0) finish();
    },
  }));
});
/** Lets the transaction queue send what was just written: it sends once the code making changes is done. */
const sent = () => new Promise((resolve) => setTimeout(resolve, 0));
// The UI state's MobX stores (#510), read as one: each name is found on the store that has it.
const stores = ['scope', 'shell', 'commandMenu', 'inbox', 'notificationSettings', 'view', 'detailsPane', 'selection', 'dialog', 'rules']
  .map(name => load(path.join(root, `models/${name}Store.ts`))[`${name}Store`]);
const all = new Proxy({}, { get: (_, key) => stores.find(store => key in store)?.[key] });
const state = () => all;
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
  return [take('/api/presets'), take('/api/rule-labels'), take('/api/accounts')];
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
  const aa = state().loadRuleAttachments(['A']); const aar = take('/api/accounts');
  const ab = state().loadRuleAttachments(['B']); const abr = take('/api/accounts');
  abr.reply([{ account_id: 'B', active_rules: [{ preset_id: 2, scope: { level: 'campaign', ids: ['b'] } }] }]); await ab;
  aar.reply([{ account_id: 'A', active_rules: [{ preset_id: 1 }] }]); await aa;
  assert.deepEqual(state().attachedRulesAccountIds, ['B']); assert.deepEqual(Object.keys(state().attachedRuleScopes.B), ['2']);
  const bad = state().loadRuleAttachments(['C']); take('/api/accounts').reply({ detail: 'C unavailable' }, 500); await bad;
  assert.deepEqual(state().attachedRuleScopes, {});
  await state().toggleRuleForEntities('C', 'campaign', ['old'], '1'); assert.equal(pending.length, 0);
  await state().toggleRuleForEntities('A', 'campaign', ['old'], '1'); assert.equal(pending.length, 0);

  // Several accounts at once: each keeps its own scopes, the row indexes merge.
  const both = state().loadRuleAttachments(['A', 'B']);
  take('/api/accounts').reply([
    { account_id: 'A', active_rules: [{ preset_id: 1, scope: { level: 'campaign', ids: ['a'] } }] },
    { account_id: 'B', active_rules: [{ preset_id: 2, scope: { level: 'campaign', ids: ['b'] } }] },
  ]); await both;
  assert.deepEqual(Object.keys(state().attachedRuleScopes).sort(), ['A', 'B']);
  assert.deepEqual(state().campaignAttachedRules, { a: ['1'], b: ['2'] });

  // Logout/login to the SAME user/workspace invalidates old requests (ABA).
  enter('a'); const logout = state().loadRules(); const logoutReplies = rulesReplies();
  enter(null); enter('a'); replyRules(logoutReplies, [preset(1)]); await logout;
  assert.deepEqual(state().rules, []);
  await seed(); const mutation = state().toggleRuleStatus('1'); await sent(); const write = take('/api/presets/1', 'PUT');
  enter('b'); write.reply(preset(1)); await mutation;
  assert.equal(pending.length, 0); assert.deepEqual(state().rules, []);

  await seed(); const bulk = state().setRulesEnabled(['1', '2'], false); await sent();
  // Both writes go as one batch of transactions.
  const first = take('/api/presets/1', 'PUT'); const second = take('/api/presets/2', 'PUT');
  enter('b'); first.reply(preset(1)); second.reply(preset(2)); await bulk; assert.equal(pending.length, 0);

  await seed('a', [{ id: 9, name: 'Group', description: '', icon: 'custom', preset_ids: [] }]);
  const create = state().addRule(preset(3), '9'); const creating = take('/api/presets', 'POST');
  enter('b'); creating.reply(preset(3)); await create; assert.equal(pending.length, 0);

  // URL changes immediately, before React commits its scope reset.
  await seed(); window.location.pathname = '/b/rules';
  await assert.rejects(state().deleteRule('1')); assert.equal(pending.length, 0);

  enter('a'); const attach = state().loadRuleAttachments(['A']);
  take('/api/accounts').reply([{ account_id: 'A', active_rules: [] }]); await attach;
  const toggle = state().toggleRuleForEntities('A', 'campaign', ['a'], '1');
  const attachmentWrite = pending.shift(); assert.equal(attachmentWrite.workspace, 'a');
  const switched = state().loadRuleAttachments(['B']);
  take('/api/accounts').reply([{ account_id: 'B', active_rules: [] }]); await switched;
  attachmentWrite.reply({ success: true }); await toggle;
  assert.equal(pending.length, 0); assert.deepEqual(state().attachedRulesAccountIds, ['B']);

  // A deletion batch must not re-read B's same-numbered ids or reload B.
  const { runPendingDeletion, restoreFromTrash } = load(path.join(root, 'components/rules/ruleActions.ts'));
  await seed(); state().requestDeletion('rule', ['1', '2']);
  const deletion = runPendingDeletion(); const deleting = take('/api/presets/1', 'DELETE');
  await seed('b'); deleting.reply({ deleted_item_id: 11 }); await deletion;
  assert.equal(pending.length, 0);

  // Scope changes during the follow-up read also suppress history/toasts.
  const { toastStore } = load(path.join(root, 'ui/toast.ts'));
  const restoration = restoreFromTrash({ id: 11, kind: 'rule', name: 'Old rule' });
  take('/api/deleted-items/11/restore', 'POST').reply({ entity_id: 1, skipped_account_ids: ['A'], missing_rule_ids: [] });
  await new Promise(resolve => setImmediate(resolve));
  const restoreReads = rulesReplies(); enter('a'); replyRules(restoreReads, [preset(1)]); await restoration;
  assert.deepEqual(toastStore.toasts, []);

  // Delivery undo stops its queue after leaving the recorded workspace.
  const { deliveryHistoryEntry } = load(path.join(root, 'lib/delivery.ts'));
  let paints = 0;
  const entry = deliveryHistoryEntry({ label: 'pause', targets: [{ level: 'campaign', entityId: '1', accountId: 'A' }],
    status: 'PAUSED', auditEventIds: [11, 12], onStatus: () => { paints += 1; } });
  const undo = entry.undo(); const undoWrite = pending.shift(); assert.ok(undoWrite);
  enter('b'); undoWrite.reply({}); await undo;
  assert.equal(pending.length, 0); assert.equal(paints, 0);
  await entry.redo(); assert.equal(pending.length, 0);
  console.log('Scoped state: workspace/account races, failures, ABA logout, stale targets and mutation continuations passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
