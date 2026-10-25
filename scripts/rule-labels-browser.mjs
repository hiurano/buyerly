// Exercise the real App with a synthetic API: rule groups became labels, as
// Linear's labels (#383).
// - Grouping by Label: a rule with two labels shows in both groups, a rule
//   without one under "No label", last; the header is tinted with the color.
// - The row's labels open the picker; typing a new name offers
//   "Create new label: …", which creates it and puts it on the rule at once.
// - L on a selection opens the same picker for every selected rule.
// - Filter Labels "include all of" narrows to rules carrying both.
// - Settings → Rules → Labels lists them with their rule counts; New label
//   adds a row on top, Enter saves.
// - At 390px the picker and the settings table stay on screen.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-rule-labels';
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
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const preset = (id, name, labelIds) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false, created_at: daysAgo(40),
  review_reason: '', last_run_at: '', last_checked_at: '', attached_account_ids: [], attached_scopes: {}, label_ids: labelIds,
});

const freshState = () => ({
  labels: [
    { id: 1, name: 'Launch', color: '#4cb782', description: 'First days of a campaign', created_at: daysAgo(30) },
    { id: 2, name: 'Scaling', color: '#bb87fc', description: '', created_at: daysAgo(20) },
  ],
  presets: [
    preset(7, 'Stop ad sets without leads', [1]),
    preset(8, 'Budget up on cheap leads', [1, 2]),
    preset(9, 'Tell me about expensive leads', []),
  ],
  nextLabelId: 3,
  writes: [],
});

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
    const state = freshState();
    page.on('pageerror', (error) => errors.push(error.message));
    const labelOut = (label) => {
      const items = state.presets.filter((item) => item.label_ids.includes(label.id));
      return { ...label, rule_count: items.length, last_applied_at: items.length ? daysAgo(1) : '' };
    };
    const sorted = () => [...state.labels].sort((a, b) => a.name.localeCompare(b.name));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      if (verb !== 'GET') state.writes.push(`${verb} ${path}`);
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
      if (path.startsWith('/api/view-settings/')) return route.fulfill({ json: { view_key: 'rules', settings: {} } });
      if (path === '/api/presets' && verb === 'GET') return route.fulfill({ json: state.presets });
      if (path === '/api/rule-labels' && verb === 'GET') return route.fulfill({ json: sorted().map(labelOut) });
      if (path === '/api/rule-labels' && verb === 'POST') {
        const body = request.postDataJSON();
        const label = { id: state.nextLabelId++, name: body.name, color: body.color ?? '#95a2b3', description: body.description ?? '', created_at: new Date().toISOString() };
        state.labels.push(label);
        return route.fulfill({ json: labelOut(label) });
      }
      const presetLabels = path.match(/^\/api\/presets\/(\d+)\/labels$/);
      if (presetLabels && verb === 'PUT') {
        const item = state.presets.find((entry) => entry.id === Number(presetLabels[1]));
        item.label_ids = [...new Set(request.postDataJSON().label_ids)];
        return route.fulfill({ json: item });
      }
      if (path === '/api/presets/labels' && verb === 'PATCH') {
        const body = request.postDataJSON();
        for (const item of state.presets.filter((entry) => body.preset_ids.includes(entry.id))) {
          item.label_ids = [
            ...item.label_ids.filter((id) => !body.remove_label_ids.includes(id)),
            ...body.add_label_ids.filter((id) => !item.label_ids.includes(id)),
          ];
        }
        return route.fulfill({ json: { updated_count: body.preset_ids.length } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      if (verb !== 'GET') {
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      return route.fulfill({ json: [] });
    });
    return { context, page, errors, state };
  };

  const groupTitles = (page) => page.locator('main .buyerly-data-group-header:not(.buyerly-data-subgroup-header) .buyerly-data-group-title').allTextContents();
  const rowCount = (page, id) => page.locator(`[data-row-id="${id}"]`).count();
  const picker = (page) => page.locator('[data-rule-label-picker]');
  const assertInside = async (locator, where) => {
    const box = await locator.boundingBox();
    const width = await locator.page().evaluate(() => window.innerWidth);
    assert.ok(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${where}: ${JSON.stringify(box)} leaves the ${width}px screen`);
  };

  // 1440px
  {
    const { context, page, errors, state } = await openPage(1440);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').first().waitFor();

      // Grouped by Label by default: Launch, Scaling, then No label; rule 8 is in both of its groups.
      assert.deepEqual(await groupTitles(page), ['Launch', 'Scaling', 'No label']);
      assert.equal(await rowCount(page, '8'), 2, 'a rule with two labels shows in both groups');
      assert.equal(await rowCount(page, '9'), 1);
      await page.screenshot({ path: `${output}/rules-by-label-1440.png` });

      // The row's labels open the picker; a new name creates the label and puts it on.
      await page.locator('[data-rule-labels="9"]').click();
      await picker(page).waitFor();
      await picker(page).getByRole('textbox').fill('Tests');
      await picker(page).getByRole('option', { name: /Create new label/ }).waitFor();
      await page.screenshot({ path: `${output}/picker-create-1440.png` });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('[data-row-id="9"]').length === 1
        && [...document.querySelectorAll('main .buyerly-data-group-header:not(.buyerly-data-subgroup-header)')].some((header) => header.textContent?.includes('Tests')));
      assert.ok(state.writes.includes('POST /api/rule-labels'), 'the label was created');
      assert.ok(state.writes.includes('PUT /api/presets/9/labels'), 'and put on the rule in one write');
      assert.deepEqual(state.presets.find((item) => item.id === 9).label_ids, [3]);
      await page.keyboard.press('Escape');
      await picker(page).waitFor({ state: 'detached' });
      assert.deepEqual(await groupTitles(page), ['Launch', 'Scaling', 'Tests'], '"No label" left once empty');

      // L on a selection: one picker for both rules; Scaling goes on both.
      await page.locator('[data-row-id="7"]').first().hover();
      await page.keyboard.press('x');
      await page.locator('[data-row-id="9"]').first().hover();
      await page.keyboard.press('x');
      await page.mouse.move(5, 5);
      await page.keyboard.press('l');
      await picker(page).waitFor();
      await picker(page).getByRole('option', { name: 'Scaling' }).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-row-id="9"]').length === 2);
      assert.ok(state.writes.includes('PATCH /api/presets/labels'), 'several rules change in one write');
      assert.deepEqual(state.presets.find((item) => item.id === 7).label_ids, [1, 2]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      // Labels: include all of Launch and Scaling.
      const filter = [{ fieldId: 'label', operator: 'includes_all', values: ['1', '2'] }];
      await page.goto(`${origin}/alpha/rules?filter=${encodeURIComponent(JSON.stringify(filter))}`);
      await page.locator('[data-row-id="7"]').first().waitFor();
      const shown = await page.locator('[data-row-id]').evaluateAll((rows) => [...new Set(rows.map((row) => row.dataset.rowId))]);
      assert.deepEqual(shown.sort(), ['7', '8'], 'only rules carrying both labels');

      // Settings → Rules → Labels.
      await page.goto(`${origin}/alpha/settings/rule-labels`);
      await page.getByRole('heading', { name: 'Rule labels' }).waitFor();
      const table = page.getByRole('table', { name: 'Rule labels' });
      await table.getByRole('button', { name: 'Launch', exact: true }).waitFor();
      await page.getByRole('button', { name: 'New label' }).click();
      await page.getByRole('textbox', { name: 'Label name' }).fill('Night');
      await page.keyboard.press('Enter');
      await table.getByRole('button', { name: 'Night', exact: true }).waitFor();
      assert.equal(state.labels.find((label) => label.name === 'Night')?.description, '');
      await page.screenshot({ path: `${output}/settings-labels-1440.png` });
      assert.deepEqual(errors, []);
      console.log('Rule labels at 1440px passed');
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: `${output}/failure-1440.png`, fullPage: true }).catch(() => {});
      console.error(errors);
      throw error;
    } finally {
      await context.close();
    }
  }

  // 390px
  {
    const { context, page, errors } = await openPage(390, true);
    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="9"]').first().waitFor();
      await page.locator('[data-rule-labels="9"]').scrollIntoViewIfNeeded();
      await page.locator('[data-rule-labels="9"]').tap();
      await picker(page).waitFor();
      await assertInside(picker(page), 'Label picker');
      await page.screenshot({ path: `${output}/picker-390.png` });
      await page.goto(`${origin}/alpha/settings/rule-labels`);
      await page.getByRole('heading', { name: 'Rule labels' }).waitFor();
      await page.getByRole('table', { name: 'Rule labels' }).getByRole('button', { name: 'Launch', exact: true }).waitFor();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `the page scrolls sideways: ${scrollWidth}`);
      await page.screenshot({ path: `${output}/settings-labels-390.png` });
      assert.deepEqual(errors, []);
      console.log('Rule labels at 390px passed');
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
