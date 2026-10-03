// Exercise the real App with a synthetic API: Search workspace (#190) is Linear's
// command menu. It finds the workspace's campaigns, ad sets, ads, rules and ad
// accounts through GET /api/search (scoped by the address), says when it is
// searching, found nothing or failed, and opens each result on its own row. Esc
// closes it and gives focus back; `/` stays text in a field, and Ctrl/Cmd+K
// opens it from anywhere but leaves a row selection its own actions menu.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-command-menu';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  username: 'finder', full_name: 'Fay Finder', first_name: 'Fay', last_name: 'Finder',
  email: 'fay@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = (accountId, name) => ({
  id: Number(accountId.slice(4)), account_id: accountId, name, custom_name: '', note: '', connection_type: 'system_user',
  timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)', rules_enabled: false,
  is_active: true, primary_result: '', target_cost_per_result: null, active_rules: [],
});
const accounts = [account('act_1001', 'Leads account'), account('act_1002', 'Euro account')];
const metrics = {
  spend: 0, impressions: 0, reach: 0, cpm: 0, clicks: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0,
  leads: 0, registrations: 0, purchases: 0, cost_per_lead: null, cost_per_registration: null, cost_per_purchase: null,
  cost_per_landing_page_view: null, cpc: 0, ctr: 0, cpc_link: null, ctr_link: 0, ctr_outbound: 0,
};
const entity = (level, id, name, parent, accountId, status = 'ACTIVE') => ({
  ...metrics, entity_id: id, entity_name: name, entity_level: level, parent_entity_id: parent, account_id: accountId,
  currency: 'USD', status, effective_status: status, daily_budget: level === 'ad' ? 0 : 20, data_as_of: '2026-10-03T08:00:00Z',
});
// Enough campaigns that the one search opens starts far below the fold.
const inventory = {
  act_1001: {
    campaign: Array.from({ length: 60 }, (_, index) => entity(
      'campaign', String(120000 + index), index === 45 ? 'Test Campaign' : `Campaign ${String(index + 1).padStart(2, '0')}`,
      'act_1001', 'act_1001',
    )),
    adset: [entity('adset', '230001', 'Test audience', '120045', 'act_1001')],
    ad: [entity('ad', '340001', 'Test creative', '230001', 'act_1001', 'ADSET_PAUSED')],
  },
  act_1002: {
    campaign: [
      entity('campaign', '120101', 'Spring sale', 'act_1002', 'act_1002', 'PAUSED'),
      entity('campaign', '120102', 'Test campaign EU', 'act_1002', 'act_1002'),
    ],
    adset: [],
    ad: [],
  },
};
const preset = (id, name, enabled) => ({
  id, name, action: 'turn_off', level: 'adset', enabled,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});
const presets = [preset(7, 'Test stop without leads', false), preset(8, 'Budget up on cheap leads', true)];

