// Exercise the real App with a synthetic API: where a rule stands on each
// campaign (#322). The Rules list shows the last check apart from the last
// action; "Status on campaigns" in the row menu lists each campaign's state
// (fired, waiting until …, gave way to another rule, condition not met with the
// readings); the Ads Manager rule picker of one campaign shows the same from
// the campaign's side. Both fit a 390px phone without sideways scrolling.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-rule-states';
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
const entity = (id, name) => ({
  ...metrics, entity_id: id, entity_name: name, entity_level: 'campaign', parent_entity_id: 'act_100', account_id: 'act_100',
  currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: 20, data_as_of: '2026-10-06T08:00:00Z',
});
const campaigns = [entity('801', 'Main campaign'), entity('802', 'Retargeting'), entity('803', 'Prospecting')];

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const minutesAhead = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
const preset = {
  id: 7, name: 'Daily spend alert', action: 'notify_only', level: 'campaign', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, currency_mode: 'account', created_at: '2026-10-01 10:00',
  needs_review: false, review_reason: '',
  // Checked two minutes ago; never acted on the history's terms.
  last_run_at: '', last_checked_at: minutesAgo(2),
  attached_account_ids: ['act_100'], attached_scopes: { act_100: { level: 'account', ids: [] } },
};
// On the whole ad account (#300): it checks every campaign without being aimed
// at one, and has not checked any of them yet.
const accountRule = {
  ...preset, id: 9, name: 'Stop overspend', action: 'turn_off', last_checked_at: '',
  conditions: [{ metric: 'spend', operator: 'gte', value: 30, time_window: 'today' }],
};
const state = (entityId, entityName, fields) => ({
  rule_id: 7, rule_name: preset.name, account_id: 'act_100', account_name: 'Leads account',
  entity_level: 'campaign', entity_id: entityId, entity_name: entityName, campaign_id: '',
  detail: '', wait_until: '', yielded_to_rule_id: null, yielded_to_rule_name: '',
  checked_at: minutesAgo(2), acted_at: '', ...fields,
});
const states = [
  state('802', 'Retargeting', { state: 'not_met', detail: 'Spend 3.00 USD, needs ≥ 10.00 USD' }),
  state('801', 'Main campaign', {
    state: 'cooldown', detail: 'Spend (12.00 USD) ≥ 10.00 USD', wait_until: minutesAhead(300), acted_at: minutesAgo(180),
  }),
  state('803', 'Prospecting', {
    state: 'yielded', detail: 'Spend (40.00 USD) ≥ 10.00 USD', yielded_to_rule_id: 9, yielded_to_rule_name: 'Stop overspend',
  }),
];

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
    const stateReads = [];
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
      if (path === '/api/accounts') {
        return route.fulfill({ json: [{
          id: 100, account_id: 'act_100', name: 'Leads account', custom_name: '', note: '', connection_type: 'system_user',
          timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
          rules_enabled: true, is_active: true, primary_result: '', target_cost_per_result: null,
          active_rules: [
            { preset_id: 9, name: accountRule.name, scope: { level: 'account', ids: [] } },
            { preset_id: 7, name: preset.name, scope: { level: 'campaign', ids: ['801'] } },
          ],
        }] });
      }
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
        const items = parent === 'act_100' && level === 'campaign' ? campaigns : [];
        return route.fulfill({ json: { parent_id: parent, level, period: 'today', source: 'analytics_fact_store', data_as_of: null, total: items.length, items } });
      }
      if (path === '/api/presets') return route.fulfill({ json: [preset, accountRule] });
      if (path === '/api/presets/7/states') {
        stateReads.push('rule');
        return route.fulfill({ json: states });
      }
      if (path === '/api/rule-states') {
        stateReads.push(`${url.searchParams.get('entity_level')}:${url.searchParams.get('entity_id')}`);
        const entityId = url.searchParams.get('entity_id');
        return route.fulfill({ json: states.filter((row) => row.entity_id === entityId) });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      return route.fulfill({ json: [] });
    });

    const press = (locator) => (phone ? locator.tap() : locator.click());
    const fitsTheScreen = async (locator, what) => {
      const box = await locator.boundingBox();
      assert.ok(box, `${what} is laid out`);
      assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `${what} fits ${width}px: ${JSON.stringify(box)}`);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(sideways <= 0, `no sideways page scroll, ${sideways}px`);
    };

    try {
      // 1. The list tells the last check apart from the last action.
      await page.goto(`${origin}/alpha/rules`);
      const row = page.locator('[data-row-id="7"]');
      await row.waitFor();
      const rowText = await row.innerText();
      assert.match(rowText, /2m ago/, 'last check');
      assert.match(rowText, /Never/, 'last action');
      if (!phone) {
        const header = await page.locator('[role="columnheader"]').allInnerTexts();
        assert.ok(header.some((text) => text.includes('Last check')), `Last check column in ${header}`);
        assert.ok(header.some((text) => text.includes('Last action')), `Last action column in ${header}`);
      }

      // 2. The rule's side: every campaign it checks, with its state.
      await press(page.getByRole('button', { name: `Actions for ${preset.name}` }));
      await press(page.getByRole('menuitem', { name: 'Status on campaigns' }));
      const dialog = page.locator('[data-rule-states-dialog]');
      await dialog.waitFor();
      await dialog.locator('[data-rule-state]').first().waitFor();
      assert.deepEqual(
        await dialog.locator('[data-rule-state]').evaluateAll((items) => items.map((item) => item.dataset.ruleState)),
        ['cooldown', 'yielded', 'not_met'],
        'what needs attention first',
      );
      const dialogText = await dialog.innerText();
      assert.match(dialogText, /Waiting until /);
      assert.match(dialogText, /Fired 3h ago/);
      assert.match(dialogText, /Gave way to Stop overspend/);
      assert.match(dialogText, /Condition not met/);
      assert.match(dialogText, /Spend 3\.00 USD, needs ≥ 10\.00 USD/);
      assert.match(dialogText, /Last check 2m ago · Last action never/);
      // Why a matching rule can still be quiet: how rules on one campaign combine (#300).
      const together = dialog.locator('[data-rules-together]');
      await together.scrollIntoViewIfNeeded();
      const togetherText = await together.innerText();
      assert.match(togetherText, /When several rules check one campaign/);
      assert.match(togetherText, /Alerts always fire/);
      assert.match(togetherText, /turn off, then budget −, budget \+, turn on/);
      assert.match(togetherText, /weaker ones wait too/);
      assert.match(togetherText, /undo in Inbox/);
      await fitsTheScreen(together, 'how rules work together');
      await fitsTheScreen(dialog, 'the status dialog');
      await page.screenshot({ path: `${output}/rule-side-${width}.png` });
      await press(dialog.getByRole('button', { name: 'Close' }));
      await dialog.waitFor({ state: 'detached' });

      // 3. The campaign's side: the picker of one campaign shows each rule's state.
      await page.goto(`${origin}/alpha/ads-manager/campaigns?account=act_100`);
      const cell = page.locator('[data-row-id="801"] [data-rule-cell]');
      await cell.waitFor();
      // The account-wide rule counts on every campaign: 801 has its own and
      // that one, 802 only the account's — never a bare "+ Rule".
      await page.waitForFunction(() => document.querySelector('[data-row-id="801"] [data-rule-cell]')?.textContent?.trim() === '2 rules');
      assert.equal(await cell.getAttribute('data-inherited-rules'), '1');
      assert.equal(await cell.getAttribute('title'), '1 on this campaign · 1 through the ad account');
      const other = page.locator('[data-row-id="802"] [data-rule-cell]');
      assert.equal((await other.innerText()).trim(), '1 rule');
      assert.equal(await other.getAttribute('title'), '1 through the ad account');
      await press(cell);
      const section = page.locator('[data-rule-states]');
      await section.locator('[data-rule-state="cooldown"]').waitFor();
      const sectionText = await section.innerText();
      assert.match(sectionText, /Status on this campaign/);
      assert.match(sectionText, /Daily spend alert/);
      assert.match(sectionText, /Waiting until /);
      assert.ok(stateReads.includes('campaign:801'), `the picker asked for campaign 801: ${stateReads}`);
      // The account-wide rule is listed as checking this campaign, ticked but
      // changed on the Rules screen, and says it has not checked it yet.
      await section.locator('[data-rule-state="unchecked"]').waitFor();
      const statusText = await section.innerText();
      assert.match(statusText, /Stop overspend/);
      assert.match(statusText, /Not checked yet/);
      assert.match(statusText, /checks it every 5 min/);
      const accountOption = page.getByRole('option', { name: /Stop overspend/ });
      assert.equal(await accountOption.getAttribute('aria-checked'), 'true');
      assert.equal(await accountOption.getAttribute('aria-disabled'), 'true');
      assert.match(await accountOption.innerText(), /Whole account/);
      const optionOrder = await page.getByRole('option').evaluateAll((items) => items.map((item) => item.textContent));
      assert.equal(optionOrder.length, 2, `both rules listed: ${optionOrder}`);
      await fitsTheScreen(page.locator('[data-animated-popover-container]'), 'the rule picker');
      await page.screenshot({ path: `${output}/campaign-side-${width}.png` });

      assert.deepEqual(errors, []);
      console.log(`Rule states from the rule and from the campaign passed at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${width}.png`, fullPage: true });
      console.error(errors, stateReads);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
