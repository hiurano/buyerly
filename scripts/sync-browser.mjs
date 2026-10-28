// The sync engine's client, as Linear's (#507): the real App on a synthetic
// API whose bootstrap holds the workspace's models.
//
// - Members and a team's documents open on the synced models: no request to
//   their REST lists, before or after; Your teams lists the member's team.
// - A change pushed over the socket redraws the open page with no request.
// - A dropped socket opens again from the last sync id held, and what was
//   committed while it was down arrives first (catch-up), with no bootstrap.
// - Close code 4410 reads bootstrap again.
// - Rules opened as the first page takes its labels from the synced models,
//   even before the socket is live: no request to /api/rule-labels.
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
const output = join(tmpdir(), 'buyerly-sync');
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
const account = {
  id: 100, account_id: 'act_100', name: 'Main account', custom_name: '', note: '', lead_user_id: 1,
  connection_type: 'system_user', timezone_name: 'UTC', currency: 'USD', account_status: 1,
  status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, primary_result: '',
  target_cost_per_result: null, active_rules: [],
};

// The rows as bootstrap sends them: to_jsonb of each table, timestamps without a zone.
const user = (id, username, full_name) => ({
  id, username, full_name, first_name: full_name.split(' ')[0], last_name: full_name.split(' ')[1], title: '',
  email: `${username}@example.test`, avatar_url: '', created_at: '2026-09-01T10:00:00',
});
const workspaceMember = (id, user_id, role, joined_at) => ({ id, workspace_id: 7, user_id, role, joined_at });
const models = {
  Workspace: [{ id: 7, name: 'Alpha', slug: 'alpha', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', owner_user_id: 1 }],
  User: [user(1, 'olga', 'Olga Owner'), user(2, 'bob', 'Bob Buyer')],
  WorkspaceMember: [workspaceMember(11, 1, 'owner', '2026-09-01T10:00:00'), workspaceMember(12, 2, 'member', '2026-09-02T10:00:00')],
  Team: [{
    id: 3, workspace_id: 7, name: 'Growth', key: 'GRO', description: 'Buys traffic for the launches', created_by_user_id: 1,
    created_at: '2026-09-01T10:00:00', updated_at: '2026-09-01T10:00:00', retired_at: null, deleted_at: null, private: false,
  }],
  TeamMember: [
    { id: 31, team_id: 3, member_id: 11, joined_at: '2026-09-01T10:00:00', is_owner: true },
    { id: 32, team_id: 3, member_id: 12, joined_at: '2026-09-02T10:00:00', is_owner: false },
  ],
  TeamAccount: [{ id: 41, team_id: 3, account_id: 100, created_at: '2026-09-03T10:00:00' }],
  TeamDocument: [{
    id: 5, team_id: 3, title: 'Launch plan', content: 'Week one', created_by_user_id: 1, updated_by_user_id: 1,
    created_at: '2026-10-01T10:00:00', updated_at: '2026-10-02T10:00:00',
  }],
  Account: [{ id: 100, workspace_id: 7, account_id: 'act_100', name: 'Main account', custom_name: '', note: '' }],
  Rule: [], Label: [{ id: 21, workspace_id: 7, name: 'Launch', color: '#4cb782', description: '', created_at: '2026-09-05T10:00:00' }],
  RuleLabel: [{ id: 51, preset_id: 61, group_id: 21, created_at: '2026-09-06T10:00:00' }], InboxEvent: [], InboxNotificationState: [], Favorite: [], ViewSetting: [],
  WorkspaceViewDefault: [], AccountNotificationSetting: [],
};
// Rules are still read from the server (#507: their runtime fields are worked out there); their labels are synced.
const rulePreset = {
  id: 61, name: 'Stop ad sets without leads', action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5, budget_change_percent: 0, budget_max_daily: 0,
  needs_review: false, created_at: '2026-09-06T10:00:00Z', review_reason: '', last_run_at: '', last_checked_at: '',
  attached_account_ids: [], attached_scopes: {}, label_ids: [21],
};
const syncGroups = ['workspace:7', 'workspace:7:members', 'team:3', 'member:11'];
/** REST lists the synced models replace: none of them may be read. */
const SYNCED_PATHS = [/\/api\/workspaces\/7\/members$/, /\/api\/workspaces\/7\/teams$/, /\/documents$/, /\/api\/rule-labels$/];

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
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push(`${request.method()} ${path}`);
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (SYNCED_PATHS.some((pattern) => pattern.test(path))) {
      errors.push(`Read from the server instead of the synced models: ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
    if (path === '/api/accounts') return route.fulfill({ json: [account] });
    if (path === '/api/presets') return route.fulfill({ json: [rulePreset] });
    if (path === '/api/workspaces/7/invites') return route.fulfill({ json: [] });
    // Meta Ads data isn't synced: Ads Manager's rows are read from the server at start, as before.
    if (path === '/api/meta/connections') return route.fulfill({ json: [] });
    if (path === '/api/analytics/hierarchy/accounts') {
      return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts: [], missing: [] } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    errors.push(`Unexpected API request: GET ${path}`);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  const sync = await mockSync(page, { models, lastSyncId: 100, syncGroups });
  const synced = () => page.locator('html[data-sync="synced"]').waitFor({ state: 'attached' });
  const main = page.locator('main');

  try {
    // Members opens on the synced models.
    await page.goto(`${origin}/${workspace.slug}/members`);
    await main.getByText('Bob Buyer', { exact: true }).waitFor();
    await synced();
    assert.equal(sync.state.bootstraps, 1);
    assert.equal(sync.state.sockets[0].since, 100, 'the socket opens from bootstrap\'s sync id');
    // Your teams lists the team the member is on, from the same models (#552: it stayed empty).
    await page.locator('#sidebar-section-teams .sidebar-team-name', { hasText: 'Growth' }).waitFor();

    // A delta redraws the open page and asks the server nothing.
    let before = requests.length;
    sync.push([
      { sync_id: 101, model: 'User', model_id: '2', action: 'update', data: { full_name: 'Bob Builder' } },
      { sync_id: 102, model: 'User', model_id: '3', action: 'insert', data: user(3, 'carol', 'Carol Guest') },
      { sync_id: 103, model: 'WorkspaceMember', model_id: '13', action: 'insert', data: workspaceMember(13, 3, 'guest', '2026-10-20T10:00:00') },
    ]);
    await main.getByText('Bob Builder', { exact: true }).waitFor();
    await main.getByText('Carol Guest', { exact: true }).waitFor();
    assert.equal(await main.getByText('Bob Buyer', { exact: true }).count(), 0);
    await page.waitForTimeout(300);
    assert.deepEqual(requests.slice(before), [], 'a delta reads nothing from the server');

    // A team's documents open on the synced models too.
    await page.evaluate(() => {
      history.pushState({}, '', '/alpha/team/GRO/documents');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await main.getByText('Launch plan').first().waitFor();

    // The socket drops; a change is committed meanwhile; the next socket catches up from 103.
    before = requests.length;
    sync.commit([{ sync_id: 104, model: 'TeamDocument', model_id: '5', action: 'update', data: { title: 'Launch plan v2', updated_at: '2026-10-21T10:00:00' } }]);
    await sync.drop();
    await page.locator('html[data-sync="offline"]').waitFor({ state: 'attached' });
    await main.getByText('Launch plan v2').first().waitFor();
    await synced();
    assert.equal(sync.state.sockets.length, 2);
    assert.equal(sync.state.sockets[1].since, 103, 'the socket opens again from the last sync id held');
    assert.equal(sync.state.bootstraps, 1, 'a reconnect catches up without a bootstrap');
    assert.deepEqual(requests.slice(before), [], 'a reconnect reads nothing but the socket');

    // A delete over the new socket takes the document off the page.
    sync.push([{ sync_id: 105, model: 'TeamDocument', model_id: '5', action: 'delete', data: {} }]);
    await main.getByText('Launch plan v2').first().waitFor({ state: 'detached' });

    // 4410: the log no longer reaches back that far, so bootstrap is read again.
    await sync.drop(4410);
    for (let tries = 0; tries < 100 && sync.state.sockets.length < 3; tries += 1) await page.waitForTimeout(50);
    await synced();
    assert.equal(sync.state.bootstraps, 2, '4410 reads bootstrap again');
    assert.equal(sync.state.sockets.at(-1).since, 105);

    // Rules opened first, on a fresh load: its labels come from bootstrap's models, not /api/rule-labels.
    await page.goto(`${origin}/${workspace.slug}/rules`);
    await main.getByText('Stop ad sets without leads').first().waitFor();
    await main.getByText('Launch', { exact: true }).first().waitFor();
    await synced();
    await page.waitForTimeout(300);
    assert.equal(requests.filter((request) => request.endsWith('/api/rule-labels')).length, 0, 'Rules reads no labels from the server');

    await page.screenshot({ path: `${output}/sync.png` });
    assert.deepEqual(errors, []);
    console.log('Sync engine: pages open on bootstrap, a pushed delta redraws them with no request, a dropped socket catches up from its last sync id, 4410 bootstraps again, and Rules takes its labels from the synced models');
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(errors, requests);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
