// Exercise the real App with a synthetic API: the details pane on Ads Manager
// and Rules, one component built on Linear's DetailsPaneContainer (#367).
// - It starts closed on both, and each view keeps its own open state and
//   width across a reload.
// - At 1440px it is a column: the list gives up its room, so the pane covers
//   none of the table, toolbar or header; it slides in on a spring (no
//   overshoot) while the list narrows; a drag on its edge resizes it and a
//   click there closes it; Ctrl+I and ] toggle the pane of the view on screen.
// - At 1000px it lies over the list, 350px wide, without a resizer, and the
//   list keeps its width.
// - On a touch phone a backdrop dims the list and a tap on it closes the pane.
// - Its tabs filter the list: Ads Manager Status (Meta's real delivery state)
//   and Rules; Rules Status, Action and Groups. Switching tabs clears the filter.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-details-pane';
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
  target_cost_per_result: null,
  active_rules: [{ preset_id: 7, name: 'Stop ad sets without leads', scope: { level: 'campaign', ids: ['801'] } }],
};
const metrics = {
  spend: 120.5, impressions: 12000, reach: 0, cpm: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0,
  landing_page_views: 0, leads: 3, registrations: 0, purchases: 0, cost_per_lead: 40.17, cost_per_registration: null,
  cost_per_purchase: null, cost_per_landing_page_view: null, cpc: 0, ctr: 1.23, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
};
const entity = (level, id, name, parent, status, effective) => ({
  ...metrics, entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status, effective_status: effective, daily_budget: 2500, data_as_of: '2026-10-09T08:00:00Z',
});
const inventory = {
  campaign: [
    entity('campaign', '801', 'Delivering campaign', 'act_100', 'ACTIVE', 'ACTIVE'),
    entity('campaign', '802', 'Rejected campaign', 'act_100', 'ACTIVE', 'DISAPPROVED'),
    entity('campaign', '803', 'Switched off campaign', 'act_100', 'PAUSED', 'PAUSED'),
  ],
  adset: [entity('adset', '901', 'Broad', '801', 'ACTIVE', 'ACTIVE')],
  ad: [],
};
const preset = (id, name, fields) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: ['act_100'], attached_scopes: {}, ...fields,
});
const presets = [
  preset(7, 'Stop ad sets without leads'),
  preset(8, 'Budget up on cheap leads', { action: 'increase_budget', budget_change_percent: 20, budget_max_daily: 100 }),
  preset(9, 'Tell me about expensive leads', { action: 'notify_only', enabled: false }),
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
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      return route.fulfill({ json: [] });
    });
    return { context, page, errors };
  };

  const toggle = (page, name) => page.locator('main header').getByRole('button', { name, exact: true });
  const paneOf = (page, name) => page.getByRole('complementary', { name });
  const rect = (locator) => locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
  });
  const settle = (page) => page.waitForTimeout(500);

  /** Opens the pane with a click and samples its left edge on every frame: it slides in, without overshoot. */
  const openAndSample = async (page, where) => {
    const samples = await page.evaluate(async () => {
      const button = [...document.querySelectorAll('main header button')].find((el) => el.getAttribute('aria-label') === 'Open details');
      const layout = document.querySelector('.details-pane-layout');
      const right = layout.getBoundingClientRect().right;
      const frames = [];
      const start = performance.now();
      button.click();
      await new Promise((resolve) => {
        const tick = () => {
          const pane = document.querySelector('.details-pane');
          if (pane) frames.push({ at: performance.now() - start, left: pane.getBoundingClientRect().left, right });
          if (performance.now() - start < 700) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      return frames;
    });
    assert.ok(samples.length > 5, `${where}: the pane was sampled`);
    const final = samples[samples.length - 1].left;
    const first = samples[0];
    assert.ok(first.left > final + 100, `${where}: the pane starts off to the right (${first.left} → ${final})`);
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(samples[index].left <= samples[index - 1].left + 0.5, `${where}: the pane slides one way`);
      assert.ok(samples[index].left >= final - 0.5, `${where}: the pane overshoots`);
    }
    const near = samples.find((sample) => sample.left - final < 0.01 * (first.right - final));
    assert.ok(near && near.at >= 60 && near.at <= 400, `${where}: the pane settles in ${near?.at}ms`);
  };

  /**
   * Nothing sits under the pane: every header and toolbar control is clear of
   * it and on top, the list's own visible area ends where the pane starts, and
   * each list row is on top at its visible middle.
   */
  const assertNothingCovered = async (page, where) => {
    const covered = await page.evaluate(() => {
      const pane = document.querySelector('.details-pane').getBoundingClientRect();
      const content = document.querySelector('.details-pane-content').getBoundingClientRect();
      const found = [];
      if (content.right > pane.left + 0.5) found.push(`the list runs ${content.right - pane.left}px under the pane`);
      const overlaps = (box) => box.right > pane.left + 0.5 && box.left < pane.right && box.bottom > pane.top && box.top < pane.bottom;
      for (const el of document.querySelectorAll('main header :is(button, [role="tab"])')) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || el.closest('[aria-hidden="true"]')) continue;
        const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40);
        if (overlaps(box)) found.push(`${name}: under the pane`);
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (!hit || !(el.contains(hit) || hit.contains(el))) found.push(`${name}: covered`);
      }
      for (const row of document.querySelectorAll('.details-pane-content [data-row-id]')) {
        const box = row.getBoundingClientRect();
        if (!box.height) continue;
        const x = Math.max(box.left, content.left) + (Math.min(box.right, content.right) - Math.max(box.left, content.left)) / 2;
        const hit = document.elementFromPoint(x, box.top + box.height / 2);
        if (hit?.closest('.details-pane')) found.push(`row ${row.getAttribute('data-row-id')}: covered`);
      }
      return found;
    });
    assert.deepEqual(covered, [], `${where}: covered by the pane`);
  };

  // 1440px: a column beside the list.
  {
    const { context, page, errors } = await openPage(1440);
    try {
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      await page.locator('[data-row-id="801"]').waitFor();
      const pane = paneOf(page, 'Ads Manager details');
      assert.equal(await pane.count(), 0, 'Ads Manager: the pane starts closed');
      const listBefore = await rect(page.locator('.details-pane-content'));

      await openAndSample(page, 'Ads Manager 1440px');
      await settle(page);
      const paneBox = await rect(page.locator('.details-pane'));
      const layoutBox = await rect(page.locator('.details-pane-layout'));
      const listAfter = await rect(page.locator('.details-pane-content'));
      assert.equal(Math.round(paneBox.width), 350, 'the pane is 350px wide');
      assert.equal(Math.round(paneBox.right), Math.round(layoutBox.right), 'the pane sits on the right edge');
      assert.equal(Math.round(listAfter.right), Math.round(paneBox.left), 'the list ends where the pane starts');
      assert.equal(Math.round(listBefore.width - listAfter.width), 350, 'the list gives up the pane’s room');
      assert.equal(Math.round(paneBox.top), Math.round(layoutBox.top), 'the pane starts below the header');
      await assertNothingCovered(page, 'Ads Manager 1440px');
      await page.screenshot({ path: `${output}/ads-manager-1440.png` });

      // Status is Meta's real delivery state: the rejected campaign is not "Active".
      const tabs = pane.getByRole('tab');
      assert.deepEqual(await tabs.allTextContents(), ['Status', 'Rules']);
      const row = (name) => pane.locator('.details-facets-row', { hasText: name });
      assert.equal((await row('Active').locator('.details-facets-row-count').textContent()).trim(), '1');
      assert.equal((await row('Disapproved').locator('.details-facets-row-count').textContent()).trim(), '1');
      assert.equal((await row('Paused').locator('.details-facets-row-count').textContent()).trim(), '1');
      await row('Disapproved').click();
      await page.locator('[data-row-id="801"]').waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-row-id="802"]').count(), 1, 'the quick filter keeps the rejected campaign');
      assert.equal(await row('Disapproved').getAttribute('aria-pressed'), 'true');
      assert.equal(await row('Active').getAttribute('data-status'), 'muted', 'the other rows fade');
      await row('Disapproved').hover();
      assert.equal((await row('Disapproved').locator('.details-facets-row-link').textContent()).trim(), 'Clear filter');
      // Switching tabs clears the old tab's filter.
      await pane.getByRole('tab', { name: 'Rules' }).click();
      await page.locator('[data-row-id="801"]').waitFor();
      assert.equal((await row('Stop ad sets without leads').locator('.details-facets-row-count').textContent()).trim(), '1');
      await row('No rules').hover();
      assert.equal((await row('No rules').locator('.details-facets-row-link').textContent()).trim(), 'See campaigns');

      // A drag on the pane's edge resizes it; the width survives a reload.
      const handle = page.locator('.details-pane-resizer');
      const handleBox = await handle.boundingBox();
      await page.mouse.move(handleBox.x + 3, handleBox.y + 200);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 50, handleBox.y + 200, { steps: 5 });
      await page.mouse.move(handleBox.x - 100, handleBox.y + 200, { steps: 5 });
      await page.mouse.up();
      await settle(page);
      assert.equal(Math.round((await rect(page.locator('.details-pane'))).width), 450, 'the drag widened the pane');
      await page.reload();
      await page.locator('[data-row-id="801"]').waitFor();
      await pane.waitFor();
      await settle(page);
      assert.equal(Math.round((await rect(page.locator('.details-pane'))).width), 450, 'the width survives a reload');
      assert.equal(await pane.getByRole('tab', { name: 'Rules' }).getAttribute('aria-selected'), 'true', 'the last tab is kept');

      // A click on the edge, without a drag, closes it; Ctrl+I and ] toggle it.
      const edge = await page.locator('.details-pane-resizer').boundingBox();
      await page.mouse.click(edge.x + 3, edge.y + 200);
      await pane.waitFor({ state: 'detached' });
      await page.keyboard.press('Control+KeyI');
      await pane.waitFor();
      await page.keyboard.press(']');
      await pane.waitFor({ state: 'detached' });
      await page.reload();
      await page.locator('[data-row-id="801"]').waitFor();
      await settle(page);
      assert.equal(await pane.count(), 0, 'closed stays closed after a reload');

      // Rules keeps its own pane: still closed, with Status, Action and Groups.
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      const rulesPane = paneOf(page, 'Rules details');
      assert.equal(await rulesPane.count(), 0, 'Rules: the pane starts closed');
      await page.keyboard.press('Control+KeyI');
      await rulesPane.waitFor();
      await settle(page);
      assert.equal(Math.round((await rect(page.locator('.details-pane'))).width), 350, 'Rules has its own width');
      assert.deepEqual(await rulesPane.getByRole('tab').allTextContents(), ['Status', 'Action', 'Groups']);
      await assertNothingCovered(page, 'Rules 1440px');
      await page.screenshot({ path: `${output}/rules-1440.png` });
      await rulesPane.getByRole('tab', { name: 'Action' }).click();
      const ruleRow = (name) => rulesPane.locator('.details-facets-row', { hasText: name });
      await ruleRow('Increase budget').click();
      await page.locator('[data-row-id="7"]').waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-row-id="8"]').count(), 1, 'Rules: the Action filter keeps the budget rule');
      await rulesPane.getByRole('tab', { name: 'Status' }).click();
      await page.locator('[data-row-id="7"]').waitFor();
      assert.equal((await ruleRow('Paused').locator('.details-facets-row-count').textContent()).trim(), '1');

      // Back on Ads Manager its pane is still closed: one view's toggle never opens the other's.
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      await page.locator('[data-row-id="801"]').waitFor();
      await settle(page);
      assert.equal(await pane.count(), 0, 'Ads Manager stays closed when Rules opened');
      assert.deepEqual(errors, []);
      console.log('Details pane: column at 1440px passed');
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true });
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // 1000px: over the list, without a resizer.
  {
    const { context, page, errors } = await openPage(1000);
    try {
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      await page.locator('[data-row-id="801"]').waitFor();
      const listBefore = await rect(page.locator('.details-pane-content'));
      await openAndSample(page, 'Ads Manager 1000px');
      await settle(page);
      const paneBox = await rect(page.locator('.details-pane'));
      const layoutBox = await rect(page.locator('.details-pane-layout'));
      const listAfter = await rect(page.locator('.details-pane-content'));
      assert.equal(Math.round(paneBox.width), 350, 'over the list the pane is 350px wide');
      assert.equal(Math.round(paneBox.right), Math.round(layoutBox.right), 'over the list it sits on the right edge');
      assert.equal(Math.round(paneBox.top), Math.round(layoutBox.top), 'over the list it starts below the header');
      assert.equal(Math.round(listAfter.width), Math.round(listBefore.width), 'the list keeps its width');
      assert.equal(await page.locator('.details-pane-resizer').count(), 0, 'no resizer over the list');
      assert.equal(await page.locator('.details-pane-scrim').count(), 0, 'no backdrop without a touch phone');
      await page.screenshot({ path: `${output}/ads-manager-1000.png` });
      await toggle(page, 'Close details').click();
      await paneOf(page, 'Ads Manager details').waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      console.log('Details pane: over the list at 1000px passed');
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-1000.png`, fullPage: true });
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // 390px touch phone: a backdrop dims the list, a tap on it closes the pane.
  {
    const { context, page, errors } = await openPage(390, true);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await toggle(page, 'Open details').tap();
      const pane = paneOf(page, 'Rules details');
      await pane.waitFor();
      await settle(page);
      const scrim = page.locator('.details-pane-scrim');
      assert.equal(await scrim.count(), 1, 'a backdrop dims the list on a phone');
      const paneBox = await rect(page.locator('.details-pane'));
      const layoutBox = await rect(page.locator('.details-pane-layout'));
      assert.equal(Math.round(paneBox.width), Math.min(350, Math.round(layoutBox.width)), 'the pane width on a phone');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `the page scrolls sideways: ${scrollWidth}`);
      await page.screenshot({ path: `${output}/rules-390.png` });
      await page.touchscreen.tap(10, Math.round(paneBox.top + 100));
      await pane.waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      console.log('Details pane: phone backdrop at 390px passed');
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-390.png`, fullPage: true });
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
