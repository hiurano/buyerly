// Writes as transactions, as Linear's (#508): the real App on a synthetic API.
//
// - A change is drawn in the same frame, before the server answers, and sent after.
// - Several changes made together go as one GraphQL document.
// - A refused change is undone and its reason shown in a toast.
// - Offline, a change waits and is sent once the network is back; a failed send is tried again.
// - A change not yet sent survives a reload: drawn again from the local database, then sent.
// - A confirmed change stays drawn until the sync engine holds its sync id: a
//   delta that lands before its own doesn't undo it, and its own isn't applied twice.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const root = fileURLToPath(new URL('../frontend/', import.meta.url));
process.chdir(root);
const output = join(tmpdir(), 'buyerly-transactions');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 7, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  id: 1, username: 'olga', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const healthy = {
  status: 'healthy', cause: 'none', signals: {}, consecutive_failures: 0, last_success_at: new Date(Date.now() - 120000).toISOString(),
  last_error_at: null, last_error_code: '', last_error_message: '', last_checked_at: null,
};
const account = {
  id: 100, account_id: 'act_100', name: 'Main account', custom_name: '', note: '', connection_type: 'system_user',
  owner_user_id: 1, lead_user_id: 1, workspace_id: 7, owner_id: '', batch_name: '', timezone_name: 'UTC', currency: 'USD',
  account_status: 1, status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, active_rules: [], group_ids: [],
  latest_metrics: null, today_metrics: null, health: healthy, created_at: '2026-10-01 09:00', primary_result: '',
  target_cost_per_result: null,
};

