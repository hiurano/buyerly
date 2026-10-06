// Exercise the real App with a synthetic API: aiming rules at campaigns and
// ad sets from Ads Manager (#320). The Rules cell shows "N rules" or "+ Rule"
// with no hover needed; its picker attaches and detaches one row's rule, and
// "Apply rule…" over a row selection aims a rule at several rows at once, as
// Meta's "Apply rule to". On a phone everything is tapped: the row checkbox
// shows, the picker rows are finger-sized and no keyboard pops up over them.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-rules-attach';
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
const metrics = {
  spend: 0, impressions: 0, reach: 0, cpm: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0,
  leads: 0, registrations: 0, purchases: 0, cost_per_lead: null, cost_per_registration: null, cost_per_purchase: null,
  cost_per_landing_page_view: null, cpc: 0, ctr: 0, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
};
const entity = (level, id, name, parent) => ({
  ...metrics, entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: 20, data_as_of: '2026-10-06T08:00:00Z',
});
const inventory = {
  act_100: {
    campaign: [entity('campaign', '801', 'Main campaign', 'act_100'), entity('campaign', '802', 'Retargeting', 'act_100')],
    adset: [
      entity('adset', '901', 'Broad', '801'),
      entity('adset', '902', 'Winners', '801'),
      entity('adset', '903', 'Fresh', '801'),
    ],
    ad: [],
  },
};
const preset = (id, name) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});
const presets = [preset(7, 'Budget up on cheap leads'), preset(8, 'Example stop')];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [390, 1440]) {
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: phone, isMobile: phone });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // The ad account as the server keeps it: rule id → scope.
    const attached = new Map();
    const activeRules = () => [...attached].map(([presetId, scope]) => ({
      preset_id: presetId, name: presets.find((item) => item.id === presetId).name, scope,
    }));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      if (verb !== 'GET') {
        const body = request.postData() ? request.postDataJSON() : null;
        writes.push({ verb, path, body });
        const assign = path.match(/^\/api\/accounts\/act_100\/assign-rule$/);
        const scope = path.match(/^\/api\/accounts\/act_100\/rules\/(\d+)\/scope$/);
        const detach = path.match(/^\/api\/accounts\/act_100\/detach-rule\/(\d+)$/);
        if (assign) attached.set(body.preset_id, body.scope);
        else if (scope) attached.set(Number(scope[1]), body);
        else if (detach) attached.delete(Number(detach[1]));
        else {
          errors.push(`Unexpected write: ${verb} ${path}`);
          return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
        }
        return route.fulfill({ json: { account_id: 'act_100', active_rules: activeRules(), rules_enabled: attached.size > 0 } });
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') {
        return route.fulfill({ json: [{
          id: 100, account_id: 'act_100', name: 'Leads account', custom_name: '', note: '', connection_type: 'system_user',
          timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
          rules_enabled: attached.size > 0, is_active: true, primary_result: '', target_cost_per_result: null,
          active_rules: activeRules(),
        }] });
      }
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
        const items = parent === 'act_100' ? inventory.act_100[level] ?? [] : [];
        return route.fulfill({ json: { parent_id: parent, level, period: 'today', source: 'analytics_fact_store', data_as_of: null, total: items.length, items } });
      }
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      return route.fulfill({ json: [] });
    });

    const press = (locator) => (phone ? locator.tap() : locator.click());
    const cell = (rowId) => page.locator(`[data-row-id="${rowId}"] [data-rule-cell]`);
    const lastWrite = () => writes.at(-1);
    const waitForWrites = async (count) => {
      for (let tries = 0; writes.length < count && tries < 100; tries += 1) await page.waitForTimeout(50);
      assert.equal(writes.length, count, `expected ${count} writes, saw ${JSON.stringify(writes)}`);
    };

    try {
      // 1. One campaign: "+ Rule" shows without a pointer over the row.
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      await cell('801').waitFor();
      await page.mouse.move(0, 0);
      assert.equal(await cell('801').innerText(), 'Rule');
      assert.equal(await cell('801').evaluate((el) => getComputedStyle(el).opacity), '1', '+ Rule shows without hover');
      if (phone) {
        assert.equal(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), true, 'the phone is a touch screen');
        // The column sits past the scroll on a phone; the cell stays pinned to the right edge.
        const reach = await cell('801').evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return { right: rect.right, width: innerWidth, onTop: Boolean(hit && el.contains(hit)) };
        });
        assert.ok(reach.right <= reach.width, `"+ Rule" ends at ${reach.right}px, past the ${reach.width}px screen`);
        assert.ok(reach.onTop, '"+ Rule" is not covered by another cell');
      }

      await press(cell('801'));
      const single = page.getByRole('dialog', { name: 'Rules for this campaign' });
      await single.waitFor();
      const option = single.getByRole('option', { name: /Example stop/ });
      if (phone) {
        // Laid-out height: the boundingBox would catch the opening scale animation.
        const height = await option.evaluate((el) => el.offsetHeight);
        assert.ok(height >= 44, `a finger-sized option, not ${height}px`);
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.matches('input, textarea'))), false, 'no keyboard pops up');
      }
      await page.screenshot({ path: `${output}/picker-${width}.png` });
      await press(option);
      await waitForWrites(1);
      assert.deepEqual(lastWrite(), {
        verb: 'POST', path: '/api/accounts/act_100/assign-rule',
        body: { preset_id: 8, scope: { level: 'campaign', ids: ['801'] } },
      });
      await page.waitForFunction(() => document.querySelector('[data-row-id="801"] [data-rule-cell]')?.textContent?.trim() === '1 rule');
      assert.equal(await option.getAttribute('aria-checked'), 'true');
      await page.keyboard.press('Escape');
      await single.waitFor({ state: 'detached' });

      // ...and off again from the same cell.
      await press(cell('801'));
      await single.waitFor();
      await press(single.getByRole('option', { name: /Example stop/ }));
      await waitForWrites(2);
      assert.deepEqual(lastWrite(), { verb: 'POST', path: '/api/accounts/act_100/detach-rule/8', body: null });
      await page.waitForFunction(() => document.querySelector('[data-row-id="801"] [data-rule-cell]')?.textContent?.trim() === 'Rule');
      await page.keyboard.press('Escape');
      await single.waitFor({ state: 'detached' });

      // 2. Several ad sets at once from the selection, as Meta's "Apply rule to".
      await page.goto(`${origin}/alpha/ads-manager/adsets?account=act_100`);
      await cell('903').waitFor();
      const select = async (rowId) => {
        if (phone) {
          const checkbox = page.locator(`[data-row-id="${rowId}"] [data-checked]`);
          assert.equal(await checkbox.evaluate((el) => getComputedStyle(el).opacity), '1', 'a phone shows the row checkbox');
          await checkbox.tap();
        } else {
          await page.locator(`[data-row-id="${rowId}"]`).hover();
          await page.keyboard.press('x');
        }
      };
      const openApplyRule = async () => {
        if (phone) await page.getByRole('button', { name: 'Open command menu' }).tap();
        else await page.keyboard.press('Control+K');
        await press(page.getByRole('option', { name: /Apply rule/ }));
      };
      await select('902');
      await select('903');
      await page.getByRole('toolbar', { name: '2 selected' }).waitFor();
      await openApplyRule();
      const bulk = page.getByRole('dialog', { name: 'Rules for 2 ad sets' });
      await bulk.waitFor();
      await page.screenshot({ path: `${output}/bulk-${width}.png` });
      await press(bulk.getByRole('option', { name: /Example stop/ }));
      await waitForWrites(3);
      assert.deepEqual(lastWrite(), {
        verb: 'POST', path: '/api/accounts/act_100/assign-rule',
        body: { preset_id: 8, scope: { level: 'adset', ids: ['902', '903'] } },
      });
      await page.waitForFunction(() => ['902', '903'].every((id) => (
        document.querySelector(`[data-row-id="${id}"] [data-rule-cell]`)?.textContent?.trim() === '1 rule'
      )));
      assert.equal(await cell('901').innerText(), 'Rule');
      await page.keyboard.press('Escape');
      await bulk.waitFor({ state: 'detached' });

      // A rule on some of the selection shows as mixed; picking it covers all of them.
      await page.getByRole('button', { name: 'Clear selected' }).click();
      await page.getByRole('toolbar').waitFor({ state: 'detached' });
      await select('901');
      await select('902');
      await page.getByRole('toolbar', { name: '2 selected' }).waitFor();
      if (phone) await openApplyRule();
      else await page.keyboard.press('a');
      await bulk.waitFor();
      const mixed = bulk.getByRole('option', { name: /Example stop/ });
      assert.equal(await mixed.getAttribute('aria-checked'), 'mixed');
      await press(mixed);
      await waitForWrites(4);
      assert.deepEqual(lastWrite(), {
        verb: 'PUT', path: '/api/accounts/act_100/rules/8/scope', body: { level: 'adset', ids: ['902', '903', '901'] },
      });
      await page.waitForFunction(() => document.querySelector('[data-row-id="901"] [data-rule-cell]')?.textContent?.trim() === '1 rule');
      // Picking it again takes it off the selection and leaves the rest.
      await press(mixed);
      await waitForWrites(5);
      assert.deepEqual(lastWrite(), {
        verb: 'PUT', path: '/api/accounts/act_100/rules/8/scope', body: { level: 'adset', ids: ['903'] },
      });
      // Both cells are waited for: the list is redrawn from the refreshed account, not at once.
      await page.waitForFunction(() => (
        document.querySelector('[data-row-id="902"] [data-rule-cell]')?.textContent?.trim() === 'Rule'
        && document.querySelector('[data-row-id="903"] [data-rule-cell]')?.textContent?.trim() === '1 rule'
      ));
      await page.keyboard.press('Escape');
      await bulk.waitFor({ state: 'detached' });

      assert.deepEqual(errors, []);
      console.log(`Rules in Ads Manager: attach and detach on a row and over a selection passed at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${width}.png`, fullPage: true });
      console.error(errors, writes);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
