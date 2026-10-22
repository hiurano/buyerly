// Run in CI; compile the pure Ad accounts model without adding a test runtime (#388).
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
  ACCOUNTS_VIEW_DEFAULTS, accountName, accountStatus, connectionProblem, sortAccounts, accountGroupsFor,
  createAccountFilterFields, naturalAccountDirection, formatAddedDate, accountPagePath, accountAdsManagerPath,
} = load(path.join(root, 'components/accounts/accountsModel.ts'));
const { applyFilterClauses } = load(path.join(root, 'components/filters/filterModel.ts'));
const { parseRoute, pathForTab } = load(path.join(root, 'lib/routing.ts'));

const account = (id, fields = {}) => ({
  id, account_id: `act_${id}`, name: `Meta ${id}`, custom_name: '', note: '', connection_type: 'facebook_login',
  account_status: 1, status_label: 'Active (ACTIVE)', rules_enabled: false, is_active: true, active_rules: [],
  currency: 'USD', created_at: '2026-10-01 10:00', today_metrics: null,
  health: { status: 'healthy', cause: 'none', consecutive_failures: 0, last_success_at: null, last_error_at: null, last_error_code: '', last_error_message: '', last_checked_at: null },
  ...fields,
});
const accounts = [
  account(1, { custom_name: 'Bravo', today_metrics: { spend: 50, leads: 2, registrations: 0, cpl: 25, cpreg: null } }),
  account(2, { name: 'alpha', account_status: 3, rules_enabled: true, active_rules: [{ preset_id: 7, name: 'Stop' }], created_at: '2026-10-05 08:00' }),
  account(3, { name: 'Charlie', account_status: 2, health: { status: 'critical', cause: 'user', last_error_message: 'Token expired' }, today_metrics: { spend: 300, leads: 0, registrations: 1, cpl: null, cpreg: 300 } }),
];
const teams = [{ id: 10, name: 'Media', account_ids: [1, 3] }];

// Defaults: list, no grouping, Name A→Z, the columns a buyer needs, Lead as Linear's Projects.
assert.equal(ACCOUNTS_VIEW_DEFAULTS.grouping, 'none');
assert.equal(ACCOUNTS_VIEW_DEFAULTS.ordering, 'name');
assert.deepEqual(Object.keys(ACCOUNTS_VIEW_DEFAULTS.properties), ['status', 'lead', 'spend', 'leads', 'rules']);

// The buyer's own name wins over Meta's; Meta's status reads in words.
assert.equal(accountName(accounts[0]), 'Bravo');
assert.equal(accountName(accounts[1]), 'alpha');
assert.equal(accountStatus(accounts[1]).label, 'Unsettled');
assert.equal(accountStatus(accounts[2]).label, 'Disabled');
assert.equal(accountStatus(account(9, { account_status: 999 })).label, 'Unknown');

// A connection problem only while the health is degraded or critical, or the connection is gone.
assert.equal(connectionProblem(accounts[0]), null);
assert.equal(connectionProblem(accounts[2]), 'Token expired');
assert.match(connectionProblem(account(4, { health: { status: 'degraded', cause: 'meta', last_error_message: '' } })), /Meta is not answering/);
assert.match(connectionProblem(account(5, { status_label: 'Meta connection required', health: undefined })), /Reconnect/);

// Ordering: names case-insensitively, spend largest first with no figure last, newest added first.
const ids = (list) => list.map((item) => item.id);
assert.deepEqual(ids(sortAccounts(accounts, 'name', 'asc')), [2, 1, 3]);
assert.deepEqual(ids(sortAccounts(accounts, 'name', 'desc')), [3, 1, 2]);
assert.deepEqual(ids(sortAccounts(accounts, 'spend', 'desc')), [3, 1, 2]);
assert.deepEqual(ids(sortAccounts(accounts, 'spend', 'asc')), [1, 3, 2], 'no figure stays last');
assert.deepEqual(ids(sortAccounts(accounts, 'added', 'desc')), [2, 1, 3]);
assert.deepEqual(ids(sortAccounts(accounts, 'status', 'asc')), [1, 2, 3], 'Active, then payment issues, then Disabled');
assert.equal(naturalAccountDirection('spend'), 'desc');
assert.equal(naturalAccountDirection('name'), 'asc');

