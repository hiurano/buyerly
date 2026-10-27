// A change to one model re-renders only the components that show it (#500),
// as Linear's MobX observers: the real App on a synthetic API whose bootstrap
// holds the workspace's models, and a render counter on React's DevTools hook.
// - Members: a user's name changes over the socket; that member's row draws
//   again, the other rows and the page around them do not.
// - Rules, grouped by label: a label is renamed over the socket; the row
//   carrying it draws again, the other rules' rows and cells do not (the
//   groups' frames do: the grouping reads the labels).
// - Ad accounts: an account is renamed over the socket; its row alone draws.
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
const output = join(tmpdir(), 'buyerly-rerender');
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
const user = (id, username, full_name) => ({
  id, username, full_name, first_name: full_name.split(' ')[0], last_name: full_name.split(' ')[1], title: '',
  email: `${username}@example.test`, avatar_url: '', created_at: '2026-09-01T10:00:00',
});
const workspaceMember = (id, user_id, role, joined_at) => ({ id, workspace_id: 7, user_id, role, joined_at });
const label = (id, name, color) => ({ id, workspace_id: 7, name, color, description: '', created_at: '2026-09-05T10:00:00' });
const models = {
  Workspace: [{ id: 7, name: 'Alpha', slug: 'alpha', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', owner_user_id: 1 }],
  User: [user(1, 'olga', 'Olga Owner'), user(2, 'bob', 'Bob Buyer'), user(3, 'carol', 'Carol Media'), user(4, 'dan', 'Dan Data')],
  WorkspaceMember: [
    workspaceMember(11, 1, 'owner', '2026-09-01T10:00:00'), workspaceMember(12, 2, 'member', '2026-09-02T10:00:00'),
    workspaceMember(13, 3, 'member', '2026-09-03T10:00:00'), workspaceMember(14, 4, 'member', '2026-09-04T10:00:00'),
  ],
  Team: [], TeamMember: [], TeamAccount: [], TeamDocument: [], Account: [], Rule: [],
  Label: [label(21, 'Launch', '#4cb782'), label(22, 'Scaling', '#bb87fc')],
  RuleLabel: [
    { id: 51, preset_id: 61, group_id: 21, created_at: '2026-09-06T10:00:00' },
    { id: 52, preset_id: 62, group_id: 22, created_at: '2026-09-06T10:00:00' },
  ],
  InboxEvent: [], InboxNotificationState: [], Favorite: [], ViewSetting: [], WorkspaceViewDefault: [], AccountNotificationSetting: [],
};
const healthy = {
  status: 'healthy', cause: 'none', signals: {}, consecutive_failures: 0, last_success_at: '2026-10-27T09:00:00Z',
  last_error_at: null, last_error_code: '', last_error_message: '', last_checked_at: null,
};
const adAccount = (id, name) => ({
  id, account_id: `act_${id}`, name, custom_name: '', note: '', connection_type: 'facebook_login', lead_user_id: 1,
  owner_user_id: 1, workspace_id: 7, timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
  rules_enabled: false, is_active: true, active_rules: [], group_ids: [], latest_metrics: null, today_metrics: null,
  health: healthy, created_at: '2026-10-01 09:00',
});
const adAccounts = [adAccount(101, 'NL · Lead gen'), adAccount(102, 'DE · E-commerce'), adAccount(103, 'US · Sweepstakes')];
models.Account = adAccounts.map((item) => ({ id: item.id, workspace_id: 7, account_id: item.account_id, name: item.name, custom_name: '', note: '' }));
const syncGroups = ['workspace:7', 'workspace:7:members', 'member:11'];
const rulePreset = (id, name, labelIds) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5, budget_change_percent: 0, budget_max_daily: 0,
  needs_review: false, created_at: '2026-09-06T10:00:00Z', review_reason: '', last_run_at: '', last_checked_at: '',
  attached_account_ids: [], attached_scopes: {}, label_ids: labelIds,
});
const presets = [
  rulePreset(61, 'Stop ad sets without leads', [21]),
  rulePreset(62, 'Budget up on cheap leads', [22]),
  rulePreset(63, 'Tell me about expensive leads', []),
];

/**
 * Stands in for React DevTools before the app loads: on each commit, the
 * function components that rendered in it (PerformedWork), each with the text
 * it drew, while `__renders` is recording.
 */
