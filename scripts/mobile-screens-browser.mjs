// Exercise the real App with a synthetic API: Rules, Ads Manager and Inbox at
// 390, 768, 1024 and 1440px (#286). At every width the document never scrolls
// sideways and every header control is on screen and not covered; view tabs
// that no longer fit fold into one "N more" menu, as in Linear. Touch screens
// get 32px header buttons and tabs (Linear, measured at 375px). A view's details
// pane starts closed; at 1024px and below it lies over the list below the
// header, 350px wide, wider it is a column the list makes room for; on a phone
// its backdrop closes it (#367). The navigation drawer opens over each screen without overflow. Display
// options and the Inbox menus stay on screen.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-mobile-screens';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  username: 'buyer', full_name: 'Bo Buyer', first_name: 'Bo', last_name: 'Buyer',
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = {
  id: 100, account_id: 'act_100', name: 'A deliberately long advertising account name', custom_name: '', note: '',
  connection_type: 'system_user', timezone_name: 'UTC', currency: 'USD', account_status: 1,
  status_label: 'Active (ACTIVE)', rules_enabled: false, is_active: true, primary_result: '',
  target_cost_per_result: null, active_rules: [],
};
const metrics = {
  spend: 12345.67, impressions: 1234567, reach: 0, cpm: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0,
  landing_page_views: 0, leads: 321, registrations: 0, purchases: 0, cost_per_lead: 38.46, cost_per_registration: null,
  cost_per_purchase: null, cost_per_landing_page_view: null, cpc: 0, ctr: 1.23, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
};
const entity = (level, id, name, parent) => ({
  ...metrics, entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: 2500, data_as_of: '2026-10-06T08:00:00Z',
});
const inventory = {
  campaign: [
    entity('campaign', '801', 'Main campaign with a long name for a phone', 'act_100'),
    entity('campaign', '802', 'Retargeting', 'act_100'),
  ],
  adset: [entity('adset', '901', 'Broad', '801')],
  ad: [],
};
const preset = (id, name) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});
const presets = [preset(7, 'Stop ad sets without leads'), preset(8, 'Budget up on cheap leads')];
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const notification = (id, minutes, fields) => ({
  id, workspace_id: 1, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'STOP',
  status: 'SUCCESS', account_id: 'act_100', account_name: account.name, adset_id: '', adset_name: '',
  entity_level: 'adset', entity_id: String(900 + id), entity_name: `Ad set ${id}`, rule_id: 7,
  rule_name: 'Stop ad sets without leads', action: 'STOP', message: 'Spent $4.50 with 0 leads', correlation_id: null,
  reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
  can_undo: false, undo_reason: '', duration_ms: 12, created_at: minutesAgo(minutes), kind: 'rule_actions',
  is_read: false, snoozed_until: null, unsnoozed_at: null, ...fields,
});
const notifications = [
  notification(4, 5, { event_type: 'NOTIFY_ONLY', action: 'NOTIFY_ONLY', message: 'CPL is $14, above the $12 goal', kind: 'rule_alerts' }),
  notification(3, 180, { is_read: true }),
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [390, 768, 1024, 1440]) {
    const small = width <= 880;
    const touch = small;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    let noAccounts = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      // Saved list views (#385): nothing saved yet; a change is accepted without being checked here.
      if (path.startsWith('/api/view-settings')) return route.fulfill({ json: request.method() === 'GET' ? { views: {} } : {} });
      if (request.method() !== 'GET') {
        // Opening a notification marks it read.
        if (request.method() === 'POST' && /^\/api\/inbox\/\d+\/read$/.test(path)) {
          return route.fulfill({ json: { success: true, unread_count: 0, priority_unread_count: 0 } });
        }
        errors.push(`Unexpected write: ${request.method()} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: noAccounts ? [] : [account] });
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/analytics/hierarchy/accounts') {
        const ids = url.searchParams.get('account_ids')?.split(',') ?? noAccounts ? [] : ['act_100'];
        const rows = (id, level) => id === 'act_100' ? inventory[level] ?? [] : [];
        const accounts = ids.map((id) => ({ account_id: id, campaigns: rows(id, 'campaign'), adsets: rows(id, 'adset'), ads: rows(id, 'ad') }));
        return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts, missing: [] } });
      }
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
        const items = parent === 'act_100' ? inventory[level] ?? [] : [];
        return route.fulfill({ json: { parent_id: parent, level, period: 'today', source: 'analytics_fact_store', data_as_of: null, total: items.length, items } });
      }
      const counts = { unread_count: 1, priority_unread_count: 0 };
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: counts });
      if (path === '/api/inbox') return route.fulfill({ json: { items: notifications, has_more: false, ...counts, hidden_by_filters: 0 } });
      if (path === '/api/inbox/facets') return route.fulfill({ json: { type: [], status: [], account: [], from: [] } });
      return route.fulfill({ json: [] });
    });

    const press = (locator) => (touch ? locator.tap() : locator.click());
    const settled = () => page.waitForTimeout(450);
    const shot = (name) => page.screenshot({ path: `${output}/${name}-${width}.png` });
    const assertNoOverflow = async (where) => {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= width, `${where} overflows at ${width}px: ${scrollWidth}`);
    };
    // The shared header create button (HeaderCreateButton): a round, borderless 28px "+",
    // labelled above 1024px, 40px on a touch screen.
    const assertCreateButton = async (button, where) => {
      const look = await button.evaluate((el) => {
        const label = el.querySelector('span');
        return {
          height: el.getBoundingClientRect().height,
          radius: getComputedStyle(el).borderRadius,
          labelShown: Boolean(label) && getComputedStyle(label).display !== 'none',
        };
      });
      assert.equal(look.height, touch ? 40 : 28, `${where}: height at ${width}px`);
      assert.equal(look.radius, '9999px', `${where}: round`);
      assert.equal(look.labelShown, width > 1024, `${where}: label shown only above 1024px`);
    };
    const assertInside = async (locator, what) => {
      const box = await locator.boundingBox();
      assert.ok(box && box.x >= -0.5 && box.x + box.width <= width + 0.5, `${what} leaves the ${width}px viewport: ${JSON.stringify(box)}`);
    };
    // Every header control is on screen and on top. One in a sideways-scrolling
    // strip counts as reachable while the strip itself is on screen; no tab is cut.
    const assertHeaderControls = async (where) => {
      const problems = await page.evaluate((viewport) => {
        const found = [];
        for (const el of document.querySelectorAll('main header :is(button, [role="tab"], a[href])')) {
          if (el.closest('[aria-hidden="true"]')) continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const name = el.getAttribute('aria-label') || el.textContent.trim();
          const header = el.closest('header');
          let strip = el.parentElement;
          while (strip && strip !== header && !['auto', 'scroll'].includes(getComputedStyle(strip).overflowX)) {
            strip = strip.parentElement;
          }
          if (strip === header) strip = null;
          const box = strip ? strip.getBoundingClientRect() : rect;
          if (box.left < -0.5 || box.right > viewport + 0.5) {
            found.push(`${name}: outside the window`);
            continue;
          }
          if (el.getAttribute('role') === 'tab' && el.scrollWidth > el.clientWidth) found.push(`${name}: cut`);
          if (strip) continue;
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (!hit || !el.contains(hit)) found.push(`${name}: covered`);
        }
        return found;
      }, width);
      assert.deepEqual(problems, [], `${where} header at ${width}px`);
      if (!touch) return;
      const tooSmall = await page.evaluate(() => [...document.querySelectorAll('main header :is(button, [role="tab"])')]
        .filter((el) => !el.closest('[aria-hidden="true"]') && el.getClientRects().length)
        .filter((el) => (el.getAttribute('role') === 'tab' || el.classList.contains('buyerly-tab-capsule')
          ? el.offsetHeight < 32
          : el.offsetHeight < 32 || el.offsetWidth < 32))
        .map((el) => `${el.getAttribute('aria-label') || el.textContent.trim()} ${el.offsetWidth}×${el.offsetHeight}`));
      assert.deepEqual(tooSmall, [], `${where}: finger-sized header controls at ${width}px`);
    };
    // The navigation drawer opens over the screen and closes from its backdrop.
    const assertDrawer = async (where) => {
      if (!small) return;
      const menu = page.getByRole('button', { name: 'Menu', exact: true }).first();
      await press(menu);
      await settled();
      await assertInside(page.locator('[data-sidebar-surface]'), `${where}: the drawer`);
      await assertNoOverflow(`${where} with the drawer open`);
      await shot(`${where}-drawer`);
      await page.touchscreen.tap(width - 10, 400);
      await settled();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false', `${where}: the backdrop closes the drawer`);
    };
    const assertDisplayOptions = async (where) => {
      const button = page.locator('main header').getByRole('button', { name: 'Display options' }).first();
      await press(button);
      const popover = page.locator('.buyerly-display-options-popover').first();
      await popover.waitFor();
      await settled();
      await assertInside(popover, `${where}: Display options`);
      await shot(`${where}-display`);
      await press(button);
      await popover.waitFor({ state: 'detached' });
    };
    // The details pane starts closed; at 1024px and below it lies over the list
    // below the header, 350px wide; wider, it is a column the list makes room for (#367).
    const assertDetails = async (where, paneName) => {
      const pane = page.getByRole('complementary', { name: paneName });
      assert.equal(await pane.count(), 0, `${where}: the details start closed`);
      const listBefore = await page.locator('.details-pane-content').evaluate((el) => el.getBoundingClientRect().width);
      await press(page.locator('main header').getByRole('button', { name: 'Open details' }));
      await pane.waitFor();
      await settled();
      const [box, layout, listAfter] = await page.evaluate(() => [
        document.querySelector('.details-pane').getBoundingClientRect().toJSON(),
        document.querySelector('.details-pane-layout').getBoundingClientRect().toJSON(),
        document.querySelector('.details-pane-content').getBoundingClientRect().width,
      ]);
      assert.equal(Math.round(box.right), Math.round(layout.right), `${where}: the pane sits on the right edge`);
      assert.equal(Math.round(box.width), Math.min(Math.round(layout.width), 350), `${where}: the pane width`);
      assert.equal(Math.round(box.top), Math.round(layout.top), `${where}: the pane starts below the header`);
      if (width <= 1024) assert.equal(Math.round(listAfter), Math.round(listBefore), `${where}: over the list at ${width}px`);
      else assert.equal(Math.round(listBefore - listAfter), 350, `${where}: the list makes room at ${width}px`);
      await assertNoOverflow(`${where} with the details open`);
      await assertHeaderControls(`${where} with the details open`);
      await shot(`${where}-details`);
      if (width <= 640) {
        await page.touchscreen.tap(10, Math.round(box.top + 100));
      } else {
        // No backdrop above a phone: the header's details button, still uncovered, closes it.
        await press(page.locator('main header').getByRole('button', { name: 'Close details' }));
      }
      await pane.waitFor({ state: 'detached' });
    };

    try {
      // Rules.
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await settled();
      await assertNoOverflow('rules');
      await assertHeaderControls('rules');
      await assertCreateButton(page.locator('main header').getByRole('button', { name: 'New rule' }), 'Rules: New rule');
      await shot('rules');
      await assertDisplayOptions('rules');
      await assertDetails('rules', 'Rules details');
      await assertDrawer('rules');
      // The three Rules tabs fit a phone too: Recently deleted is a page of its own (#381).
      const header = page.locator('main header');
      assert.equal(await header.getByRole('button', { name: /^\d+ more$/ }).count(), 0, `the Rules tabs fit at ${width}px`);
      for (const tab of ['All rules', 'Active', 'Paused']) {
        await assertInside(header.getByRole('tab', { name: tab, exact: true }), `the ${tab} tab`);
      }

      // Ads Manager: the table scrolls sideways inside its own viewport; amounts never wrap.
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="801"]').waitFor();
      await settled();
      await assertNoOverflow('ads manager');
      await assertHeaderControls('ads manager');
      const table = await page.locator('.campaign-list-container').evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX, scrolls: el.scrollWidth > el.clientWidth,
      }));
      assert.equal(table.overflowX, 'auto');
      if (width === 390) assert.ok(table.scrolls, 'the table scrolls sideways on a phone');
      const wrapped = await page.locator('[data-row-id="801"] .buyerly-data-metric-value').evaluateAll((cells) => cells
        .filter((cell) => cell.offsetHeight > 24).map((cell) => cell.textContent));
      assert.deepEqual(wrapped, [], `figures wrap at ${width}px`);
      await shot('ads-manager');
      await assertDisplayOptions('ads manager');
      await assertDetails('ads manager', 'Campaigns details');
      await assertDrawer('ads manager');

      // Every ad account is on screen at once: no account menu and no "+" in the header (Linear's team Issues).
      assert.equal(await page.locator('main header').getByRole('button', { name: 'Select ad account' }).count(), 0);
      assert.equal(await page.locator('main header').getByRole('button', { name: 'Add account' }).count(), 0);

      // With no accounts yet, "Add account" (#382) is the empty state's own button.
      noAccounts = true;
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.getByText('No ad accounts yet').waitFor();
      await settled();
      await assertNoOverflow('ads manager without accounts');
      await assertHeaderControls('ads manager without accounts');
      assert.equal(await page.getByRole('button', { name: 'Add account' }).count(), 1, 'Add account in the empty state only');
      await shot('ads-manager-empty');
      await press(page.locator('main').getByRole('button', { name: 'Add account' }));
      const connect = page.getByRole('dialog', { name: 'Add ad accounts' });
      await connect.waitFor();
      await settled();
      await assertInside(connect, 'the Add ad accounts dialog');
      await page.keyboard.press('Escape');
      await connect.waitFor({ state: 'detached' });
      noAccounts = false;

      // Inbox: the list, its "…" menu, then a notification and Snooze.
      await page.goto(`${origin}/alpha/inbox`);
      const rows = page.getByRole('listbox', { name: 'Notifications' }).getByRole('option');
      await rows.first().waitFor();
      await settled();
      await assertNoOverflow('inbox');
      await assertHeaderControls('inbox');
      await shot('inbox');
      await press(page.getByRole('button', { name: 'Notification actions' }));
      const actions = page.getByRole('menu');
      await actions.waitFor();
      await settled();
      await assertInside(actions, 'the Inbox "…" menu');
      await page.keyboard.press('Escape');
      await actions.waitFor({ state: 'detached' });
      await assertDisplayOptions('inbox');
      await assertDrawer('inbox');

      await press(rows.first());
      const snooze = page.getByRole('button', { name: 'Snooze notification' });
      await snooze.waitFor();
      await settled();
      await assertNoOverflow('notification');
      await assertHeaderControls('notification');
      if (width < 768) await page.getByRole('button', { name: 'Back to Inbox' }).waitFor();
      await shot('notification');
      await press(snooze);
      const palette = page.getByRole('dialog', { name: 'Snooze notification' });
      await palette.waitFor();
      await settled();
      await assertInside(palette, 'the Snooze palette');
      await shot('snooze');
      await page.keyboard.press('Escape');
      await palette.waitFor({ state: 'detached' });

      assert.deepEqual(errors, []);
      console.log(`Mobile screens: Rules, Ads Manager and Inbox passed at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${width}.png`, fullPage: true });
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
