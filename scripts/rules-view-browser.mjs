// Exercise the real App with a synthetic API: the Rules page's filters,
// properties, grouping and board, as Linear's (#390).
// - Filters by what a rule does (Action), what it acts on (Applies to), the
//   metrics in its conditions, the ad account it runs on, and "Never" acted.
// - Group by Ad account and Action; a rule on two accounts shows under both.
// - Display properties add ID, Applies to, Check, Repeat and Created columns;
//   Last check and Created order the list.
// - The board's columns are the grouping (Columns = Grouping): by status a
//   card dragged to Paused pauses the rule; by label a card dragged to a
//   label trades the label it came from for that one.
// - Rows band the board and the same setting is the list's Sub-grouping
//   (#471); with rows on, the column a card lands in still decides.
// - The view survives a reload; filters ride in the address.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-rules-view';
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
const account = (id, name) => ({
  id: Number(id.slice(4)), account_id: id, name, custom_name: '', note: '', connection_type: 'system_user',
  timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
  rules_enabled: true, is_active: true, primary_result: '', target_cost_per_result: null, active_rules: [],
});
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const preset = (id, name, fields = {}) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 4, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false, review_reason: '',
  created_at: daysAgo(30), last_run_at: '', last_checked_at: '', attached_account_ids: [], attached_scopes: {}, label_ids: [],
  ...fields,
});
const labels = [{ id: 1, name: 'NL launch', color: '#f2994a', description: '', rule_count: 1, last_applied_at: '', created_at: daysAgo(40) }];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  const writes = [];
  const views = {};
  const presets = [
    preset(7, '$4 and no lead', {
      label_ids: [1], conditions: [
        { metric: 'spend', operator: 'gte', value: 4, time_window: 'lifetime' },
        { metric: 'leads', operator: 'eq', value: 0, time_window: 'lifetime' },
      ],
      attached_account_ids: ['act_100'], attached_scopes: { act_100: { level: 'account', ids: [] } },
      last_run_at: daysAgo(0.1), last_checked_at: daysAgo(0.01), created_at: daysAgo(40),
    }),
    preset(8, 'Budget up on cheap leads', {
      action: 'increase_budget', budget_change_percent: 20, budget_max_daily: 300,
      conditions: [{ metric: 'cpl', operator: 'lte', value: 2, time_window: 'last_3d' }],
      attached_account_ids: ['act_100', 'act_200'],
      attached_scopes: { act_100: { level: 'campaign', ids: ['801'] }, act_200: { level: 'account', ids: [] } },
      last_checked_at: daysAgo(2), created_at: daysAgo(2),
    }),
    preset(9, 'Tell me about campaigns', { action: 'notify_only', level: 'campaign', created_at: daysAgo(10) }),
  ];
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
      const body = request.postData() ? request.postDataJSON() : null;
      writes.push({ verb, path, body });
      const one = path.match(/^\/api\/presets\/(\d+)$/);
      const labelled = path.match(/^\/api\/presets\/(\d+)\/labels$/);
      const target = presets.find((item) => item.id === Number((one ?? labelled)?.[1]));
      if (one && verb === 'PUT' && target) {
        Object.assign(target, body);
        return route.fulfill({ json: target });
      }
      if (labelled && verb === 'PUT' && target) {
        target.label_ids = body.label_ids;
        return route.fulfill({ json: target });
      }
      errors.push(`Unexpected write: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/accounts') return route.fulfill({ json: [account('act_100', 'Leads account'), account('act_200', 'Sweeps account')] });
    if (path === '/api/presets') return route.fulfill({ json: presets });
    if (path === '/api/rule-labels') return route.fulfill({ json: labels });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    return route.fulfill({ json: [] });
  });

  const rowIds = () => page.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.dataset.rowId));
  const groupTitles = () => page.locator('.sticky span.truncate.text-\\[13px\\]').allTextContents();
  const headers = async () => (await page.locator('[role="columnheader"]').allTextContents()).map((text) => text.trim()).filter(Boolean);
  const popover = () => page.locator('.buyerly-display-options-popover');
  const displayButton = () => page.locator('main header').getByRole('button', { name: 'Display options' });
  const select = async (row, option) => {
    // By the exact label: "Grouping" is also part of "Sub-grouping".
    await popover().locator('.buyerly-display-row', { has: page.getByText(row, { exact: true }) }).getByRole('combobox').click();
    await page.locator('.buyerly-display-select-menu').getByRole('option', { name: option, exact: true }).click();
  };
  const property = (label) => popover().locator('.buyerly-display-property', { hasText: new RegExp(`^${label}$`) });
  const settle = () => page.waitForTimeout(400);
  const bar = page.locator('[aria-label="Active filters"]');

  try {
    // A link's filter: what a rule does.
    const link = encodeURIComponent(JSON.stringify([{ fieldId: 'action', operator: 'is', values: ['increase_budget'] }]));
    await page.goto(`${origin}/alpha/rules?filter=${link}`);
    await page.locator('[data-row-id="8"]').waitFor();
    assert.deepEqual([...new Set(await rowIds())], ['8'], 'Action is Budget +');
    assert.match(await bar.innerText(), /Action\s*is\s*Budget \+/);
    await bar.getByRole('button', { name: 'Clear all filters' }).click();
    await page.locator('[data-row-id="9"]').waitFor();

    // The filter menu: a metric in the conditions.
    await page.keyboard.press('f');
    const menu = page.getByRole('dialog', { name: 'Add filter' });
    await menu.getByRole('option', { name: 'Metric' }).click();
    await page.getByRole('listbox', { name: 'Metric values' }).getByRole('option', { name: /^Leads/ }).click();
    await page.keyboard.press('Escape');
    await page.locator('[data-row-id="8"]').waitFor({ state: 'detached' });
    assert.deepEqual([...new Set(await rowIds())], ['7'], 'Metric includes Leads');
    await bar.getByRole('button', { name: 'Clear all filters' }).click();
    // Last action is Never.
    await page.keyboard.press('f');
    await menu.getByRole('option', { name: 'Dates' }).hover();
    await page.getByRole('listbox', { name: 'Date properties' }).getByRole('option', { name: 'Last action' }).hover();
    await page.getByRole('dialog', { name: 'Last action values' }).getByRole('option', { name: /^Never/ }).click();
    await page.locator('[data-row-id="7"]').waitFor({ state: 'detached' });
    assert.deepEqual([...new Set(await rowIds())].sort(), ['8', '9']);
    assert.match(await bar.innerText(), /Last action\s*is\s*Never/);
    await bar.getByRole('button', { name: 'Clear all filters' }).click();
    await page.locator('[data-row-id="7"]').waitFor();

    // Group by ad account: the rule on two accounts shows under both.
    await displayButton().click();
    await popover().waitFor();
    await select('Grouping', 'Ad account');
    assert.deepEqual(await groupTitles(), ['Leads account', 'Sweeps account', 'Not attached']);
    assert.deepEqual(await rowIds(), ['7', '8', '8', '9']);
    await page.screenshot({ path: `${output}/grouped-by-account-1440.png` });
    await select('Grouping', 'Action');
    assert.deepEqual(await groupTitles(), ['Turn off', 'Notify', 'Budget +']);

    // More properties; Last check orders the list.
    await property('ID').click();
    await property('Applies to').click();
    await property('Created').click();
    await select('Grouping', 'No grouping');
    await select('Ordering', 'Last check');
    assert.deepEqual(await rowIds(), ['9', '8', '7'], 'oldest check first, never checked counts as oldest');
    await popover().getByRole('button', { name: 'Direction' }).click();
    await page.keyboard.press('Escape');
    assert.deepEqual(await headers(), ['Name', 'ID', 'Labels', 'Condition', 'Action', 'Applies to', 'Scope', 'Last check', 'Last action', 'Created']);
    assert.deepEqual(await rowIds(), ['7', '8', '9'], 'last checked first, never checked last');
    assert.match(await page.locator('[data-row-id="9"]').innerText(), /RUL-09[\s\S]*Campaign/);
    await page.screenshot({ path: `${output}/properties-1440.png` });

    // The board by status: drag a card to Paused.
    await displayButton().click();
    await popover().getByRole('tab', { name: 'Board' }).click();
    // On the board Grouping reads Columns, as in Linear.
    await popover().getByText('Columns', { exact: true }).waitFor();
    await select('Columns', 'Status');
    await page.keyboard.press('Escape');
    const column = (name) => page.locator(`[data-board-column][aria-label="${name}"]`);
    await column('Active rules').waitFor();
    assert.deepEqual(await page.locator('[data-board-column]').evaluateAll((columns) => columns.map((element) => element.dataset.boardColumn)),
      ['status-active'], 'Columns = Grouping');
    // Empty columns wait in Linear's Hidden columns, and still take a card.
    assert.deepEqual(await page.locator('[data-board-hidden-column]').evaluateAll((rows) => rows.map((element) => element.dataset.boardHiddenColumn)),
      ['status-paused', 'status-needs_review']);
    const drag = async (cardId, columnId) => {
      const card = page.locator(`[data-board-column] [data-row-id="${cardId}"]`).first();
      const from = await card.boundingBox();
      const target = page.locator(`[data-board-column="${columnId}"], [data-board-hidden-column="${columnId}"]`).first();
      const to = await target.boundingBox();
      const toY = await target.evaluate((element) => element.hasAttribute('data-board-hidden-column')) ? to.y + to.height / 2 : to.y + 120;
      await page.mouse.move(from.x + 40, from.y + 20);
      await page.mouse.down();
      await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 });
      await page.mouse.move(to.x + to.width / 2, toY, { steps: 12 });
      await page.mouse.up();
    };
    await drag('7', 'status-paused');
    for (let tries = 0; writes.length < 1 && tries < 100; tries += 1) await page.waitForTimeout(50);
    assert.deepEqual([writes[0].verb, writes[0].path, writes[0].body.enabled], ['PUT', '/api/presets/7', false], 'dropped on Paused pauses it');
    await column('Paused rules').locator('[data-row-id="7"]').waitFor();
    await page.screenshot({ path: `${output}/board-status-1440.png` });

    // By label: a card from "No label" to NL launch gets the label.
    await displayButton().click();
    await select('Columns', 'Label');
    await page.keyboard.press('Escape');
    await column('NL launch').waitFor();
    await drag('9', '1');
    for (let tries = 0; writes.length < 2 && tries < 100; tries += 1) await page.waitForTimeout(50);
    assert.deepEqual([writes[1].verb, writes[1].path, writes[1].body.label_ids], ['PUT', '/api/presets/9/labels', [1]]);
    await column('NL launch').locator('[data-row-id="9"]').waitFor();

    // The view survives a reload.
    await settle();
    assert.equal(views.rules.layout, 'board');
    assert.equal(views.rules.grouping, undefined, 'Label is the default grouping, so only the board is saved');
    await page.reload();
    await column('NL launch').waitFor();
    await displayButton().click();
    await select('Columns', 'Action');
    await page.keyboard.press('Escape');
    await column('Notify').waitFor();
    assert.equal(await page.locator('[data-board-drag]').count(), 0, 'Action columns take no drops');

    // Rows (#471): columns by Status banded by Label; what the columns and rows show is greyed out.
    await displayButton().click();
    await select('Columns', 'Status');
    await select('Rows', 'Label');
    await popover().getByText('Show empty rows', { exact: true }).waitFor();
    assert.equal(await property('Status').isDisabled(), true, 'the columns show the status');
    assert.equal(await property('Labels').isDisabled(), true, 'the rows show the labels');
    await page.keyboard.press('Escape');
    // With rows each cell is named "<column>, <row>".
    await page.locator('[data-board-column="status-paused"]').first().waitFor();
    assert.deepEqual(await page.locator('.buyerly-board-lane .buyerly-board-column-name').allTextContents(), ['NL launch', 'No label']);
    await page.screenshot({ path: `${output}/board-rows-1440.png` });
    // With rows on, the column decides: No label's card dropped on Paused is paused and keeps its labels.
    const card = await page.locator('[data-board-column="status-active"] [data-row-id="8"]').boundingBox();
    const paused = await page.locator('[data-board-column="status-paused"]').first().boundingBox();
    await page.mouse.move(card.x + 40, card.y + 20);
    await page.mouse.down();
    await page.mouse.move(card.x + 60, card.y + 30, { steps: 4 });
    await page.mouse.move(paused.x + paused.width / 2, paused.y + paused.height / 2, { steps: 12 });
    await page.mouse.up();
    for (let tries = 0; writes.length < 3 && tries < 100; tries += 1) await page.waitForTimeout(50);
    assert.deepEqual([writes[2].verb, writes[2].path, writes[2].body.enabled], ['PUT', '/api/presets/8', false]);
    await page.locator('[data-board-column="status-paused"] [data-row-id="8"]').waitFor();
    await settle();
    assert.equal(writes.length, 3, 'the band it crossed changes nothing');

    // Ctrl/Cmd+B: the list keeps the setting as Sub-grouping, Label inside each Status group.
    await page.keyboard.press('ControlOrMeta+b');
    await page.locator('[data-row-id="7"]').first().waitFor();
    assert.deepEqual(await groupTitles(), ['Active rules', 'Paused rules']);
    assert.deepEqual(await page.locator('.buyerly-data-subgroup-header span.truncate').allTextContents(), ['NL launch', 'NL launch', 'No label']);
    await page.locator('.buyerly-data-subgroup-header').last().getByRole('button', { name: 'Collapse group' }).click();
    await page.locator('[data-row-id="8"]').waitFor({ state: 'detached' });
    await page.screenshot({ path: `${output}/list-sub-groups-1440.png` });
    await settle();
    assert.equal(views.rules.subGrouping, 'labels');
    assert.deepEqual(errors, []);
    console.log('Rules view at 1440px passed');
  } catch (error) {
    console.error(error);
    await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true }).catch(() => {});
    console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
