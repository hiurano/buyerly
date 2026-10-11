// Exercise the real App with a synthetic API: Display options and filters
// work the same on every list and survive a reload, as in Linear (#385).
// - Rules: Ordering with Direction, which a column header click also turns;
//   Group ordering hides a group; Show empty groups; the dot on the button
//   and the footer's Reset while the view differs from its default.
// - The view is saved per member on the server (here a stand-in), so it
//   survives a reload; Reset brings the default back and keeps the filters.
// - Filters ride in the address: an address without `?filter=` gets the
//   saved filter back, a link with one wins and becomes the saved filter.
// - The filter menu: sections under lines, one "Dates" row with each date's
//   ready-made values and a custom date, number filters (> ≥ < ≤).
// - Ads Manager keeps a view for each level.
// - At 390px Display options and the filter menus stay on screen.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-view-options';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  username: 'buyer', full_name: 'Bo Buyer', first_name: 'Bo', last_name: 'Buyer',
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = {
  id: 100, account_id: 'act_100', name: 'Main account', custom_name: '', note: '',
  connection_type: 'system_user', timezone_name: 'UTC', currency: 'USD', account_status: 1,
  status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, primary_result: '',
  target_cost_per_result: null, active_rules: [],
};
const metrics = (spend) => ({
  spend, impressions: 12000, reach: 0, cpm: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0,
  landing_page_views: 0, leads: 3, registrations: 0, purchases: 0, cost_per_lead: spend / 3, cost_per_registration: null,
  cost_per_purchase: null, cost_per_landing_page_view: null, cpc: 0, ctr: 1.23, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
});
const entity = (level, id, name, parent, status, spend) => ({
  ...metrics(spend), entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status, effective_status: status, daily_budget: 2500, data_as_of: '2026-10-09T08:00:00Z',
});
const inventory = {
  campaign: [
    entity('campaign', '801', 'Alpha campaign', 'act_100', 'ACTIVE', 50),
    entity('campaign', '802', 'Bravo campaign', 'act_100', 'ACTIVE', 300),
    entity('campaign', '803', 'Charlie campaign', 'act_100', 'PAUSED', 120),
  ],
  adset: [entity('adset', '901', 'Broad', '801', 'ACTIVE', 50)],
  ad: [],
};
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const preset = (id, name, fields) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false, created_at: daysAgo(40),
  review_reason: '', last_run_at: '', last_checked_at: '', attached_account_ids: ['act_100'], attached_scopes: {}, ...fields,
});
const presets = [
  preset(7, 'Stop ad sets without leads', { last_run_at: daysAgo(2) }),
  preset(8, 'Budget up on cheap leads', { action: 'increase_budget', budget_change_percent: 20, budget_max_daily: 100 }),
  preset(9, 'Tell me about expensive leads', { action: 'notify_only', enabled: false, last_run_at: daysAgo(20) }),
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  const openPage = async (width, touch = false) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    // The member's saved views, as /api/view-settings keeps them.
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
      if (verb !== 'GET') {
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: [account] });
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
        const items = parent === 'act_100' ? inventory[level] ?? [] : [];
        return route.fulfill({ json: { parent_id: parent, level, period: 'today', source: 'analytics_fact_store', data_as_of: null, total: items.length, items } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      return route.fulfill({ json: [] });
    });
    return { context, page, errors, views };
  };

  const rowIds = (page) => page.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.dataset.rowId));
  const settle = (page) => page.waitForTimeout(400);
  const popover = (page) => page.locator('.linear-display-options-popover');
  const displayButton = (page) => page.locator('main header').getByRole('button', { name: 'Display options' });
  const select = async (page, row, option) => {
    await popover(page).locator('.linear-display-row', { hasText: row }).getByRole('combobox').click();
    await page.locator('.linear-display-select-menu').getByRole('option', { name: option, exact: true }).click();
  };
  const assertInside = async (locator, where) => {
    const box = await locator.boundingBox();
    const width = await locator.page().evaluate(() => window.innerWidth);
    assert.ok(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${where}: ${JSON.stringify(box)} leaves the ${width}px screen`);
  };

  // 1440px: Rules, then Ads Manager.
  {
    const { context, page, errors, views } = await openPage(1440);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      assert.deepEqual(await rowIds(page), ['7', '8', '9'], 'Manual keeps the stored order');
      assert.equal(await displayButton(page).locator('[data-display-changed]').count(), 0, 'no dot on a default view');

      // V opens Display options; Manual has no direction.
      await page.keyboard.press('v');
      await popover(page).waitFor();
      assert.equal(await popover(page).getByRole('button', { name: 'Direction' }).count(), 0);
      assert.equal(await popover(page).getByRole('button', { name: 'Reset to default' }).count(), 0);
      await select(page, 'Ordering', 'Name');
      assert.deepEqual(await rowIds(page), ['8', '7', '9'], 'Name sorts A→Z');
      const direction = popover(page).getByRole('button', { name: 'Direction' });
      assert.equal(await direction.getAttribute('data-direction'), 'asc');
      await direction.click();
      assert.deepEqual(await rowIds(page), ['9', '7', '8'], 'Direction turns the order round');
      assert.equal(await direction.getAttribute('data-direction'), 'desc');
      await displayButton(page).locator('[data-display-changed]').waitFor();
      await popover(page).getByRole('button', { name: 'Reset to default' }).waitFor();
      await page.screenshot({ path: `${output}/rules-display-1440.png` });
      await page.keyboard.press('Escape');

      // A header click on the sorted column turns it round too, and the Direction button follows.
      await page.getByRole('button', { name: 'Order by Name', exact: true }).click();
      assert.deepEqual(await rowIds(page), ['8', '7', '9'], 'the header click sorts A→Z again');
      await settle(page);
      assert.deepEqual(views.rules, { ordering: 'name' }, 'only what differs from the defaults is saved');

      // The view survives a reload.
      await page.reload();
      await page.locator('[data-row-id="7"]').waitFor();
      assert.deepEqual(await rowIds(page), ['8', '7', '9'], 'the ordering survives a reload');
      await displayButton(page).locator('[data-display-changed]').waitFor();

      // Group ordering: hide a status group with its eye; Show empty groups for the fixed set.
      await displayButton(page).click();
      await select(page, 'Grouping', 'Status');
      await popover(page).getByRole('button', { name: 'Group ordering' }).click();
      const groupList = popover(page).getByRole('region', { name: 'Group ordering' }).or(popover(page).locator('.linear-display-group-list'));
      assert.deepEqual(
        await popover(page).locator('.linear-display-group-label').allTextContents(),
        ['Active rules', 'Paused rules'],
      );
      await groupList.locator('.linear-display-group-row', { hasText: 'Paused rules' }).getByRole('button', { name: 'Hide group' }).click();
      await page.locator('[data-row-id="9"]').waitFor({ state: 'detached' });
      assert.equal(await groupList.locator('.linear-display-group-row', { hasText: 'Paused rules' }).getByRole('button', { name: 'Show group' }).count(), 1);
      await page.screenshot({ path: `${output}/rules-group-ordering-1440.png` });
      await popover(page).getByRole('button', { name: 'Back' }).click();
      await popover(page).getByRole('switch', { name: 'Show empty groups' }).waitFor();

      // Reset brings the default view back and drops the dot.
      await popover(page).getByRole('button', { name: 'Reset to default' }).click();
      await page.locator('[data-row-id="9"]').waitFor();
      assert.deepEqual(await rowIds(page), ['7', '8', '9'], 'Reset brings Manual back');
      assert.equal(await displayButton(page).locator('[data-display-changed]').count(), 0, 'Reset drops the dot');
      assert.equal(await popover(page).getByRole('button', { name: 'Reset to default' }).count(), 0, 'and the footer');
      await settle(page);
      assert.equal(views.rules, undefined, 'a default view keeps nothing on the server');
      await page.keyboard.press('Escape');

      // The filter menu: Status, then Groups, a line, one Dates row.
      await page.keyboard.press('f');
      const menu = page.getByRole('dialog', { name: 'Add filter' });
      await menu.waitFor();
      const labels = await menu.getByRole('listbox', { name: 'Filter properties' }).getByRole('option').allTextContents();
      assert.deepEqual(labels.map((label) => label.replace('▶', '').trim()), ['Status', 'Groups', 'Dates']);
      await menu.getByRole('option', { name: 'Dates' }).hover();
      const dateList = page.getByRole('listbox', { name: 'Date properties' });
      await dateList.waitFor();
      assert.deepEqual((await dateList.getByRole('option').allTextContents()).map((label) => label.replace('▶', '').trim()), ['Last action', 'Created date']);
      await dateList.getByRole('option', { name: 'Last action' }).hover();
      const lastAction = page.getByRole('dialog', { name: 'Last action values' });
      await lastAction.waitFor();
      const presetsShown = (await lastAction.getByRole('option').allTextContents()).map((label) => label.trim());
      assert.equal(presetsShown[0], '1 day ago');
      assert.match(presetsShown.find((label) => label.startsWith('1 week ago')), /1 rule$/, 'one rule acted in the last week');
      assert.equal(presetsShown.at(-1), 'Custom date or timeframe…');
      await page.screenshot({ path: `${output}/filter-dates-1440.png` });
      await lastAction.getByRole('option', { name: /^1 week ago/ }).click();
      await page.locator('[data-row-id="8"]').waitFor({ state: 'detached' });
      assert.deepEqual(await rowIds(page), ['7'], 'Last action after 1 week ago');
      const bar = page.locator('[aria-label="Active filters"]');
      assert.match(await bar.innerText(), /Last action\s*after\s*1 week ago/);
      assert.match(page.url(), /filter=/);
      await settle(page);
      assert.deepEqual(views.rules?.filters, [{ fieldId: 'lastRun', operator: 'after', values: ['-P1W'] }]);

      // An address without ?filter= gets the saved filter back.
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      assert.deepEqual(await rowIds(page), ['7'], 'the saved filter comes back');
      assert.match(page.url(), /filter=/, 'and goes back into the address');
      // A link with ?filter= wins and becomes the saved filter.
      const link = encodeURIComponent(JSON.stringify([{ fieldId: 'status', operator: 'is', values: ['paused'] }]));
      await page.goto(`${origin}/alpha/rules?filter=${link}`);
      await page.locator('[data-row-id="9"]').waitFor();
      assert.deepEqual(await rowIds(page), ['9'], 'the link’s filter applies');
      await settle(page);
      assert.deepEqual(views.rules?.filters, [{ fieldId: 'status', operator: 'is', values: ['paused'] }]);
      await bar.getByRole('button', { name: 'Clear all filters' }).click();
      await page.locator('[data-row-id="7"]').waitFor();
      assert.doesNotMatch(page.url(), /filter=/);

      // Ads Manager: a number filter on Spend, and a view for each level.
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      await page.locator('[data-row-id="801"]').waitFor();
      await page.keyboard.press('f');
      await menu.waitFor();
      await menu.getByRole('option', { name: 'Spend' }).click();
      const spend = page.getByRole('dialog', { name: 'Spend values' });
      await spend.getByRole('radio', { name: 'greater than or equal to' }).click();
      await spend.getByRole('textbox', { name: 'Spend' }).fill('120');
      await page.screenshot({ path: `${output}/filter-number-1440.png` });
      await page.keyboard.press('Enter');
      await page.locator('[data-row-id="801"]').waitFor({ state: 'detached' });
      assert.deepEqual((await rowIds(page)).sort(), ['802', '803'], 'Spend ≥ 120');
      assert.match(await bar.innerText(), /Spend\s*≥\s*120/);
      await bar.getByRole('button', { name: 'Clear all filters' }).click();
      await page.locator('[data-row-id="801"]').waitFor();

      await displayButton(page).click();
      await select(page, 'Ordering', 'Spend');
      assert.deepEqual(await rowIds(page), ['802', '803', '801'], 'Spend sorts largest first');
      await popover(page).getByRole('button', { name: 'Direction' }).click();
      assert.deepEqual(await rowIds(page), ['801', '803', '802'], 'and turns round');
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: /Ad sets/ }).click();
      await page.locator('[data-row-id="901"]').waitFor();
      assert.equal(await displayButton(page).locator('[data-display-changed]').count(), 0, 'Ad sets keeps its own default view');
      await settle(page);
      assert.deepEqual(Object.keys(views).sort(), ['ads-manager.campaigns']);
      assert.deepEqual(views['ads-manager.campaigns'], { ordering: 'spend', direction: 'asc' });
      assert.deepEqual(errors, []);
      console.log('View options at 1440px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // 390px phone: Display options and the filter menus stay on screen.
  {
    const { context, page, errors } = await openPage(390, true);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await displayButton(page).tap();
      await popover(page).waitFor();
      await assertInside(popover(page), 'Rules Display options');
      await page.screenshot({ path: `${output}/rules-display-390.png` });
      await page.keyboard.press('Escape');
      await page.locator('main header').getByRole('button', { name: 'Add filter' }).tap();
      const menu = page.getByRole('dialog', { name: 'Add filter' });
      await menu.waitFor();
      await assertInside(menu, 'Add filter');
      await menu.getByRole('option', { name: 'Dates' }).tap();
      const dates = page.getByRole('dialog', { name: 'Dates values' });
      await dates.waitFor();
      await assertInside(dates, 'Dates');
      await page.getByRole('listbox', { name: 'Date properties' }).getByRole('option', { name: 'Created date' }).tap();
      const created = page.getByRole('dialog', { name: 'Created date values' });
      await created.waitFor();
      await assertInside(created, 'Created date values');
      await page.screenshot({ path: `${output}/filter-dates-390.png` });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `the page scrolls sideways: ${scrollWidth}`);
      assert.deepEqual(errors, []);
      console.log('View options at 390px passed');
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
