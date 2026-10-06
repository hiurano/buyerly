// Exercise the real App with a synthetic API: Rules, Ads Manager and Inbox at
// 390, 768, 1024 and 1440px (#286). At every width the document never scrolls
// sideways and every header control is on screen and not covered — a control
// in the sideways-scrolling tab strip is reached by scrolling the strip. Touch
// screens get 40px header buttons and 36px tabs. At Linear's small width
// (880px and below) a view's details panel is a sheet over the list, closed at
// first and closed by its backdrop; the navigation drawer opens over each
// screen without overflow. Display options and the Inbox menus stay on screen.
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
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
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
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (request.method() !== 'GET') {
        errors.push(`Unexpected write: ${request.method()} ${path}`);
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
        .filter((el) => (el.getAttribute('role') === 'tab'
          ? el.offsetHeight < 36
          : el.offsetHeight < 40 || el.offsetWidth < 40))
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
      const popover = page.locator('.linear-display-options-popover').first();
      await popover.waitFor();
      await settled();
      await assertInside(popover, `${where}: Display options`);
      await shot(`${where}-display`);
      await press(button);
      await popover.waitFor({ state: 'detached' });
    };
    // Small width: the details panel is a sheet, closed at first, over the list.
    const assertDetails = async (where, sheetName, columnSelector) => {
      const sheet = page.getByRole('region', { name: sheetName });
      if (!small) {
        if (columnSelector) await page.locator(columnSelector).waitFor();
        assert.equal(await sheet.count(), 0, `${where}: a column, not a sheet, at ${width}px`);
        return;
      }
      assert.equal(await sheet.count(), 0, `${where}: the details start closed on a small screen`);
      await press(page.locator('main header').getByRole('button', { name: 'Open details' }));
      await sheet.waitFor();
      await settled();
      const box = await sheet.boundingBox();
      assert.equal(Math.round(box.x + box.width), width, `${where}: the sheet sits on the right edge`);
      assert.equal(Math.round(box.width), Math.min(width - 40, 360), `${where}: the sheet width`);
      await assertNoOverflow(`${where} with the details open`);
      await shot(`${where}-details`);
      await page.touchscreen.tap(10, 400);
      await sheet.waitFor({ state: 'detached' });
    };

    try {
      // Rules.
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await settled();
      await assertNoOverflow('rules');
      await assertHeaderControls('rules');
      await shot('rules');
      await assertDisplayOptions('rules');
      await assertDetails('rules', 'Rule groups');
      await assertDrawer('rules');

      // Ads Manager: the table scrolls sideways inside its own viewport; amounts never wrap.
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      await page.locator('[data-row-id="801"]').waitFor();
      await settled();
      await assertNoOverflow('ads manager');
      await assertHeaderControls('ads manager');
      const table = await page.locator('.campaign-list-container').evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX, scrolls: el.scrollWidth > el.clientWidth,
      }));
      assert.equal(table.overflowX, 'auto');
      if (width === 390) assert.ok(table.scrolls, 'the table scrolls sideways on a phone');
      const wrapped = await page.locator('[data-row-id="801"] .tabular-nums').evaluateAll((cells) => cells
        .filter((cell) => cell.offsetHeight > 24).map((cell) => cell.textContent));
      assert.deepEqual(wrapped, [], `figures wrap at ${width}px`);
      await shot('ads-manager');
      await assertDisplayOptions('ads manager');
      await assertDetails('ads manager', 'Ads Manager details', '.campaign-view-details');
      await assertDrawer('ads manager');

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
