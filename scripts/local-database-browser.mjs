// The local database, as Linear's (#496): the real App on a synthetic API
// whose bootstrap holds the workspace's models.
//
// - After a reload, Ad accounts, Inbox and Members draw their last data while
//   /api/me and the REST lists are still on their way, with no bootstrap: the
//   socket asks only for what changed since the last sync id kept.
// - A database written by another schema version is dropped and bootstrapped.
// - Log out deletes the local database and the remembered profile.
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
const output = join(tmpdir(), 'buyerly-local-database');
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
const notification = {
  id: 3, workspace_id: 7, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'STOP',
  status: 'SUCCESS', account_id: 'act_100', account_name: 'Main account', adset_id: '', adset_name: '',
  entity_level: 'adset', entity_id: '903', entity_name: 'Ad set 3', rule_id: 3,
  rule_name: 'Stop without leads', action: 'STOP', message: 'Spent $4.50 with 0 leads', correlation_id: null,
  reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
  can_undo: false, undo_reason: '', duration_ms: 12, created_at: new Date(Date.now() - 3_600_000).toISOString(),
  kind: 'rule_actions', is_read: false, snoozed_until: null, unsnoozed_at: null,
};

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
    id: 3, workspace_id: 7, name: 'Growth', key: 'GRO', description: '', created_by_user_id: 1,
    created_at: '2026-09-01T10:00:00', updated_at: '2026-09-01T10:00:00', retired_at: null, deleted_at: null, private: false,
  }],
  TeamMember: [{ id: 31, team_id: 3, member_id: 11, joined_at: '2026-09-01T10:00:00', is_owner: true }],
  TeamAccount: [{ id: 41, team_id: 3, account_id: 100, created_at: '2026-09-03T10:00:00' }],
  TeamDocument: [],
  Account: [{ id: 100, workspace_id: 7, account_id: 'act_100', name: 'Main account', custom_name: '', note: '' }],
  Rule: [], Label: [], RuleLabel: [], InboxEvent: [], InboxNotificationState: [], Favorite: [], ViewSetting: [],
  WorkspaceViewDefault: [], AccountNotificationSetting: [],
};
const syncGroups = ['workspace:7', 'workspace:7:members', 'team:3', 'member:11'];