// Grouping: every status and every team, with "No team" last.
const byTeam = accountGroupsFor('team', accounts, teams);
assert.deepEqual(byTeam.map((group) => [group.label, ids(group.rows)]), [['Media', [1, 3]], ['No team', [2]]]);
const byStatus = accountGroupsFor('status', accounts, teams).filter((group) => group.rows.length);
assert.deepEqual(byStatus.map((group) => group.label), ['Active', 'Unsettled', 'Disabled']);
assert.deepEqual(accountGroupsFor('none', accounts, teams), []);

// Grouping by Lead, as Linear's Projects: each member who leads, then "No lead".
const leads = [{ user_id: 5, name: 'Bo Buyer' }, { user_id: 6, name: 'Ann Admin' }];
const led = accounts.map((account, index) => ({ ...account, lead_user_id: index === 0 ? 5 : null }));
assert.deepEqual(
  accountGroupsFor('lead', led, teams, leads).map((group) => [group.label, ids(group.rows)]),
  [['Bo Buyer', [led[0].id]], ['Ann Admin', []], ['No lead', led.slice(1).map((account) => account.id)]],
);

// Filter: Status, Team, Lead, Automation, Name or ID.
const fields = createAccountFilterFields(accounts, teams);
assert.deepEqual(fields.map((field) => field.id), ['status', 'team', 'lead', 'automation', 'name']);
const leadFields = createAccountFilterFields(led, teams, leads);
assert.deepEqual(ids(applyFilterClauses(led, leadFields, [{ fieldId: 'lead', operator: 'is', values: ['5'] }])), [led[0].id]);
assert.deepEqual(ids(applyFilterClauses(led, leadFields, [{ fieldId: 'lead', operator: 'is', values: ['none'] }])), led.slice(1).map((account) => account.id));
const filter = (clauses) => ids(applyFilterClauses(accounts, fields, clauses));
assert.deepEqual(filter([{ fieldId: 'status', operator: 'is', values: ['active'] }]), [1]);
assert.deepEqual(filter([{ fieldId: 'team', operator: 'is', values: ['none'] }]), [2]);
assert.deepEqual(filter([{ fieldId: 'team', operator: 'is_not', values: ['10'] }]), [2]);
assert.deepEqual(filter([{ fieldId: 'automation', operator: 'is', values: ['on'] }]), [2]);
assert.deepEqual(filter([{ fieldId: 'name', operator: 'contains', values: ['ACT_3'] }]), [3]);
assert.deepEqual(filter([{ fieldId: 'name', operator: 'contains', values: ['brav'] }]), [1]);
assert.equal(fields[0].options.find((option) => option.value === 'active').count, 1);

assert.equal(formatAddedDate('2026-10-05 08:00'), 'Oct 5, 2026');
assert.equal(formatAddedDate(''), '—');

// Addresses: /accounts and /accounts/{act_id}; Ads Manager opens on the account.
assert.equal(accountPagePath('alpha', 'act_1'), '/alpha/accounts/act_1');
const onlyAct1 = [{ fieldId: 'account', operator: 'is', values: ['act_1'] }];
assert.equal(accountAdsManagerPath('alpha', 'act_1'),
  `/alpha/ads-manager/campaigns?filter=${encodeURIComponent(JSON.stringify({ campaigns: onlyAct1, adsets: onlyAct1, ads: onlyAct1 }))}`);
assert.equal(pathForTab('alpha', 'accounts'), '/alpha/accounts');
const at = (pathname) => parseRoute({ pathname, search: '' });
assert.deepEqual(at('/alpha/accounts'), { kind: 'workspace', workspace: 'alpha', tab: 'accounts', recordId: undefined });
assert.deepEqual(at('/alpha/accounts/act_1'), { kind: 'workspace', workspace: 'alpha', tab: 'accounts', recordId: 'act_1' });
assert.equal(at('/alpha/accounts/act_1/x').kind, 'unknown');

console.log('accounts model ok');