/** GET /api/search as the server answers it: kinds in order, the name itself first. */
function searchResponse(query, limit) {
  const needle = query.toLowerCase();
  const rank = (name) => (name.toLowerCase() === needle ? 0 : name.toLowerCase().startsWith(needle) ? 1 : 2);
  const byRank = (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  const names = Object.fromEntries(accounts.map((item) => [item.account_id, item.name]));
  const parents = new Map(Object.values(inventory).flatMap((levels) => [...levels.campaign, ...levels.adset])
    .map((item) => [item.entity_id, item.entity_name]));
  const results = [];
  const truncated = [];
  const take = (kind, found) => {
    if (found.length > limit) truncated.push(kind);
    results.push(...found.sort(byRank).slice(0, limit));
  };
  for (const kind of ['campaign', 'adset', 'ad']) {
    take(kind, Object.values(inventory).flatMap((levels) => levels[kind])
      .filter((item) => item.entity_name.toLowerCase().includes(needle) || item.entity_id === query)
      .map((item) => ({
        kind, id: item.entity_id, name: item.entity_name, account_id: item.account_id,
        account_name: names[item.account_id], parent_name: kind === 'campaign' ? '' : parents.get(item.parent_entity_id) ?? '',
        status: item.effective_status,
      })));
  }
  take('rule', presets.filter((item) => item.name.toLowerCase().includes(needle)).map((item) => ({
    kind: 'rule', id: String(item.id), name: item.name, account_id: '', account_name: '', parent_name: '',
    status: item.enabled ? 'active' : 'paused',
  })));
  take('account', accounts.filter((item) => item.name.toLowerCase().includes(needle) || item.account_id === query)
    .map((item) => ({
      kind: 'account', id: item.account_id, name: item.name, account_id: item.account_id, account_name: '', parent_name: '', status: '',
    })));
  return { query, limit, results, truncated };
}

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [1440, 1024, 768, 390]) {
    const small = width <= 880;
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const searches = [];
    const hierarchyReads = [];
    let holdSearch = null;
    let failNextSearch = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      const scope = request.headers()['x-workspace-slug'];
      if (verb !== 'GET') {
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/search') {
        const query = url.searchParams.get('q');
        searches.push({ query, scope, limit: url.searchParams.get('limit') });
        if (holdSearch) await holdSearch;
        // The page may have moved on and cancelled the request meanwhile.
        if (failNextSearch) {
          failNextSearch = false;
          return route.fulfill({ status: 503, json: { detail: 'Search is unavailable right now.' } }).catch(() => {});
        }
        return route.fulfill({ json: searchResponse(query, Number(url.searchParams.get('limit'))) }).catch(() => {});
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: accounts });
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
        hierarchyReads.push({ parent, level, scope });
        const items = inventory[parent]?.[level] ?? [];
        return route.fulfill({ json: { parent_id: parent, level, period: 'today', source: 'analytics_fact_store', data_as_of: null, total: items.length, items } });
      }
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      if (path === '/api/inbox') {
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0, hidden_by_filters: 0 } });
      }
      if (path === '/api/inbox/facets') return route.fulfill({ json: { type: [], status: [], account: [], from: [] } });
      return route.fulfill({ json: [] });
    });

    const dialog = page.getByRole('dialog', { name: 'Search workspace' });
    const field = dialog.getByRole('combobox');
    const note = dialog.getByRole('status');
    const options = () => dialog.getByRole('option');
    const option = (name) => dialog.getByRole('option', { name });
    const optionTexts = async () => (await options().allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    const headings = async () => (await dialog.locator('[cmdk-group-heading]').allInnerTexts()).map((text) => text.trim());
    const selected = async () => (await dialog.locator('[cmdk-item][aria-selected="true"]').innerText()).replace(/\s+/g, ' ').trim();
    const focused = () => page.evaluate(() => {
      const element = document.activeElement;
      return element?.getAttribute('aria-label') || element?.getAttribute('data-row-id') || element?.id || element?.tagName;
    });
    const waitForFocus = (expected) => page.waitForFunction((value) => {
      const element = document.activeElement;
      return [element?.getAttribute('aria-label'), element?.getAttribute('data-row-id'), element?.id].includes(value);
    }, expected);
    const assertNoOverflow = async (where) => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${where} at ${width}px: document overflow`,
    );
    const pathAndQuery = () => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}`;
    };
    const openFromSidebar = async () => {
      // Below 880px the sidebar, and its Search button, sit in the drawer opened by Menu.
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      if (small && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      await page.getByRole('button', { name: 'Search workspace' }).click();
      await field.waitFor();
    };
    const openWithSlash = async () => {
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await page.keyboard.press('/');
      await field.waitFor();
      assert.equal(await field.inputValue(), '', 'the slash that opened the menu is not typed into it');
    };
    const closed = () => page.getByRole('dialog', { name: /^(Search workspace|Command menu)$/ }).waitFor({ state: 'detached' });
    // As in Linear: Ctrl/Cmd+K is a separate menu of commands that searches nothing.
    const commands = page.getByRole('dialog', { name: 'Command menu' });
    const commandField = commands.getByRole('combobox');
    const commandTexts = async () => (await commands.getByRole('option').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    const accountPicker = (name) => page.getByRole('button', { name: 'Select ad account' }).filter({ hasText: name });

    try {
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();

      // 1. The sidebar button opens search: no commands, just what it searches.
      await openFromSidebar();
      assert.equal(await field.getAttribute('placeholder'), 'Search…');
      assert.equal(await options().count(), 0);
      assert.equal(await note.innerText(), 'Search campaigns, ad sets, ads, rules and ad accounts in Alpha.');
      await assertNoOverflow('empty menu');
      await page.screenshot({ path: `${output}/empty-${width}.png` });

      // An existing campaign is found by name, after a stated wait, in this workspace only.
      let release;
      holdSearch = new Promise((resolve) => { release = resolve; });
      await field.fill('Test Campaign');
      await dialog.getByText('Searching Alpha…', { exact: true }).waitFor();
      assert.equal(await dialog.getByRole('listbox').getAttribute('aria-busy'), 'true');
      release();
      holdSearch = null;
      await option(/Test Campaign/).first().waitFor();
      assert.deepEqual(await optionTexts(), ['Test Campaign Leads account Active', 'Test campaign EU Euro account Active']);
      assert.deepEqual(await headings(), ['Campaigns']);
      assert.equal(await note.innerText(), '2 results in Alpha.');
      assert.deepEqual(searches.at(-1), { query: 'Test Campaign', scope: 'alpha', limit: '20' });
      await assertNoOverflow('results');
      await page.screenshot({ path: `${output}/results-${width}.png` });

      // 2. Esc closes it and gives focus back to the button that opened it.
      await page.keyboard.press('Escape');
      await closed();
      await waitForFocus('Search workspace');

      // 3. `/` typed in a field is text: an input, a textarea, rich text and the Inbox filter.
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();
      await page.evaluate(() => {
        const host = document.createElement('div');
        host.innerHTML = '<input id="probe-input"><textarea id="probe-textarea"></textarea><div id="probe-rich" contenteditable="true"></div>';
        document.body.append(host);
      });
      for (const id of ['probe-input', 'probe-textarea', 'probe-rich']) {
        await page.locator(`#${id}`).focus();
        await page.keyboard.type('a/b');
        const value = await page.locator(`#${id}`).evaluate((element) => ('value' in element ? element.value : element.textContent));
        assert.equal(value, 'a/b', `${id} keeps the slash`);
        assert.equal(await dialog.count(), 0, `${id}: / did not open the menu`);
      }
      await page.locator('#probe-rich').evaluate((element) => element.blur());
      await page.keyboard.press('f');
      const filterField = page.getByRole('searchbox', { name: 'Add Filter…' });
      await filterField.waitFor();
      // The menu focuses its field a moment after it opens.
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Add Filter…');
      await page.keyboard.type('a/b');
      assert.equal(await filterField.inputValue(), 'a/b');
      assert.equal(await dialog.count(), 0, 'the Inbox filter keeps the slash');
      await page.keyboard.press('Escape');
      await filterField.waitFor({ state: 'detached' });

      // Outside a field `/` opens the menu.
      await openWithSlash();
      await page.keyboard.press('Escape');
      await closed();

      // 4. Ctrl/Cmd+K opens it from a text field too; pressed again it closes and focus returns.
      await page.locator('#probe-textarea').focus();
      await page.keyboard.press('Control+K');
      await commandField.waitFor();
      assert.equal(await commandField.getAttribute('placeholder'), 'Type a command…');
      assert.deepEqual(await commandTexts(), ['Go to Inbox', 'Go to Ads Manager', 'Go to Rules', 'Go to Settings', 'Create rule…']);
      await page.waitForFunction(() => document.activeElement?.hasAttribute('cmdk-input'));
      await page.keyboard.press('Control+K');
      await closed();
      await waitForFocus('probe-textarea');
      assert.equal(await page.locator('#probe-textarea').inputValue(), 'a/b', 'Ctrl+K typed nothing');
      await page.keyboard.press('Meta+K');
      await commandField.waitFor();
      await page.keyboard.press('Escape');
      await closed();
      await waitForFocus('probe-textarea');
      await page.evaluate(() => document.getElementById('probe-input')?.parentElement?.remove());

      // 5. Nothing found, a failure and its retry are told apart.
      await openWithSlash();
      await field.fill('zzz');
      await dialog.getByText('No campaigns, ad sets, ads, rules or ad accounts in Alpha match “zzz”.', { exact: true }).waitFor();
      assert.equal(await options().count(), 0);
      failNextSearch = true;
      await field.fill('Spring');
      await dialog.getByText("Couldn't search Alpha. Search is unavailable right now.", { exact: true }).waitFor();
      assert.deepEqual(await optionTexts(), ['Retry search']);
      await page.keyboard.press('Enter');
      await option(/Spring sale/).waitFor();
      assert.deepEqual(await optionTexts(), ['Spring sale Euro account Paused']);
      assert.equal(await dialog.getByText('Retry search').count(), 0);

      // Search shows only results, more of them than before, and no commands.
      await field.fill('campaign');
      await option(/^Campaign 20/).waitFor();
      assert.deepEqual(await headings(), ['Campaigns']);
      assert.equal(await dialog.getByRole('option', { name: /^Campaign \d+/ }).count(), 20);

      // 6. Arrows walk the results; Enter opens a campaign on its row in Ads Manager.
      await field.fill('test');
      await option(/Test creative/).waitFor();
      assert.deepEqual(await headings(), ['Campaigns', 'Ad sets', 'Ads', 'Rules']);
      assert.deepEqual(await optionTexts(), [
        'Test Campaign Leads account Active',
        'Test campaign EU Euro account Active',
        'Test audience Test Campaign · Leads account Active',
        'Test creative Test audience · Leads account Paused',
        'Test stop without leads Paused',
      ]);
      assert.equal(await selected(), 'Test Campaign Leads account Active');
      await page.keyboard.press('ArrowDown');
      assert.equal(await selected(), 'Test campaign EU Euro account Active');
      await page.keyboard.press('End');
      assert.equal(await selected(), 'Test stop without leads Paused');
      await page.keyboard.press('ArrowDown');
      assert.equal(await selected(), 'Test Campaign Leads account Active', 'the list wraps around');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await closed();
      await page.waitForURL(`${origin}/alpha/ads-manager/campaigns/120045?account=act_1001`);
      await waitForFocus('120045');
      const row = page.locator('[data-row-id="120045"]');
      assert.equal(await row.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      }), true, 'the campaign is scrolled into view');
      assert.equal(await page.evaluate(() => scrollY), 0, 'only the list scrolls, not the page');
      await accountPicker('Leads account').waitFor();
      await assertNoOverflow('revealed campaign');
      await page.screenshot({ path: `${output}/campaign-${width}.png` });

      // An ad account result switches Ads Manager to it; a campaign of another account switches back.
      await openWithSlash();
      await field.fill('euro');
      await option(/Euro account/).waitFor();
      await option(/Euro account/).click();
      await closed();
      await page.waitForURL(`${origin}/alpha/ads-manager/campaigns?account=act_1002`);
      await accountPicker('Euro account').waitFor();
      await page.locator('[data-row-id="120101"]').waitFor();
      assert.equal(hierarchyReads.filter((read) => read.parent === 'act_1002' && read.level === 'campaign').length > 0, true);
      await openWithSlash();
      await field.fill('Test audience');
      await option(/Test audience/).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${origin}/alpha/ads-manager/adsets/230001?account=act_1001`);
      await waitForFocus('230001');
      await accountPicker('Leads account').waitFor();
      assert.equal(await page.getByRole('tab', { name: /Ad sets/ }).getAttribute('aria-selected'), 'true');

      // 7. With rows selected, Ctrl/Cmd+K is the selection's own actions menu.
      await page.locator('[data-row-id="230001"]').hover();
      await page.keyboard.press('x');
      await page.getByRole('toolbar', { name: '1 selected' }).waitFor();
      await page.keyboard.press('Control+K');
      await page.getByText('Pause delivery', { exact: true }).waitFor();
      assert.equal(await commands.count(), 0, 'the selection keeps Ctrl+K');
      await page.keyboard.press('Escape');
      await page.getByText('Pause delivery', { exact: true }).waitFor({ state: 'detached' });
      await page.keyboard.press('Escape');
      await page.getByRole('toolbar', { name: '1 selected' }).waitFor({ state: 'detached' });

      // 8. A rule opens on its row in Rules, leaving a tab that hid it.
      await page.goto(`${origin}/alpha/rules`);
      await page.getByText('Budget up on cheap leads', { exact: true }).first().waitFor();
      await page.getByRole('tab', { name: 'Active', exact: true }).click();
      assert.equal(await page.locator('[data-row-id="7"]').count(), 0, 'the paused rule is hidden on Active');
      await openWithSlash();
      await field.fill('stop');
      await option(/Test stop without leads/).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${origin}/alpha/rules/7`);
      await waitForFocus('7');
      assert.equal(await page.getByRole('tab', { name: 'All rules', exact: true }).getAttribute('aria-selected'), 'true');

      // 9. Commands are filtered by what is typed, search nothing and lead where they say.
      const searchesBefore = searches.length;
      await page.keyboard.press('Control+K');
      await commandField.fill('inbox');
      await commands.getByRole('option', { name: 'Go to Inbox' }).waitFor();
      assert.deepEqual(await commandTexts(), ['Go to Inbox']);
      await commandField.fill('zzz');
      await commands.getByText('No commands match “zzz”.', { exact: true }).waitFor();
      await commandField.fill('inbox');
      await commands.getByRole('option', { name: 'Go to Inbox' }).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${origin}/alpha/inbox`);
      assert.equal(searches.length, searchesBefore, 'the command menu does not search');
      await page.keyboard.press('Control+K');
      await commandField.fill('create rule');
      await commands.getByRole('option', { name: 'Create rule…' }).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${origin}/alpha/rules`);
      await page.getByRole('dialog', { name: 'New rule' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'New rule' }).waitFor({ state: 'detached' });

      // Every search asked for this workspace only.
      assert.deepEqual([...new Set(searches.map((search) => search.scope))], ['alpha']);
      assert.deepEqual(errors, []);
      console.log(`Command menu: search states, Esc focus, / in fields, Ctrl/Cmd+K, keyboard and result rows passed at ${width}px`);
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