function countRenders() {
  const COMPONENTS = [0, 11, 14, 15], PERFORMED_WORK = 1; // function, forwardRef, memo, simple memo
  const nameOf = (type) => type?.displayName || type?.name || type?.render?.displayName || type?.render?.name || type?.type?.name || 'Anonymous';
  const hostText = (fiber) => {
    let node = fiber.child;
    while (node && !node.stateNode?.nodeType) node = node.child;
    return node?.stateNode?.textContent?.slice(0, 80) ?? '';
  };
  const renders = { recording: false, list: [] };
  window.__renders = renders;
  // As React DevTools walks a commit: a parent whose children are the ones it
  // had before bailed out, and nothing under it rendered.
  const walk = (parent, inside) => {
    if (parent.alternate && parent.child === parent.alternate.child) return;
    for (let node = parent.child; node; node = node.sibling) {
      const rendered = COMPONENTS.includes(node.tag) && node.alternate !== null && (node.flags & PERFORMED_WORK) !== 0;
      // `root`: the first component of its branch that rendered; whatever renders under it may be its doing.
      if (rendered) renders.list.push({ name: nameOf(node.type), text: hostText(node), root: !inside });
      walk(node, inside || rendered);
    }
  };
  let next = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) { next += 1; this.renderers.set(next, renderer); return next; },
    onCommitFiberRoot(_id, root) { if (renders.recording) walk(root.current, false); },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {},
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
  await page.addInitScript(countRenders);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/presets') return route.fulfill({ json: presets });
    if (path === '/api/accounts') return route.fulfill({ json: adAccounts });
    if (path === '/api/analytics/hierarchy/accounts') {
      return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts: [], missing: [] } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });
  const sync = await mockSync(page, { models, lastSyncId: 100, syncGroups });
  const main = page.locator('main');
  let syncId = 100;

  /** The components that rendered while `change` was pushed and drawn. */
  const rendersOf = async (change, drawn) => {
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__renders.list = []; window.__renders.recording = true; });
    syncId += 1;
    sync.push([{ sync_id: syncId, ...change }]);
    await drawn();
    await page.waitForTimeout(500);
    return page.evaluate(() => { window.__renders.recording = false; return window.__renders.list; });
  };

  try {
    // Members: one user renamed.
    await page.goto(`${origin}/${workspace.slug}/members`);
    await main.getByText('Dan Data', { exact: true }).waitFor();
    await page.locator('html[data-sync="synced"]').waitFor({ state: 'attached' });
    const members = await rendersOf(
      { model: 'User', model_id: '2', action: 'update', data: { full_name: 'Bob Builder' } },
      () => main.getByText('Bob Builder', { exact: true }).waitFor(),
    );
    const rows = (renders) => renders.filter((render) => render.name === 'BuyerlyDataListRow').map((render) => render.text);
    assert.deepEqual(rows(members), ['BoBob BuilderbobMemberSep 2'], 'only the renamed member\'s row draws again');
    assert.ok(!members.some((render) => render.name === 'Sidebar' || render.name === 'SidebarContent'), 'the sidebar does not draw again');

    // Rules: one label renamed.
    await page.evaluate(() => {
      history.pushState({}, '', '/alpha/rules');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await main.getByText('Tell me about expensive leads').waitFor();
    const rules = await rendersOf(
      { model: 'Label', model_id: '21', action: 'update', data: { name: 'Launch week' } },
      () => main.getByText('Launch week').first().waitFor(),
    );
    // Grouped by label, the groups are laid out again (their frames and headers draw); of the rows, only
    // the one carrying the label draws, and nothing inside the other rules' rows.
    assert.equal(rows(rules).length, 1, `only the row carrying the label draws again: ${rows(rules).join(' | ')}`);
    assert.match(rows(rules)[0], /^Stop ad sets without leadsLaunch week/);
    assert.ok(!rules.some((render) => /^(Budget up|Tell me about)/.test(render.text) && !/^BuyerlyDataList(Group|Stack)/.test(render.name)), 'no other rule\'s cells draw again');

    await page.screenshot({ path: `${output}/rules.png` });

    // Ad accounts: one account renamed.
    await page.evaluate(() => {
      history.pushState({}, '', '/alpha/accounts');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await main.getByText('US · Sweepstakes').first().waitFor();
    const accounts = await rendersOf(
      { model: 'Account', model_id: '102', action: 'update', data: { name: 'DE · Shop' } },
      () => main.getByText('DE · Shop').first().waitFor(),
    );
    assert.deepEqual(rows(accounts), ['DE · ShopActiveOl——No rules'], 'only the renamed account\'s row draws again');
    await page.screenshot({ path: `${output}/accounts.png` });

    assert.deepEqual(errors, []);
    console.log('Re-renders: a renamed member or ad account draws its own row alone, a renamed label only the row carrying it');
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