/** The kept databases and the remembered profile, as the page sees them. */
const kept = (page) => page.evaluate(async () => ({
  databases: (await indexedDB.databases()).map(({ name }) => name).filter((name) => name.startsWith('buyerly_')),
  session: localStorage.getItem('buyerly-session'),
}));

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
  // While held, the profile and the REST lists the pages show don't answer: what is drawn comes from the local database.
  let held = null;
  const hold = () => {
    let release = () => {};
    held = new Promise((resolve) => { release = resolve; });
    return () => { held = null; release(); };
  };
  let signedOut = false;
  const HELD = ['/api/me', '/api/accounts', '/api/inbox'];
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push(`${request.method()} ${path}`);
    if (held && HELD.includes(path)) await held;
    if (request.method() === 'POST' && path === '/api/auth/logout') {
      signedOut = true;
      return route.fulfill({ json: {} });
    }
    if (signedOut && path === '/api/me') return route.fulfill({ status: 401, json: { detail: 'Not signed in' } });
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
    if (path === '/api/accounts') return route.fulfill({ json: [account] });
    if (path === '/api/workspaces/7/invites') return route.fulfill({ json: [] });
    if (path === '/api/meta/connections') return route.fulfill({ json: [] });
    if (path === '/api/analytics/hierarchy/accounts') {
      return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts: [], missing: [] } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { items: [notification], has_more: false, unread_count: 1, priority_unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 1, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/inbox/facets') return route.fulfill({ json: { type: [], status: [], account: [], from: [] } });
    if (path === '/api/inbox/senders') return route.fulfill({ json: [] });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    errors.push(`Unexpected API request: GET ${path}`);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  const sync = await mockSync(page, { models, lastSyncId: 100, syncGroups });
  const synced = () => page.locator('html[data-sync="synced"]').waitFor({ state: 'attached' });
  const main = page.locator('main');
  const go = (path) => page.evaluate((to) => {
    history.pushState({}, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);

  try {
    // A first visit: bootstrap, then Inbox, Ad accounts and Members read and kept.
    await page.goto(`${origin}/alpha/inbox`, { timeout: 120_000 });
    await main.getByText('Spent $4.50 with 0 leads').first().waitFor();
    await synced();
    await go('/alpha/accounts');
    await main.getByText('Main account').first().waitFor();
    await go('/alpha/members');
    await main.getByText('Bob Buyer', { exact: true }).waitFor();
    sync.push([{ sync_id: 101, model: 'User', model_id: '2', action: 'update', data: { full_name: 'Bob Builder' } }]);
    await main.getByText('Bob Builder', { exact: true }).waitFor();
    assert.equal(sync.state.bootstraps, 1);
    // The pool's lists are written a moment after they change.
    await page.waitForTimeout(1_500);
    assert.equal((await kept(page)).databases.length, 1, 'one database for the workspace');

    // Committed while the tab is away: the next start catches up on it.
    sync.commit([{ sync_id: 102, model: 'User', model_id: '2', action: 'update', data: { full_name: 'Bob Brown' } }]);

    // A reload draws each page from the local database before the server answers.
    let release = hold();
    await page.goto(`${origin}/alpha/accounts`);
    await main.getByText('Main account').first().waitFor();
    await go('/alpha/inbox');
    await main.getByText('Spent $4.50 with 0 leads').first().waitFor();
    await go('/alpha/members');
    await main.getByText(/^Bob B(uilder|rown)$/).waitFor();
    await main.getByText('Bob Brown', { exact: true }).waitFor();
    await synced();
    assert.equal(sync.state.bootstraps, 1, 'a reload opens on the kept models, with no bootstrap');
    assert.equal(sync.state.sockets.at(-1).since, 101, 'the socket asks from the last sync id kept');
    await page.screenshot({ path: `${output}/reloaded.png` });
    release();
    await page.waitForTimeout(300);

    // Another schema version's database is dropped, never read: the next start bootstraps.
    await page.evaluate(async () => {
      const [{ name }] = (await indexedDB.databases()).filter((database) => database.name.startsWith('buyerly_'));
      await new Promise((resolve, reject) => {
        const opening = indexedDB.open(name, 999);
        opening.onsuccess = () => { opening.result.close(); resolve(); };
        opening.onerror = () => reject(opening.error);
      });
    });
    await page.goto(`${origin}/alpha/members`);
    // The mock's bootstrap gives the models as first sent: drawn from it, not from the dropped database.
    await main.getByText('Bob Buyer', { exact: true }).waitFor();
    await synced();
    assert.equal(sync.state.bootstraps, 2, 'a database of another schema version bootstraps again');
    const version = await page.evaluate(async () => (await indexedDB.databases()).find(({ name }) => name.startsWith('buyerly_')).version);
    assert.equal(version, 1, 'the database is made again with this schema version');

    // Log out deletes the local database and the remembered profile.
    await page.waitForTimeout(1_500);
    assert.notEqual((await kept(page)).session, null);
    await page.keyboard.press('Alt+Shift+KeyQ');
    await page.waitForURL('**/login');
    await page.getByRole('heading', { name: 'Log in to Buyerly', exact: true }).waitFor();
    assert.deepEqual(await kept(page), { databases: [], session: null }, 'nothing of the account is kept after log out');

    assert.deepEqual(errors, []);
    console.log('Local database: a reload draws Inbox, Ad accounts and Members before the server answers and catches up from the kept sync id, another schema version bootstraps again, and log out deletes it');
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(errors, requests.slice(-12), sync.state.bootstraps, sync.state.sockets.map(({ since }) => since), await main.innerText().catch(() => ''));
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
