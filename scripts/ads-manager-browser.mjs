// Exercise the real App with a synthetic API: Ads Manager's columns, filters,
// grouping and period (#389).
// - The default columns are the short daily set (Budget, Spend, Leads, CPL,
//   Rules); any other figure of the API is one switch away in Display
//   properties, and a column header orders by it, rows without the figure last.
// - Leads/CPL replace "Results / CPA"; an old link's Results and CPA filters
//   still mean leads and CPL.
// - Metrics filter as numbers under Metrics; ad sets filter and group by their
//   campaign, ads also by ad set, and show their parents as columns.
// - The period is a row of Display options, as Linear's "Completed issues"
//   (#554): kept in each level's view, it reloads every figure and survives
//   a reload.
// - On a phone Spend follows the name.
// - Every ad account is on screen at once, grouped by account as Linear's
//   team Issues groups by project; with no grouping the account is a column,
//   an old link's `?account=` is a filter, and My campaigns shows only the
//   accounts you lead.
// - A row's delivery is Linear's status icon; a click or S opens Change status…;
//   P, R and A act on the row under the pointer when nothing is selected.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-ads-manager';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  id: 1, username: 'buyer', full_name: 'Bo Buyer', first_name: 'Bo', last_name: 'Buyer',
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = {
  id: 100, account_id: 'act_100', name: 'Main account', custom_name: '', note: '',
  connection_type: 'system_user', timezone_name: 'UTC', currency: 'USD', account_status: 1,
  status_label: 'Active (ACTIVE)', rules_enabled: true, is_active: true, primary_result: '',
  target_cost_per_result: null, active_rules: [],
};
// A longer period multiplies every figure, so the screen shows which one it read.
const PERIOD_FACTOR = { today: 1, yesterday: 2, last_3d: 3, last_7d: 7 };
const entity = (level, id, name, parent, spend, leads, extra = {}) => ({
  entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: level === 'ad' ? 0 : 25,
  data_as_of: '2026-10-13T08:00:00Z', spend, impressions: spend * 100, reach: spend * 80, cpm: 10, clicks: spend,
  link_clicks: Math.round(spend / 2), outbound_clicks: 0, landing_page_views: 0, leads, registrations: 0, purchases: 0,
  cost_per_lead: leads ? spend / leads : null, cost_per_registration: null, cost_per_purchase: null,
  cost_per_landing_page_view: null, cpc: 1, ctr: 1, cpc_link: 2, ctr_link: 0.5, ctr_outbound: 0, ...extra,
});
const euro = {
  ...account, id: 200, account_id: 'act_200', name: 'Euro account', currency: 'EUR', lead_user_id: null,
};
const euroInventory = {
  campaign: [entity('campaign', '701', 'Euro campaign', 'act_200', 40, 2, { account_id: 'act_200', currency: 'EUR' })],
  adset: [],
  ad: [],
};
const inventory = {
  campaign: [
    entity('campaign', '801', 'Alpha campaign', 'act_100', 50, 5),
    entity('campaign', '802', 'Bravo campaign', 'act_100', 300, 3),
    entity('campaign', '803', 'Charlie campaign', 'act_100', 120, 0),
  ],
  adset: [
    entity('adset', '901', 'Broad', '801', 30, 3),
    entity('adset', '902', 'Lookalike', '801', 20, 2),
    entity('adset', '903', 'Interests', '802', 300, 3),
  ],
  ad: [
    entity('ad', '951', 'Video', '901', 30, 3),
    entity('ad', '952', 'Static', '903', 300, 3),
  ],
};
const scaled = (item, factor) => ({
  ...item, spend: item.spend * factor, leads: item.leads * factor,
  impressions: item.impressions * factor, cost_per_lead: item.cost_per_lead,
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  const openPage = async (width, touch = false, accounts = [account]) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    await mockSync(page);
    page.setDefaultTimeout(10_000);
    const errors = [];
    const views = {};
    const periods = [];
    const writes = [];
    // Every request in the order the page sent it; `answered` marks each `/api/accounts` answer (#489).
    const reads = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) reads.push(pathname);
    });
    page.on('requestfinished', (request) => {
      if (new URL(request.url()).pathname === '/api/accounts') reads.push('answered');
    });
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
      // Delivery from the board, and its undo (Ctrl+Z).
      const delivery = path.match(/^\/api\/entities\/(campaign|adset|ad)\/([\w-]+)\/delivery$/);
      if (delivery && verb === 'POST') {
        const body = request.postDataJSON();
        writes.push({ path, body });
        return route.fulfill({ json: {
          entity_id: delivery[2], level: delivery[1], status: body.status, changed: true, audit_event_id: 90 + writes.length, message: '',
        } });
      }
      if (/^\/api\/audit-events\/\d+\/undo$/.test(path) && verb === 'POST') {
        writes.push({ path });
        return route.fulfill({ json: { ok: true } });
      }
      if (verb !== 'GET') {
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') {
        // Slow enough that a read waiting for it would only start afterwards.
        await new Promise((resolve) => setTimeout(resolve, 300));
        reads.push('answered');
        return route.fulfill({ json: accounts });
      }
      if (path === '/api/analytics/hierarchy/accounts') {
        const period = url.searchParams.get('period');
        periods.push(period);
        const factor = PERIOD_FACTOR[period];
        if (!factor) return route.fulfill({ status: 422, json: { detail: 'Unknown period' } });
        const sources = { act_100: inventory, act_200: euroInventory };
        const ids = url.searchParams.get('account_ids')?.split(',') ?? accounts.map((item) => item.account_id);
        const rows = (source, level) => (source[level] ?? []).map((item) => scaled(item, factor));
        return route.fulfill({ json: {
          period,
          source: 'analytics_fact_store',
          accounts: ids.filter((id) => sources[id]).map((id) => ({
            account_id: id, campaigns: rows(sources[id], 'campaign'), adsets: rows(sources[id], 'adset'), ads: rows(sources[id], 'ad'),
          })),
          missing: ids.filter((id) => !sources[id]),
        } });
      }
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
        const period = url.searchParams.get('period');
        periods.push(period);
        const factor = PERIOD_FACTOR[period];
        if (!factor) return route.fulfill({ status: 422, json: { detail: 'Unknown period' } });
        const source = { act_100: inventory, act_200: euroInventory }[parent] ?? {};
        const items = (source[level] ?? []).map((item) => scaled(item, factor));
        return route.fulfill({ json: { parent_id: parent, level, period, source: 'analytics_fact_store', data_as_of: null, total: items.length, items } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      return route.fulfill({ json: [] });
    });
    return { context, page, errors, views, periods, writes, reads };
  };

  const rowIds = (page) => page.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.dataset.rowId));
  const headers = async (page) => (await page.locator('[role="columnheader"]').allTextContents()).map((text) => text.trim());
  const cell = async (page, rowId, column) => {
    const index = (await headers(page)).indexOf(column);
    assert.ok(index > 0, `no ${column} column`);
    // Intl puts a no-break space between the currency code and the amount.
    return (await page.locator(`[data-row-id="${rowId}"] > *`).nth(index).innerText()).replace(/ /g, ' ').trim();
  };
  const settle = (page) => page.waitForTimeout(400);
  const popover = (page) => page.locator('.buyerly-display-options-popover');
  const displayButton = (page) => page.locator('main header').getByRole('button', { name: 'Display options' });
  const select = async (page, row, option) => {
    // By the exact label: "Grouping" is also part of "Sub-grouping".
    await popover(page).locator('.buyerly-display-row', { has: page.getByText(row, { exact: true }) }).getByRole('combobox').click();
    await page.locator('.buyerly-display-select-menu').getByRole('option', { name: option, exact: true }).click();
  };
  const property = (page, label) => popover(page).locator('.buyerly-display-property', { hasText: new RegExp(`^${label}$`) });
  const bar = (page) => page.locator('.buyerly-filter-formula, [aria-label="Active filters"]').first();

  // 1440px.
  {
    const { context, page, errors, views, periods } = await openPage(1440);
    try {
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="801"]').waitFor();
      assert.deepEqual(await headers(page), ['Name', 'Budget', 'Spend', 'Leads', 'CPL', 'Rules'], 'the short daily set');
      assert.equal(await cell(page, '802', 'Leads'), '3');
      assert.equal(await cell(page, '802', 'CPL'), 'USD 100.00');
      assert.equal(await cell(page, '803', 'CPL'), '—', 'no leads, no CPL');
      assert.equal(await cell(page, '801', 'Budget'), 'USD 25.00/day');
      assert.ok(periods.every((period) => period === 'today'), 'today by default');
      await page.screenshot({ path: `${output}/campaigns-1440.png` });

      // Any figure is one switch away; the new column orders like the rest.
      await displayButton(page).click();
      await popover(page).waitFor();
      for (const label of ['Status', 'Impressions', 'Reach', 'CPM', 'Link clicks', 'Link CTR', 'Link CPC', 'Landing page views', 'Registrations', 'CPReg', 'Purchases', 'CPP', 'ID']) {
        await property(page, label).waitFor();
      }
      assert.equal(await property(page, 'Results').count(), 0, 'no Results any more');
      await property(page, 'Impressions').click();
      await page.getByRole('columnheader', { name: 'Impressions' }).waitFor();
      assert.equal(await cell(page, '802', 'Impressions'), '30,000');
      await select(page, 'Ordering', 'Impressions');
      assert.deepEqual(await rowIds(page), ['802', '803', '801'], 'Impressions sorts largest first');
      await page.keyboard.press('Escape');

      // A header click orders by CPL; a campaign without leads stays last both ways.
      await page.getByRole('button', { name: 'Order by CPL', exact: true }).click();
      assert.deepEqual(await rowIds(page), ['802', '801', '803'], 'CPL largest first, none last');
      await page.getByRole('button', { name: 'Order by CPL', exact: true }).click();
      assert.deepEqual(await rowIds(page), ['801', '802', '803'], 'CPL smallest first, none still last');
      await settle(page);
      assert.equal(views['ads-manager.campaigns'].properties.impressions, true, 'the column is saved with the view');
      assert.deepEqual([views['ads-manager.campaigns'].ordering, views['ads-manager.campaigns'].direction], ['cpl', 'asc']);

      // Metrics filter as numbers.
      await page.keyboard.press('f');
      const menu = page.getByRole('dialog', { name: 'Add filter' });
      await menu.waitFor();
      await menu.getByRole('option', { name: 'CPL', exact: true }).click();
      const cpl = page.getByRole('dialog', { name: 'CPL values' });
      await cpl.getByRole('radio', { name: 'less than', exact: true }).click();
      await cpl.getByRole('textbox', { name: 'CPL' }).fill('50');
      await page.keyboard.press('Enter');
      await page.locator('[data-row-id="802"]').waitFor({ state: 'detached' });
      assert.deepEqual(await rowIds(page), ['801'], 'CPL < 50');
      assert.match(page.url(), /filter=/);
      await page.getByRole('button', { name: 'Clear all filters' }).click();
      await page.locator('[data-row-id="802"]').waitFor();

      // An old link's Results and CPA mean leads and CPL.
      const old = encodeURIComponent(JSON.stringify({ campaigns: [{ fieldId: 'results', operator: 'gt', values: [3] }], adsets: [], ads: [] }));
      await page.goto(`${origin}/alpha/ads-manager/campaigns?filter=${old}`);
      await page.locator('[data-row-id="801"]').waitFor();
      assert.deepEqual(await rowIds(page), ['801'], 'Results > 3 is Leads > 3');
      await page.getByRole('button', { name: 'Clear all filters' }).click();
      await page.locator('[data-row-id="802"]').waitFor();

      // The period: a row of Display options, in the level's view, every figure reloaded, kept on reload.
      assert.equal(await page.locator('main').getByRole('button', { name: /^Period/ }).count(), 0, 'no period button in the toolbar');
      await displayButton(page).click();
      await popover(page).waitFor();
      await select(page, 'Period', 'Last 7 days');
      await page.keyboard.press('Escape');
      await page.locator('[data-row-id="802"]').waitFor();
      await settle(page);
      assert.equal(await cell(page, '802', 'Spend'), 'USD 2,100.00');
      assert.equal(await cell(page, '802', 'Leads'), '21');
      assert.equal(views['ads-manager.campaigns'].period, 'last_7d');
      assert.doesNotMatch(page.url(), /period=/);
      assert.equal(periods.at(-1), 'last_7d');
      await page.screenshot({ path: `${output}/campaigns-last-7-days-1440.png` });
      await page.reload();
      await page.locator('[data-row-id="802"]').waitFor();
      assert.equal(await cell(page, '802', 'Spend'), 'USD 2,100.00', 'the period survives a reload');

      // Ad sets: group by campaign, filter by campaign, the parent as a column; each level keeps its own period.
      await page.getByRole('tab', { name: /Ad sets/ }).click();
      await page.locator('[data-row-id="901"]').waitFor();
      assert.equal(await cell(page, '903', 'Spend'), 'USD 300.00', 'ad sets keep their own period');
      await displayButton(page).click();
      await popover(page).waitFor();
      await select(page, 'Grouping', 'Campaign');
      await property(page, 'Campaign').click();
      await page.keyboard.press('Escape');
      const groups = await page.locator('.buyerly-data-group-header:not(.buyerly-data-subgroup-header) .buyerly-data-group-title').allTextContents();
      assert.deepEqual(groups, ['Alpha campaign', 'Bravo campaign'], 'ad sets under their campaigns');
      assert.deepEqual(await rowIds(page), ['901', '902', '903']);
      assert.equal(await cell(page, '903', 'Campaign'), 'Bravo campaign');
      await page.screenshot({ path: `${output}/adsets-by-campaign-1440.png` });
      const byCampaign = encodeURIComponent(JSON.stringify({ campaigns: [], adsets: [{ fieldId: 'campaign', operator: 'is', values: ['802'] }], ads: [] }));
      await page.goto(`${origin}/alpha/ads-manager/adsets?filter=${byCampaign}`);
      await page.locator('[data-row-id="903"]').waitFor();
      assert.deepEqual(await rowIds(page), ['903'], 'Campaign is Bravo');
      assert.match(await bar(page).innerText(), /Campaign/);
      await page.getByRole('button', { name: 'Clear all filters' }).click();

      // Ads: the ad set and campaign as columns.
      await page.getByRole('tab', { name: /^Ads/ }).click();
      await page.locator('[data-row-id="951"]').waitFor();
      assert.deepEqual(await headers(page), ['Name', 'Spend', 'CTR', 'CPC', 'Leads', 'CPL'], 'ads have no budget or rules');
      await displayButton(page).click();
      await popover(page).waitFor();
      await property(page, 'Campaign').click();
      await property(page, 'Ad set').click();
      await page.keyboard.press('Escape');
      assert.equal(await cell(page, '952', 'Ad set'), 'Interests');
      assert.equal(await cell(page, '952', 'Campaign'), 'Bravo campaign');
      assert.deepEqual(errors, []);
      console.log('Ads Manager at 1440px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // 390px phone: Spend follows the name, the toolbar stays on screen.
  {
    const { context, page, errors } = await openPage(390, true);
    try {
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="801"]').waitFor();
      assert.deepEqual((await headers(page)).slice(0, 2), ['Name', 'Spend'], 'Spend follows the name on a phone');
      assert.equal(await cell(page, '801', 'Spend'), 'USD 50.00');
      // Spend is on screen, left of the Rules cell pinned to the right edge.
      const cells = page.locator('[data-row-id="801"] > *');
      const spendBox = await cells.nth(1).boundingBox();
      const rulesBox = await cells.last().boundingBox();
      assert.ok(spendBox.x >= 0 && spendBox.x + spendBox.width <= rulesBox.x + 0.5,
        `Spend hides under Rules: ${JSON.stringify({ spendBox, rulesBox })}`);
      const box = await displayButton(page).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390.5, `Display options leaves the screen: ${JSON.stringify(box)}`);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `the page scrolls sideways: ${scrollWidth}`);
      await page.screenshot({ path: `${output}/campaigns-390.png` });
      assert.deepEqual(errors, []);
      console.log('Ads Manager at 390px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-390.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // Every ad account at once, grouped by account; My campaigns, only the accounts you lead.
  {
    const { context, page, errors, views, writes, reads } = await openPage(1440, false, [{ ...account, lead_user_id: 1 }, euro]);
    try {
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="701"]').waitFor();
      await page.locator('[data-row-id="801"]').waitFor();
      // The rows are asked for beside the accounts, not after them, and rule
      // attachments come from the accounts already read (#489). Dev's StrictMode
      // sends each page read twice, so the count is against its pair.
      const opening = reads.slice(0, reads.indexOf('answered'));
      assert.ok(opening.includes('/api/analytics/hierarchy/accounts'), `rows read while the accounts load: ${reads.join(', ')}`);
      const count = (path) => reads.filter((item) => item === path).length;
      assert.equal(count('/api/accounts'), count('/api/meta/connections'), `no second /api/accounts for rules: ${reads.join(', ')}`);
      assert.equal(await page.getByRole('button', { name: 'Select ad account' }).count(), 0, 'no account switcher');
      assert.deepEqual(await page.locator('.buyerly-data-group-header:not(.buyerly-data-subgroup-header) .buyerly-data-group-title').allTextContents(), ['Euro account', 'Main account'], 'grouped by ad account, A→Z');
      assert.deepEqual(await rowIds(page), ['701', '801', '802', '803']);
      assert.equal(await cell(page, '701', 'Spend'), 'EUR 40.00', 'each account in its own currency');
      assert.equal((await headers(page)).includes('Ad account'), false, 'the group names the account');
      await page.screenshot({ path: `${output}/all-accounts-1440.png` });

      // No grouping: the account is a column, as Linear shows the project on an issue.
      await displayButton(page).click();
      await popover(page).waitFor();
      await select(page, 'Grouping', 'No grouping');
      await page.keyboard.press('Escape');
      await page.getByRole('columnheader', { name: 'Ad account' }).waitFor();
      assert.equal(await cell(page, '701', 'Ad account'), 'Euro account');
      assert.equal(await cell(page, '801', 'Ad account'), 'Main account');
      await settle(page);
      assert.equal(views['ads-manager.campaigns'].grouping, 'none');

      // An old link to one account opens Campaigns filtered to it.
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_200`);
      await page.locator('[data-row-id="701"]').waitFor();
      await page.locator('[data-row-id="801"]').waitFor({ state: 'detached' });
      assert.doesNotMatch(page.url(), /account=act_200/);
      assert.match(page.url(), /filter=/);
      assert.match(await bar(page).innerText(), /Ad account/);
      await page.getByRole('button', { name: 'Clear all filters' }).click();
      await page.locator('[data-row-id="801"]').waitFor();
      // The view is saved a moment later; leaving at once would lose the cleared filter.
      await settle(page);

      // My campaigns: the same list over the accounts you lead, with a view of its own.
      await page.goto(`${origin}/alpha/my-campaigns/campaigns`);
      await page.locator('[data-row-id="801"]').waitFor();
      assert.equal(await page.locator('[data-row-id="701"]').count(), 0, 'not an account you lead');
      assert.deepEqual(await page.locator('.buyerly-data-group-header:not(.buyerly-data-subgroup-header) .buyerly-data-group-title').allTextContents(), ['Main account']);
      await page.locator('main header').getByText('My campaigns', { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/my-campaigns-1440.png` });

      // Linear's Board: Ctrl/Cmd+B. A view grouped by nothing shows its board by Status,
      // and an empty column waits in Hidden columns.
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="801"]').waitFor();
      await page.keyboard.press('ControlOrMeta+b');
      await page.locator('.buyerly-board').waitFor();
      assert.deepEqual(await page.locator('.buyerly-board-column-header .buyerly-board-column-name').allTextContents(), ['Active']);
      assert.deepEqual(await page.locator('.buyerly-board-hidden-row').allTextContents(), ['Paused']);
      assert.equal(await page.locator('[data-board-column="active"] [data-row-id]').count(), 4);
      // By Status a card dropped on Paused pauses it in Meta once confirmed; Ctrl+Z turns it back on.
      const from = await page.locator('[data-board-column="active"] [data-row-id="801"]').boundingBox();
      const to = await page.locator('[data-board-hidden-column="paused"]').boundingBox();
      await page.mouse.move(from.x + 40, from.y + 20);
      await page.mouse.down();
      await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.mouse.up();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Pause campaign?').waitFor();
      assert.equal(writes.length, 0, 'nothing is written before the member confirms');
      await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.locator('[data-board-column="paused"] [data-row-id="801"]').waitFor();
      assert.deepEqual(writes[0], { path: '/api/entities/campaign/801/delivery', body: { account_id: 'act_100', status: 'PAUSED' } });
      await page.screenshot({ path: `${output}/board-paused-1440.png` });
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('ControlOrMeta+z');
      await page.locator('[data-board-column="active"] [data-row-id="801"]').waitFor();
      assert.equal(writes[1].path, '/api/audit-events/91/undo');
      assert.deepEqual(await page.locator('.buyerly-board-hidden-row').allTextContents(), ['Paused'], 'empty again, back in the lane');
      // Cancel writes nothing and the card stays.
      const again = await page.locator('[data-row-id="802"]').boundingBox();
      await page.mouse.move(again.x + 40, again.y + 20);
      await page.mouse.down();
      await page.mouse.move(again.x + 60, again.y + 30, { steps: 4 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.mouse.up();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(writes.length, 2);
      await page.locator('[data-board-column="active"] [data-row-id="802"]').waitFor();
      await displayButton(page).click();
      await popover(page).waitFor();
      await popover(page).getByText('Columns', { exact: true }).waitFor();
      await popover(page).locator('.buyerly-display-row', { hasText: 'Columns' }).getByRole('combobox').click();
      assert.deepEqual(await page.locator('.buyerly-display-select-menu').getByRole('option').allTextContents(), ['Ad account', 'Status', 'Rules'], 'no "No grouping" on a board');
      await page.locator('.buyerly-display-select-menu').getByRole('option', { name: 'Ad account', exact: true }).click();
      assert.equal(await property(page, 'Ad account').isDisabled(), true, 'the columns already show the account');
      // Rows by the columns' own Ad account, as Linear's: the columns move to the first other option.
      const combo = (row) => popover(page).locator('.buyerly-display-row', { has: page.getByText(row, { exact: true }) }).getByRole('combobox');
      await select(page, 'Rows', 'Ad account');
      assert.match(await combo('Columns').innerText(), /Status/, 'never one property in columns and rows');
      // Columns by the rows' Ad account swaps them back.
      await select(page, 'Columns', 'Ad account');
      assert.match(await combo('Rows').innerText(), /Status/, 'the rows take the columns\' Status');
      await select(page, 'Rows', 'Status');
      await popover(page).getByText('Show empty rows', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      assert.deepEqual(await page.locator('.buyerly-board-column-header .buyerly-board-column-name').allTextContents(), ['Euro account', 'Main account']);
      assert.deepEqual(await page.locator('.buyerly-board-lane .buyerly-board-column-name').allTextContents(), ['Active'], 'Rows band the columns; empty bands stay out');
      await page.screenshot({ path: `${output}/board-1440.png` });
      // Hide column puts it in the lane; its row there brings it back.
      await page.getByRole('button', { name: 'Euro account menu' }).click();
      await page.getByRole('menuitem', { name: 'Hide column' }).click();
      await page.locator('button.buyerly-board-hidden-row', { hasText: 'Euro account' }).click();
      await page.locator('.buyerly-board-column-header', { hasText: 'Euro account' }).waitFor();
      await settle(page);
      assert.equal(views['ads-manager.campaigns'].layout, 'board');
      assert.equal(views['ads-manager.campaigns'].subGrouping, 'status');
      await page.keyboard.press('ControlOrMeta+b');
      await page.locator('.buyerly-board').waitFor({ state: 'detached' });
      // Back in the list the board's Rows are its Sub-grouping (#470), as Linear's: each account
      // split by Status, a sub-group folds on its own, empty ones only with Show empty groups.
      const subGroups = page.locator('.buyerly-data-subgroup-header .buyerly-data-group-title');
      await page.locator('[data-row-id="701"]').waitFor();
      assert.deepEqual(await subGroups.allTextContents(), ['Active', 'Active']);
      await page.locator('.buyerly-data-subgroup-header').first().getByRole('button', { name: 'Collapse group' }).click();
      await page.locator('[data-row-id="701"]').waitFor({ state: 'detached' });
      await page.locator('[data-row-id="801"]').waitFor();
      await page.locator('.buyerly-data-subgroup-header').first().getByRole('button', { name: 'Expand group' }).click();
      await page.locator('[data-row-id="701"]').waitFor();
      await displayButton(page).click();
      await popover(page).waitFor();
      assert.match(await popover(page).locator('.buyerly-display-row', { hasText: 'Sub-grouping' }).getByRole('combobox').innerText(), /Status/);
      await popover(page).getByRole('switch', { name: 'Show empty groups' }).click();
      await page.keyboard.press('Escape');
      assert.deepEqual(await subGroups.allTextContents(), ['Active', 'Paused', 'Active', 'Paused']);
      await page.screenshot({ path: `${output}/list-sub-groups-1440.png` });
      await settle(page);
      // Only what differs from the defaults is saved: the list is the default layout.
      assert.equal(views['ads-manager.campaigns'].layout, undefined);
      assert.equal(views['ads-manager.campaigns'].subGrouping, 'status');
      assert.equal(views['ads-manager.campaigns'].showEmptyGroups, true);
      assert.deepEqual(errors, []);
      console.log('Ads Manager over every ad account passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-accounts.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // A row's delivery as Linear's issue status: its icon, or S over the row, opens
  // "Change status…" with Active and Paused; a click, 1 or 2 picks, Escape writes
  // nothing; P and R over a row pause and resume it.
  {
    const { context, page, errors, writes } = await openPage(1440, false, [account]);
    try {
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="801"]').waitFor();
      const status = (id) => page.locator(`[data-row-id="${id}"] [data-delivery-status]`);
      const shows = (id, state) => page.waitForFunction(
        ([rowId, wanted]) => document.querySelector(`[data-row-id="${rowId}"] [data-delivery-status]`)?.getAttribute('data-delivery-status') === wanted,
        [id, state],
      );
      assert.equal(await status('801').getAttribute('data-delivery-status'), 'active');
      assert.equal(await page.locator('[data-row-id="801"] [role="switch"]').count(), 0, 'no switch in the row');
      await status('801').click();
      const menu = page.getByRole('dialog', { name: 'Change status' });
      await menu.waitFor();
      assert.equal(await menu.getByRole('option', { name: /Active/ }).getAttribute('aria-selected'), 'true');
      assert.equal(await menu.getByRole('option').count(), 2, 'only what a buyer can set');
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${output}/status-menu-1440.png` });
      await menu.getByRole('option', { name: /Paused/ }).click();
      await menu.waitFor({ state: 'detached' });
      await shows('801', 'paused');
      assert.deepEqual(writes[0], { path: '/api/entities/campaign/801/delivery', body: { account_id: 'act_100', status: 'PAUSED' } });

      await status('801').click();
      await menu.waitFor();
      assert.equal(await menu.getByRole('option', { name: /Paused/ }).getAttribute('aria-selected'), 'true');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Change status…');
      await page.keyboard.press('1');
      await menu.waitFor({ state: 'detached' });
      await shows('801', 'active');
      assert.deepEqual(writes[1], { path: '/api/entities/campaign/801/delivery', body: { account_id: 'act_100', status: 'ACTIVE' } });

      await status('802').click();
      await menu.waitFor();
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'detached' });
      assert.equal(writes.length, 2, 'Escape writes nothing');

      // Linear's keys on the row under the pointer, with nothing selected:
      // S opens its status, P and R pause and resume it, as its right-click menu prints.
      await page.locator('[data-row-id="802"]').hover();
      await page.keyboard.press('s');
      await menu.waitFor();
      await page.keyboard.press('2');
      await menu.waitFor({ state: 'detached' });
      await shows('802', 'paused');
      assert.deepEqual(writes[2], { path: '/api/entities/campaign/802/delivery', body: { account_id: 'act_100', status: 'PAUSED' } });
      await page.locator('[data-row-id="803"]').hover();
      await page.keyboard.press('p');
      await shows('803', 'paused');
      assert.deepEqual(writes[3], { path: '/api/entities/campaign/803/delivery', body: { account_id: 'act_100', status: 'PAUSED' } });
      await page.keyboard.press('r');
      await shows('803', 'active');
      assert.deepEqual(writes[4], { path: '/api/entities/campaign/803/delivery', body: { account_id: 'act_100', status: 'ACTIVE' } });
      assert.deepEqual(await page.locator('[data-row-id][data-selected="true"]').count(), 0, 'keys on a hovered row select nothing');
      assert.deepEqual(errors, []);
      console.log('Ads Manager status menu passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-status.png`, fullPage: true }).catch(() => {});
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