const user = (id, username, full_name) => ({
  id, username, full_name, first_name: full_name.split(' ')[0], last_name: full_name.split(' ')[1], title: '',
  email: `${username}@example.test`, avatar_url: '', created_at: '2026-09-01T10:00:00',
});
const models = {
  Workspace: [{ id: 7, name: 'Alpha', slug: 'alpha', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', owner_user_id: 1 }],
  User: [user(1, 'olga', 'Olga Owner')],
  WorkspaceMember: [{ id: 11, workspace_id: 7, user_id: 1, role: 'owner', joined_at: '2026-09-01T10:00:00' }],
  Team: [{
    id: 3, workspace_id: 7, name: 'Growth', key: 'GRO', description: '', created_by_user_id: 1,
    created_at: '2026-09-01T10:00:00', updated_at: '2026-09-01T10:00:00', retired_at: null, deleted_at: null, private: false,
  }],
  TeamMember: [{ id: 31, team_id: 3, member_id: 11, joined_at: '2026-09-01T10:00:00', is_owner: true }],
  TeamAccount: [],
  TeamDocument: [{
    id: 5, team_id: 3, title: 'Launch plan', content: 'Week one', created_by_user_id: 1, updated_by_user_id: 1,
    created_at: '2026-10-01T10:00:00', updated_at: '2026-10-02T10:00:00',
  }],
  Account: [{ id: 100, workspace_id: 7, account_id: 'act_100', name: 'Main account', custom_name: '', note: '' }],
  Rule: [], Label: [], RuleLabel: [], InboxEvent: [], InboxNotificationState: [], Favorite: [], ViewSetting: [],
  WorkspaceViewDefault: [], AccountNotificationSetting: [],
};
const syncGroups = ['workspace:7', 'workspace:7:members', 'team:3', 'member:11'];

/** Watches the page's GraphQL documents, and lets a check give a mutation the sync id a real server would. */
function watchGraphql() {
  const mocked = window.fetch;
  window.__graphql = [];
  window.__lastSyncIds = {};
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url, window.location.href).pathname !== '/api/graphql') return mocked(input, init);
    const { query } = JSON.parse(init.body);
    window.__graphql.push(query);
    const response = await mocked(input, init);
    const field = Object.keys(window.__lastSyncIds).find((name) => query.includes(`${name}(`));
    if (!field) return response;
    const payload = await response.json();
    for (const value of Object.values(payload.data ?? {})) if (value) value.lastSyncId = window.__lastSyncIds[field];
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  const unexpected = [];
  /** Every write the REST mocks took, as "<method> <path> <body>". */
  const writes = [];
  /** How the next writes are answered: 'ok', 'refuse' (403) or 'fail' (the network drops them). */
  let mode = 'ok';
  /** While set, writes wait for it: the server is slow. */
  let gate = null;
  const held = { ...account };
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const verb = request.method();
    if (verb !== 'GET') {
      if (gate) await gate.promise;
      if (mode === 'fail') return route.abort('failed');
      if (mode === 'refuse') return route.fulfill({ status: 403, json: { detail: 'Only admins can change this ad account.' } });
      const body = request.postData() ? request.postDataJSON() : {};
      writes.push(`${verb} ${path} ${JSON.stringify(body)}`);
      if (path === '/api/accounts/act_100/profile') {
        Object.assign(held, body);
        return route.fulfill({ json: { account_id: 'act_100', ...body, message: 'Saved' } });
      }
      if (path === '/api/accounts/act_100/toggle-rules') {
        held.rules_enabled = !held.rules_enabled;
        return route.fulfill({ json: { account_id: 'act_100', rules_enabled: held.rules_enabled, message: '' } });
      }
      if (path.startsWith('/api/workspaces/7/teams/3')) return route.fulfill({ json: { id: 3 } });
      errors.push(`Unexpected write: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
    if (path === '/api/accounts') return route.fulfill({ json: [{ ...held }] });
    if (path === '/api/presets') return route.fulfill({ json: [] });
    if (path === '/api/meta/connections') return route.fulfill({ json: [] });
    if (path === '/api/audit-events') return route.fulfill({ json: { items: [], page: 1, page_size: 5, total: 0, total_pages: 1, status_counts: {} } });
    if (path === '/api/analytics/hierarchy/accounts') {
      return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts: [], missing: [] } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    unexpected.push(`GET ${path}`);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  const sync = await mockSync(page, { models, lastSyncId: 100, syncGroups });
  await page.addInitScript(watchGraphql);

  const main = page.locator('main');
  const heading = (name) => main.getByRole('heading', { name, exact: true });
  const unsent = (count) => page.locator(`html[data-unsent-writes="${count}"]`).waitFor({ state: 'attached' });
  const synced = () => page.locator('html[data-sync="synced"]').waitFor({ state: 'attached' });
  const pending = () => page.evaluate(async () => (await import('/src/models/transactions.ts')).transactions.pending.length);
  const hold = () => {
    let release = () => {};
    const promise = new Promise((resolve) => { release = resolve; });
    gate = { promise };
    return () => { gate = null; release(); };
  };
  const rename = async (name) => {
    const field = page.getByRole('textbox', { name: 'Ad account name' });
    await field.fill(name);
    await page.keyboard.press('Enter');
  };

  try {
    await page.goto(`${origin}/alpha/accounts/act_100`);
    await heading('Main account').waitFor();
    await synced();
    await unsent(0);

    // Drawn before the server answers: the rename is on screen while its write waits on the server.
    let release = hold();
    await rename('Leads NL');
    await heading('Leads NL').waitFor();
    await unsent(1);
    assert.equal(writes.length, 0, 'the server has not answered yet');
    release();
    await unsent(0);
    assert.deepEqual(writes, ['PATCH /api/accounts/act_100/profile {"custom_name":"Leads NL","note":""}']);
    assert.match(await page.evaluate(() => window.__graphql.at(-1)), /^mutation AccountUpdate/);

    // Refused: the switch goes off at once, then back on, and the toast says why.
    const automation = page.getByRole('switch', { name: 'Automation' });
    assert.equal(await automation.getAttribute('aria-checked'), 'true');
    mode = 'refuse';
    release = hold();
    await automation.click();
    assert.equal(await automation.getAttribute('aria-checked'), 'false', 'switched off before the server answered');
    release();
    await page.getByText('Only admins can change this ad account.').waitFor();
    await page.getByText("Couldn't turn automation off").waitFor();
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Automation"]')?.getAttribute('aria-checked') === 'true');
    await unsent(0);
    mode = 'ok';

    // Offline: the change is drawn and waits; back online, it is sent.
    await context.setOffline(true);
    await rename('Offline name');
    await heading('Offline name').waitFor();
    await unsent(1);
    await page.waitForTimeout(300);
    assert.equal(writes.length, 1, 'nothing is sent while offline');
    await context.setOffline(false);
    await unsent(0);
    assert.match(writes.at(-1), /"custom_name":"Offline name"/);

    // The network drops the send: tried again, and still drawn after a reload until it gets through.
    mode = 'fail';
    await rename('Kept over reload');
    await heading('Kept over reload').waitFor();
    await unsent(1);
    await page.waitForTimeout(300);
    await page.reload();
    await heading('Kept over reload').waitFor();
    await unsent(1);
    assert.equal(writes.length, 2, 'the failed sends reached nothing');
    mode = 'ok';
    await page.locator('html[data-unsent-writes="0"]').waitFor({ state: 'attached', timeout: 15_000 });
    assert.match(writes.at(-1), /"custom_name":"Kept over reload"/);
    assert.equal(held.custom_name, 'Kept over reload');

    // Made together, sent together: one document for both writes.
    await page.goto(`${origin}/alpha/team/GRO/documents`);
    await main.getByText('Launch plan').first().waitFor();
    await synced();
    const before = await page.evaluate(() => window.__graphql.length);
    await page.evaluate(async () => {
      const { updateTeam, addTeamAccounts } = await import('/src/lib/teams.ts');
      await Promise.all([updateTeam(7, 3, { description: 'Buys traffic' }), addTeamAccounts(7, 3, [100])]);
    });
    const sent = await page.evaluate((from) => window.__graphql.slice(from), before);
    assert.equal(sent.length, 1, `one request for both: ${sent.join('\n')}`);
    assert.match(sent[0], /^mutation Transactions\(.*\) \{ t0: teamUpdate\(.*\) .* t1: teamAccountsAdd\(/s);
    assert.ok(writes.some((write) => write.startsWith('PATCH /api/workspaces/7/teams/3 {"description":"Buys traffic"}')), writes.join('\n'));
    assert.ok(writes.some((write) => write.startsWith('POST /api/workspaces/7/teams/3/accounts {"account_ids":[100]}')), writes.join('\n'));

    // Confirmed at sync id 106: drawn over the synced models until the socket brings 106.
    await page.evaluate(() => { window.__lastSyncIds = { teamUpdate: 106 }; });
    await page.evaluate(async () => {
      const { updateTeam } = await import('/src/lib/teams.ts');
      void updateTeam(7, 3, { name: 'Growth Lab' });
    });
    await page.getByText('Growth Lab', { exact: true }).first().waitFor();
    await unsent(0);
    assert.equal(await pending(), 1, 'confirmed, waiting for its delta');
    // Another change lands first, with the team as the server held it before: the new name stays.
    sync.push([{ sync_id: 105, model: 'TeamDocument', model_id: '5', action: 'update', data: { title: 'Launch plan v2', updated_at: '2026-10-21T10:00:00' } }]);
    await main.getByText('Launch plan v2').first().waitFor();
    assert.equal(await page.getByText('Growth Lab', { exact: true }).count() > 0, true, 'still drawn after an older delta');
    assert.equal(await page.getByText('Growth', { exact: true }).count(), 0);
    assert.equal(await pending(), 1);
    // Its own delta: the overlay comes off, the name stays, nothing is drawn twice.
    sync.push([{ sync_id: 106, model: 'Team', model_id: '3', action: 'update', data: { name: 'Growth Lab', updated_at: '2026-10-21T11:00:00' } }]);
    for (let tries = 0; tries < 100 && (await pending()) > 0; tries += 1) await page.waitForTimeout(50);
    assert.equal(await pending(), 0, 'its own delta settles it');
    await page.getByText('Growth Lab', { exact: true }).first().waitFor();

    // A refused delete brings the document back.
    mode = 'refuse';
    release = hold();
    await page.evaluate(async () => {
      const { deleteTeamDocument } = await import('/src/lib/teams.ts');
      void deleteTeamDocument(7, 3, 5).catch(() => {});
    });
    await main.getByText('Launch plan v2').first().waitFor({ state: 'detached' });
    release();
    await main.getByText('Launch plan v2').first().waitFor();
    mode = 'ok';

    await page.screenshot({ path: `${output}/transactions.png` });
    assert.deepEqual(errors, []);
    // Synced lists, an empty model's too, came from the local database after the reload, never the server.
    assert.deepEqual(unexpected.filter((read) => /\/teams$|\/rule-labels$|\/documents$/.test(read)), []);
    console.log('Transactions: drawn before the server answers, batched, refused ones undone with a toast, sent after offline and a reload, kept until their delta');
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error(errors, unexpected, writes);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
