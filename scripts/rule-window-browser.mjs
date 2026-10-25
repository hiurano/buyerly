// Exercise the real App with a synthetic API: the rule window (#387), as
// Linear's New issue.
// - It reads WHEN [level] has [all] of [conditions] [window] THEN [action];
//   a condition is a chip "metric │ operator │ value ×", the metric menu has
//   search and sections, and a missing value is marked in its chip.
// - The name is optional: the field's hint is the name the rule gets.
// - Run on picks ad accounts with search, the whole account or campaigns; a
//   whole account shows what the draft would check there before saving.
// - One sentence says what the rule does, how often, when and where.
// - Ctrl/Cmd+Enter creates the rule where it runs in one write; the server's
//   own check shows before the click.
// - Escape keeps an unsaved rule as a draft for the next open; Discard clears it.
// - Editing sends where it runs only when that changed.
// - Ads Manager's rule picker opens it with the selection as Run on.
// - On a phone it fills the screen and Create rule stays in reach.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-rule-window';
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
const metrics = {
  spend: 0, impressions: 0, reach: 0, cpm: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0,
  leads: 0, registrations: 0, purchases: 0, cost_per_lead: null, cost_per_registration: null, cost_per_purchase: null,
  cost_per_landing_page_view: null, cpc: 0, ctr: 0, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
};
const entity = (level, id, name, parent) => ({
  ...metrics, entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: 'act_100',
  currency: 'USD', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: 20, data_as_of: '2026-10-14T08:00:00Z',
});
const inventory = {
  campaign: [entity('campaign', '801', 'Main campaign', 'act_100'), entity('campaign', '802', 'Retargeting', 'act_100')],
  adset: [entity('adset', '901', 'Broad', '801')],
  ad: [],
};
const account = (id, name) => ({
  id: Number(id.slice(4)), account_id: id, name, custom_name: '', note: '', connection_type: 'system_user',
  timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
  rules_enabled: false, is_active: true, primary_result: '', target_cost_per_result: null, active_rules: [],
});
const preset = (id, name, fields = {}) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false, created_at: '2026-10-01T00:00:00Z',
  review_reason: '', last_run_at: '', last_checked_at: '', attached_account_ids: [], attached_scopes: {}, label_ids: [],
  ...fields,
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  const openPage = async (width, phone = false) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: phone, isMobile: phone });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    await mockSync(page);
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    const checks = [];
    const presets = [preset(7, 'First rule', { attached_account_ids: ['act_100'], attached_scopes: { act_100: { level: 'account', ids: [] } } })];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      if (path.startsWith('/api/view-settings')) return route.fulfill({ json: verb === 'GET' ? { views: {} } : {} });
      const body = request.postData() ? request.postDataJSON() : null;
      // Reading a draft writes nothing: the check and the preview.
      if (verb === 'POST' && path === '/api/presets/check') {
        checks.push(body);
        if (body.conditions.some((condition) => condition.value === 999)) {
          return route.fulfill({ status: 409, json: { detail: 'This rule contradicts "First rule" on the same ad sets.' } });
        }
        return route.fulfill({ json: { valid: true } });
      }
      if (verb === 'POST' && path === '/api/accounts/act_100/rules/preview') {
        return route.fulfill({ json: {
          account_id: 'act_100', account_name: 'Leads account', level: body.level, rule_name: body.name || 'New rule',
          action: body.action, rules_enabled: false, already_attached: false, total: 3, running: 2, matching: 1,
          data_as_of: null, lifetime_since: null, entities: [],
        } });
      }
      if (verb !== 'GET') {
        writes.push({ verb, path, body });
        const one = path.match(/^\/api\/presets\/(\d+)$/);
        const scopes = (attachments) => Object.fromEntries((attachments ?? []).map((item) => [item.account_id, item.scope]));
        if (verb === 'POST' && path === '/api/presets') {
          const created = preset(20 + presets.length, body.name, {
            ...body, attached_account_ids: (body.attachments ?? []).map((item) => item.account_id), attached_scopes: scopes(body.attachments),
          });
          presets.push(created);
          return route.fulfill({ json: created });
        }
        if (one && verb === 'PUT') {
          const index = presets.findIndex((item) => item.id === Number(one[1]));
          const attachments = body.attachments === undefined ? {} : {
            attached_account_ids: body.attachments.map((item) => item.account_id), attached_scopes: scopes(body.attachments),
          };
          presets[index] = { ...presets[index], ...body, ...attachments };
          return route.fulfill({ json: presets[index] });
        }
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: [account('act_100', 'Leads account'), account('act_200', 'Sweeps account')] });
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/analytics/hierarchy/accounts') {
        const ids = url.searchParams.get('account_ids')?.split(',') ?? ['act_100', 'act_200'];
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
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      return route.fulfill({ json: [] });
    });
    const waitForWrites = async (count) => {
      for (let tries = 0; writes.length < count && tries < 100; tries += 1) await page.waitForTimeout(50);
      assert.equal(writes.length, count, `expected ${count} writes, saw ${JSON.stringify(writes)}`);
    };
    return { context, page, errors, writes, checks, waitForWrites };
  };

  const summary = (form) => form.getByTestId('rule-summary');
  const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();

  // 1440px.
  {
    const { context, page, errors, writes, checks, waitForWrites } = await openPage(1440);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await page.getByRole('button', { name: 'New rule' }).click();
      const form = page.getByRole('dialog', { name: 'New rule' });
      await form.waitFor();
      // Laid-out width: the bounding box would catch the opening scale animation.
      assert.equal(await form.evaluate((el) => el.offsetWidth), 750, 'Linear\'s 750px window');

      // WHEN … THEN …, one empty condition marked only once the buyer tries to save.
      assert.match(await text(form.getByRole('group', { name: 'When' })), /^When Ad set has all of Spend ≥ (USD )?Condition Today$/i);
      assert.match(await text(form.getByRole('group', { name: 'Then' })), /^Then Turn the ad set off$/i);
      const create = form.getByRole('button', { name: 'Create rule' });
      assert.equal(await create.isDisabled(), true, 'nothing to create without a value');
      assert.match(await form.locator('#rule-window-blockers').textContent(), /Enter a value for Spend/);
      await form.getByRole('textbox', { name: 'Spend value' }).fill('4');

      // A second condition; its metric from the searchable menu.
      await form.getByRole('button', { name: 'Condition' }).click();
      await form.getByRole('button', { name: 'Metric: Leads' }).click();
      const metricMenu = form.getByRole('dialog', { name: 'Metric for condition 2' });
      await metricMenu.waitFor();
      assert.deepEqual(await metricMenu.getByRole('group').evaluateAll((groups) => groups.map((group) => group.getAttribute('aria-label'))), ['Money', 'Counts', 'Rates']);
      await metricMenu.getByRole('textbox').fill('reg');
      assert.deepEqual(await metricMenu.getByRole('option').allInnerTexts(), ['CPReg', 'Registrations']);
      await page.screenshot({ path: `${output}/metric-menu-1440.png` });
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await form.getByRole('button', { name: 'Metric: Registrations' }).click();
      await form.getByRole('dialog', { name: 'Metric for condition 2' }).getByRole('option', { name: 'Leads', exact: true }).click();
      // A new condition starts as "Leads = …", the usual second half of a stop rule.
      await form.locator('[data-condition-chip="1"]').getByRole('button', { name: 'Operator: exactly' }).waitFor();
      await form.getByRole('textbox', { name: 'Leads value' }).fill('0.5');
      assert.equal(await form.locator('[data-condition-chip="1"] [data-invalid]').getAttribute('title'), 'Leads is a whole number');
      await form.getByRole('textbox', { name: 'Leads value' }).fill('0');
      await form.getByRole('button', { name: 'Window: Today' }).click();
      await page.getByTestId('rule-window-lifetime').click();

      // The name it gets, and the sentence.
      assert.equal(await form.getByRole('textbox', { name: 'Rule name' }).getAttribute('placeholder'), 'Spend ≥ 4 & Leads = 0 → Turn off');
      assert.equal(
        await text(summary(form)),
        'Checks each ad set every 5 min and turns it off when spend ≥ USD 4 and leads = 0 (lifetime). '
        + 'Acts on the same ad set at most once a day. Runs nowhere until you pick where.',
      );

      // Run on: search, the whole account with what it would check, then campaigns.
      await form.getByRole('button', { name: 'Run on: nowhere yet' }).click();
      const runOn = form.getByRole('dialog', { name: 'Run on' });
      await runOn.getByRole('textbox', { name: 'Search ad accounts…' }).fill('lead');
      assert.deepEqual(await runOn.getByRole('option').allInnerTexts(), ['Leads account']);
      await runOn.getByRole('option', { name: /Leads account/ }).click();
      await runOn.getByText('Whole account · Checks 3 ad sets · 1 match now').waitFor();
      await summary(form).getByText(/Runs on Leads account\. Right now 1 of 3 ad sets match on the whole account\./).waitFor();
      await runOn.getByRole('button', { name: 'Choose campaigns in Leads account' }).click();
      await runOn.getByRole('option', { name: 'Retargeting' }).click();
      await runOn.getByText('1 campaign', { exact: true }).waitFor();
      assert.match(await text(summary(form)), /Runs on 1 campaign in Leads account\.$/);
      await page.screenshot({ path: `${output}/run-on-1440.png` });
      await runOn.getByRole('option', { name: 'Retargeting' }).click();
      await runOn.getByText(/^Whole account/).waitFor();
      await page.keyboard.press('Escape');
      await runOn.waitFor({ state: 'detached' });
      await form.waitFor();

      // The server's own check shows before the click.
      await form.getByRole('textbox', { name: 'Spend value' }).fill('999');
      await form.getByRole('alert').filter({ hasText: 'contradicts "First rule"' }).waitFor();
      assert.equal(await create.isDisabled(), true);
      await form.getByRole('textbox', { name: 'Spend value' }).fill('4');
      await form.getByRole('alert').waitFor({ state: 'detached' });
      await page.screenshot({ path: `${output}/new-rule-1440.png` });

      // Ctrl/Cmd+Enter creates it where it runs, in one write.
      await form.getByRole('textbox', { name: 'Rule name' }).focus();
      await page.keyboard.press('Control+Enter');
      await waitForWrites(1);
      assert.deepEqual([writes[0].verb, writes[0].path], ['POST', '/api/presets']);
      assert.equal(writes[0].body.name, 'Spend ≥ 4 & Leads = 0 → Turn off');
      assert.deepEqual(writes[0].body.attachments, [{ account_id: 'act_100', scope: { level: 'account', ids: [] } }]);
      assert.deepEqual(writes[0].body.conditions.map((condition) => [condition.metric, condition.operator, condition.value, condition.time_window]),
        [['spend', 'gte', 4, 'lifetime'], ['leads', 'eq', 0, 'lifetime']]);
      assert.ok(checks.length > 0, 'the draft was checked before saving');
      await form.waitFor({ state: 'detached' });

      // Escape keeps an unsaved rule; the next open brings it back; Discard clears it.
      await page.getByRole('button', { name: 'New rule' }).click();
      await form.waitFor();
      assert.equal(await form.getByRole('textbox', { name: 'Rule name' }).inputValue(), '', 'a created rule leaves no draft');
      await form.getByRole('textbox', { name: 'Rule name' }).fill('Half done');
      await page.keyboard.press('Escape');
      await form.waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'New rule' }).click();
      await form.waitFor();
      assert.equal(await form.getByRole('textbox', { name: 'Rule name' }).inputValue(), 'Half done');
      await form.getByText('· Draft').waitFor();
      await form.getByRole('button', { name: 'Discard draft' }).click();
      assert.equal(await form.getByRole('textbox', { name: 'Rule name' }).inputValue(), '');
      await page.keyboard.press('Escape');
      await form.waitFor({ state: 'detached' });

      // Editing: where it runs is sent only when it changed.
      const openEdit = async () => {
        await page.locator('[data-row-id="7"]').hover();
        await page.getByRole('button', { name: 'Actions for First rule' }).click();
        await page.getByRole('menuitem', { name: 'Edit rule' }).click();
        const edit = page.getByRole('dialog', { name: 'Edit rule' });
        await edit.waitFor();
        return edit;
      };
      let edit = await openEdit();
      assert.match(await text(summary(edit)), /Runs on Leads account\./);
      await edit.getByRole('textbox', { name: 'Rule name' }).fill('First rule v2');
      await edit.getByRole('button', { name: 'Save changes' }).click();
      await waitForWrites(2);
      assert.deepEqual([writes[1].verb, writes[1].path], ['PUT', '/api/presets/7']);
      assert.equal('attachments' in writes[1].body, false, 'where it runs did not change');
      await edit.waitFor({ state: 'detached' });
      await page.locator('[data-row-id="7"]').getByText('First rule v2').waitFor();
      edit = await openEdit();
      await edit.getByRole('button', { name: 'Run on: Leads account' }).click();
      const editRunOn = edit.getByRole('dialog', { name: 'Run on' });
      await editRunOn.getByRole('option', { name: /Leads account/ }).click();
      await editRunOn.getByRole('option', { name: /Sweeps account/ }).click();
      await page.keyboard.press('Escape');
      await edit.getByRole('button', { name: 'Save changes' }).click();
      await waitForWrites(3);
      assert.deepEqual(writes[2].body.attachments, [{ account_id: 'act_200', scope: { level: 'account', ids: [] } }]);
      await edit.waitFor({ state: 'detached' });

      // From Ads Manager: the rule picker's "New rule…" runs it on the selection.
      await page.goto(`${origin}/alpha/ads-manager/campaigns`);
      await page.locator('[data-row-id="801"] [data-rule-cell]').click();
      const picker = page.getByRole('dialog', { name: 'Rules for this campaign' });
      await picker.waitFor();
      await picker.getByRole('button', { name: 'New rule…' }).click();
      const fromAdsManager = page.getByRole('dialog', { name: 'New rule' });
      await fromAdsManager.waitFor();
      assert.match(await text(summary(fromAdsManager)), /Runs on 1 campaign in Leads account\.$/);
      await fromAdsManager.getByRole('textbox', { name: 'Spend value' }).fill('12');
      await fromAdsManager.getByRole('button', { name: 'Create rule' }).click();
      await waitForWrites(4);
      assert.deepEqual(writes[3].body.attachments, [{ account_id: 'act_100', scope: { level: 'campaign', ids: ['801'] } }]);
      await fromAdsManager.waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      console.log('Rule window at 1440px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // 390px phone: the window fills the screen; the chips wrap; Create rule stays in reach.
  {
    const { context, page, errors, writes, waitForWrites } = await openPage(390, true);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await page.getByRole('button', { name: 'New rule' }).tap();
      const form = page.getByRole('dialog', { name: 'New rule' });
      await form.waitFor();
      const box = await form.boundingBox();
      assert.ok(box.x <= 0.5 && box.width >= 389.5 && box.height >= 843.5, `the window fills the phone: ${JSON.stringify(box)}`);
      await form.getByRole('textbox', { name: 'Spend value' }).fill('5');
      await form.getByRole('button', { name: 'Condition' }).tap();
      await form.getByRole('textbox', { name: 'Leads value' }).fill('0');
      const create = form.getByRole('button', { name: 'Create rule' });
      const button = await create.boundingBox();
      assert.ok(button.y + button.height <= 844 && button.height >= 40, `Create rule is in reach and finger-sized: ${JSON.stringify(button)}`);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `the page scrolls sideways: ${scrollWidth}`);
      await page.screenshot({ path: `${output}/new-rule-390.png` });
      await create.tap();
      await waitForWrites(1);
      assert.equal(writes[0].body.name, 'Spend ≥ 5 & Leads = 0 → Turn off');
      assert.deepEqual(errors, []);
      console.log('Rule window at 390px passed');
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
