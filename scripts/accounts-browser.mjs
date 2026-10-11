// Exercise the real App with a synthetic API: the Ad accounts page (#388),
// Linear's Projects for ad accounts.
// - The sidebar has Ad accounts between Inbox and Ads Manager; G K and
//   Ctrl/Cmd+K "Go to ad accounts" open it at /{workspace}/accounts.
// - The list: Name · Status · Spend today · Leads/CPL today · Rules, the
//   connection-problem mark only on an account whose sync fails, grouping by
//   Team, ordering by Spend today, a filter from the address, the row menu.
// - The account's page at /accounts/{act_id}: the name is edited in place,
//   automation is switched, properties sit in a panel on the right, and
//   "Open in Ads Manager" opens the account there.
// - A viewer sees no Add account, Rename or Remove.
// - 390px: Name, Status and Spend today only; the page is one column.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-accounts';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspaceFor = (role) => ({
  id: 1, slug: 'alpha', name: 'Alpha', role, badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
});
const meFor = (role) => ({
  id: 5, username: 'bo', full_name: 'Bo Buyer', first_name: 'Bo', last_name: 'Buyer',
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspaceFor(role), workspaces: [workspaceFor(role)],
});
const healthy = {
  status: 'healthy', cause: 'none', signals: {}, consecutive_failures: 0, last_success_at: new Date(Date.now() - 120000).toISOString(),
  last_error_at: null, last_error_code: '', last_error_message: '', last_checked_at: null,
};
const today = (spend, leads, cpl) => ({
  period: 'today', generated_at: new Date().toISOString(), saved_at: '', data_status: 'synced', data_status_label: '',
  spend, leads, registrations: 0, cpl, cpreg: null, impressions: 0, reach: 0, clicks: 0, unique_clicks: 0, link_clicks: 0,
  outbound_clicks: 0, landing_page_views: 0, purchases: 0,
});
const account = (id, fields) => ({
  id, account_id: `act_${id}`, name: `Meta ${id}`, custom_name: '', note: '', connection_type: 'facebook_login',
  owner_user_id: 5, workspace_id: 1, owner_id: '', batch_name: '', timezone_name: 'Europe/Amsterdam', currency: 'USD',
  account_status: 1, status_label: 'Active (ACTIVE)', rules_enabled: false, is_active: true, active_rules: [], group_ids: [],
  latest_metrics: null, today_metrics: null, health: healthy, created_at: '2026-10-01 09:00', ...fields,
});
const freshAccounts = () => [
  account(101, { name: 'NL · Lead gen', today_metrics: today(120.5, 4, 30.13), rules_enabled: true, active_rules: [{ preset_id: 7, name: 'Stop ad sets without leads', scope: { level: 'account', ids: [] } }] }),
  account(102, { name: 'DE · E-commerce', today_metrics: today(300, 0, null) }),
  account(103, {
    name: 'US · Sweepstakes', account_status: 3, status_label: 'Payment problem (UNSETTLED / card hold)',
    health: { ...healthy, status: 'critical', cause: 'user', last_error_message: 'The access token has expired.' },
  }),
];
const teams = [{ id: 10, name: 'Media', key: 'MED', description: '', created_at: '', retired_at: null, deleted_at: null, restorable_until: null, member_user_ids: [5], account_ids: [101, 103], is_member: true }];
const members = [{ id: 1, user_id: 5, username: 'bo', full_name: 'Bo Buyer', email: null, avatar_url: '', role: 'owner', joined_at: '', is_current_user: true }];
const preset = (id, name) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5, budget_change_percent: 0, budget_max_daily: 0,
  needs_review: false, created_at: '2026-09-01T00:00:00Z', review_reason: '', last_run_at: '', last_checked_at: '',
  attached_account_ids: id === 7 ? ['act_101'] : [], attached_scopes: {},
});
const events = [{
  id: 1, workspace_id: 1, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'RULE_EXECUTED', status: 'SUCCESS',
  account_id: 'act_101', account_name: 'NL · Lead gen', adset_id: '901', adset_name: 'Broad', entity_level: 'adset', entity_id: '901',
  entity_name: 'Broad', rule_id: 7, rule_name: 'Stop ad sets without leads', action: 'PAUSE', message: 'Paused: no leads after 20',
  correlation_id: null, reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
  can_undo: false, undo_reason: '', duration_ms: null, created_at: new Date(Date.now() - 3600000).toISOString(),
}];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  const openPage = async (width, { role = 'owner', touch = false, list = freshAccounts() } = {}) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    const views = {};
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      if (path === '/api/view-settings') return route.fulfill({ json: { views } });
      const key = path.match(/^\/api\/view-settings\/([\w.-]+)$/)?.[1];
      if (key && verb === 'PUT') {
        views[key] = request.postDataJSON().settings;
        return route.fulfill({ json: { view_key: key, settings: views[key] } });
      }
      if (key && verb === 'DELETE') {
        delete views[key];
        return route.fulfill({ status: 204, body: '' });
      }
      const toggle = path.match(/^\/api\/accounts\/(act_\d+)\/toggle-rules$/)?.[1];
      if (toggle && verb === 'POST') {
        const item = list.find((candidate) => candidate.account_id === toggle);
        item.rules_enabled = !item.rules_enabled;
        writes.push(`toggle ${toggle} ${item.rules_enabled}`);
        return route.fulfill({ json: { account_id: toggle, rules_enabled: item.rules_enabled, message: '' } });
      }
      const profile = path.match(/^\/api\/accounts\/(act_\d+)\/profile$/)?.[1];
      if (profile && verb === 'PATCH') {
        const body = request.postDataJSON();
        Object.assign(list.find((candidate) => candidate.account_id === profile), body);
        writes.push(`profile ${profile} ${body.custom_name}|${body.note}`);
        return route.fulfill({ json: { account_id: profile, ...body, message: 'Name and note saved' } });
      }
      if (verb !== 'GET') {
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: meFor(role) });
      if (path === '/api/accounts') return route.fulfill({ json: list });
      if (path === '/api/workspaces/1/teams') return route.fulfill({ json: teams });
      if (path === '/api/workspaces/1/members') return route.fulfill({ json: members });
      if (path === '/api/presets') return route.fulfill({ json: [preset(7, 'Stop ad sets without leads'), preset(8, 'Budget up on cheap leads')] });
      if (path === '/api/audit-events') {
        const items = url.searchParams.get('account_id') === 'act_101' ? events : [];
        return route.fulfill({ json: { items, page: 1, page_size: 5, total: items.length, total_pages: 1, status_counts: {} } });
      }
      if (path === '/api/analytics/hierarchy') {
        return route.fulfill({ json: { parent_id: url.searchParams.get('parent_id'), level: 'campaign', period: 'today', source: 'analytics_fact_store', data_as_of: null, total: 0, items: [] } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      return route.fulfill({ json: [] });
    });
    return { context, page, errors, writes, views, list };
  };

  const rowIds = (page) => page.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.dataset.rowId));
  const headers = (page) => page.getByRole('columnheader').allInnerTexts();
  const popover = (page) => page.locator('.linear-display-options-popover');
  const select = async (page, row, option) => {
    await popover(page).locator('.linear-display-row', { hasText: row }).getByRole('combobox').click();
    await page.locator('.linear-display-select-menu').getByRole('option', { name: option, exact: true }).click();
  };
  const settle = (page) => page.waitForTimeout(400);

  // 1440px: the sidebar, the list, the page.
  {
    const { context, page, errors, writes, views } = await openPage(1440);
    try {
      // The first page waits for Vite to prepare the app.
      await page.goto(`${origin}/alpha/rules`, { timeout: 120_000 });
      const nav = page.locator('.linear-sidebar-nav-item');
      await nav.first().waitFor();
      assert.deepEqual((await nav.allInnerTexts()).map((text) => text.trim()), ['Inbox', 'Ad accounts', 'Ads Manager', 'Rules']);

      // G K opens the list.
      await page.locator('[data-row-id="7"]').waitFor();
      await page.keyboard.press('g');
      await page.keyboard.press('k');
      await page.waitForURL(`${origin}/alpha/accounts`);
      await page.locator('[data-row-id="act_101"]').waitFor();
      assert.equal(await page.title(), 'Ad accounts');
      assert.equal(await nav.nth(1).getAttribute('data-active'), 'true');
      assert.deepEqual((await headers(page)).map((text) => text.trim()).filter(Boolean), ['Name', 'Status', 'Spend today', 'Leads/CPL today', 'Rules']);
      assert.deepEqual(await rowIds(page), ['act_102', 'act_101', 'act_103'], 'Name A→Z by default');
      await page.locator('main header').getByRole('button', { name: 'Add account' }).waitFor();

      const nl = page.locator('[data-row-id="act_101"]');
      assert.match(await nl.innerText(), /NL · Lead gen[\s\S]*Active[\s\S]*USD\s?120\.50[\s\S]*4 · USD\s?30\.13[\s\S]*1 rule[\s\S]*On/);
      assert.match(await page.locator('[data-row-id="act_103"]').innerText(), /Unsettled[\s\S]*No rules/);
      // The connection mark only where the sync fails, with the reason.
      assert.equal(await page.locator('[data-connection-problem]').count(), 1);
      const problem = page.locator('[data-row-id="act_103"] [data-connection-problem="critical"]');
      assert.match(await problem.getAttribute('aria-label'), /access token has expired/);
      await problem.click();
      await page.getByRole('menuitem', { name: 'Reconnect…' }).waitFor();
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `${output}/list-1440.png` });

      // Display options: ordering by Spend today, grouping by Team, saved per member.
      await page.keyboard.press('v');
      await popover(page).waitFor();
      await select(page, 'Ordering', 'Spend today');
      assert.deepEqual(await rowIds(page), ['act_101', 'act_102', 'act_103'], 'smallest spend first, none last');
      await popover(page).getByRole('button', { name: 'Direction' }).click();
      assert.deepEqual(await rowIds(page), ['act_102', 'act_101', 'act_103'], 'largest spend first, none still last');
      await select(page, 'Grouping', 'Team');
      await page.getByText('No team', { exact: true }).waitFor();
      assert.deepEqual(await rowIds(page), ['act_101', 'act_103', 'act_102'], 'Media, then No team');
      await page.screenshot({ path: `${output}/grouped-1440.png` });
      await page.keyboard.press('Escape');
      await settle(page);
      assert.deepEqual(views.accounts, { grouping: 'team', ordering: 'spend', direction: 'desc' });
      await popover(page).waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Display options' }).click();
      await popover(page).getByRole('button', { name: 'Reset to default' }).click();
      await page.keyboard.press('Escape');

      // A filter from the address: automation on.
      const link = encodeURIComponent(JSON.stringify([{ fieldId: 'automation', operator: 'is', values: ['on'] }]));
      await page.goto(`${origin}/alpha/accounts?filter=${link}`);
      await page.locator('[data-row-id="act_101"]').waitFor();
      assert.deepEqual(await rowIds(page), ['act_101']);
      await page.locator('[aria-label="Active filters"]').getByRole('button', { name: 'Clear all filters' }).click();
      await page.locator('[data-row-id="act_103"]').waitFor();

      // The row menu.
      await page.locator('[data-row-id="act_102"]').hover();
      await page.getByRole('button', { name: 'Actions for DE · E-commerce' }).click();
      const items = (await page.getByRole('menuitem').allInnerTexts()).map((text) => text.trim());
      assert.deepEqual(items, ['Open', 'Open in Ads Manager', 'Rename…', 'Turn automation on', 'Copy account ID', 'Remove from workspace…']);
      await page.getByRole('menuitem', { name: 'Rename…' }).click();
      const renameField = page.getByRole('textbox', { name: 'Ad account name' });
      await renameField.fill('DE · Shop');
      await page.keyboard.press('Enter');
      await page.locator('[data-row-id="act_102"]', { hasText: 'DE · Shop' }).waitFor();
      assert.ok(writes.includes('profile act_102 DE · Shop|'), writes.join('\n'));

      // The account's page.
      await page.locator('[data-row-id="act_101"]').click();
      await page.waitForURL(`${origin}/alpha/accounts/act_101`);
      const properties = page.getByRole('region', { name: 'Properties' }).or(page.locator('section[aria-label="Properties"]'));
      await properties.waitFor();
      assert.equal(await page.title(), 'NL · Lead gen — Buyerly');
      const panel = await properties.boundingBox();
      const title = await page.getByRole('textbox', { name: 'Ad account name' }).boundingBox();
      assert.ok(panel.x > title.x + title.width, 'properties sit in a panel to the right');
      for (const label of ['Status', 'Health', 'Automation', 'Team', 'Connected by', 'Time zone', 'Added', 'Last sync']) {
        await properties.getByRole('group', { name: label }).waitFor();
      }
      assert.match(await properties.getByRole('group', { name: 'Team' }).innerText(), /Media/);
      assert.match(await properties.getByRole('group', { name: 'Connected by' }).innerText(), /Bo Buyer/);
      assert.match(await page.locator('section[aria-label="Today"]').innerText(), /USD\s?120\.50[\s\S]*CPL USD\s?30\.13/);
      assert.match(await page.locator('section[aria-label="Rules"]').innerText(), /Stop ad sets without leads[\s\S]*Whole account/);
      assert.match(await page.locator('section[aria-label="Recent events"]').innerText(), /Paused: no leads after 20/);
      await page.screenshot({ path: `${output}/page-1440.png` });

      // Name edited in place; automation switched off.
      const name = page.getByRole('textbox', { name: 'Ad account name' });
      await name.fill('NL · Leads');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'NL · Leads' }).waitFor();
      assert.ok(writes.includes('profile act_101 NL · Leads|'), writes.join('\n'));
      await properties.getByRole('switch', { name: 'Automation' }).click();
      await properties.getByRole('group', { name: 'Automation' }).getByText('Off', { exact: true }).waitFor();
      assert.ok(writes.includes('toggle act_101 false'), writes.join('\n'));

      // Open in Ads Manager, then G K back to the list.
      await page.getByRole('button', { name: 'Open in Ads Manager' }).click();
      await page.waitForURL(`${origin}/alpha/ads-manager/campaigns?account=act_101`);
      await page.getByRole('button', { name: 'Select ad account' }).click();
      await page.getByRole('menuitem', { name: 'All ad accounts…' }).click();
      await page.waitForURL(`${origin}/alpha/accounts`);

      // Ctrl/Cmd+K → Go to ad accounts from elsewhere.
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await page.keyboard.press('Control+K');
      const commands = page.getByRole('dialog', { name: 'Command menu' });
      await commands.getByRole('combobox').fill('ad accounts');
      await commands.getByRole('option', { name: /Go to ad accounts/ }).click();
      await page.waitForURL(`${origin}/alpha/accounts`);
      assert.deepEqual(errors, []);
      console.log('Ad accounts at 1440px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // A viewer only looks.
  {
    const { context, page, errors } = await openPage(1440, { role: 'viewer' });
    try {
      await page.goto(`${origin}/alpha/accounts`);
      await page.locator('[data-row-id="act_101"]').waitFor();
      assert.equal(await page.locator('main header').getByRole('button', { name: 'Add account' }).count(), 0);
      await page.locator('[data-row-id="act_101"]').hover();
      await page.getByRole('button', { name: 'Actions for NL · Lead gen' }).click();
      assert.deepEqual((await page.getByRole('menuitem').allInnerTexts()).map((text) => text.trim()), ['Open', 'Open in Ads Manager', 'Copy account ID']);
      await page.keyboard.press('Escape');
      await page.goto(`${origin}/alpha/accounts/act_101`);
      await page.getByRole('heading', { name: 'NL · Lead gen', level: 1 }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'Ad account name' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Attach rule' }).count(), 0);
      assert.deepEqual(errors, []);
      console.log('Ad accounts for a viewer passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-viewer.png`, fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }

  // An empty workspace.
  {
    const { context, page, errors } = await openPage(1440, { list: [] });
    try {
      await page.goto(`${origin}/alpha/accounts`);
      await page.getByText('No ad accounts yet', { exact: true }).waitFor();
      await page.locator('main').getByRole('button', { name: 'Add account' }).last().waitFor();
      assert.deepEqual(errors, []);
      console.log('Ad accounts empty state passed');
    } finally {
      await context.close();
    }
  }

  // 390px phone: three columns, nothing sideways, the page in one column.
  {
    const { context, page, errors } = await openPage(390, { touch: true });
    try {
      await page.goto(`${origin}/alpha/accounts`);
      await page.locator('[data-row-id="act_101"]').waitFor();
      assert.deepEqual((await headers(page)).map((text) => text.trim()).filter(Boolean), ['Name', 'Status', 'Spend today']);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `the page scrolls sideways: ${scrollWidth}`);
      const row = await page.locator('[data-row-id="act_101"]').boundingBox();
      assert.ok(row.x >= 0 && row.x + row.width <= 390, `the row leaves the screen: ${JSON.stringify(row)}`);
      await page.screenshot({ path: `${output}/list-390.png` });
      await page.locator('[data-row-id="act_101"]').tap();
      await page.waitForURL(`${origin}/alpha/accounts/act_101`);
      const properties = page.locator('section[aria-label="Properties"]');
      await properties.waitFor();
      const today = await page.locator('section[aria-label="Today"]').boundingBox();
      const panel = await properties.boundingBox();
      assert.ok(panel.y < today.y, 'one column: properties above Today');
      assert.ok(panel.x + panel.width <= 390);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
      await page.screenshot({ path: `${output}/page-390.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log('Ad accounts at 390px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-390.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
