// Exercise the real App with a synthetic API: Linear's search page (#310). `/`
// and the sidebar's Search button open /<workspace>/search; it searches on
// Enter through GET /api/search (scoped by the address), keeps the query, tab,
// filters and display options in the address, tells searching, nothing found
// and failure apart, previews the row ↑/↓ reach, leaves on the second Esc,
// remembers recent searches and opens each result on its own row.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-search-page';
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


const KIND_ORDER = ['campaign', 'adset', 'ad', 'rule', 'account'];
const DAY = 24 * 60 * 60 * 1000;

/** The Status filter's words for Meta's delivery and a rule's run state. */
function statusGroup(kind, status) {
  if (kind === 'account') return null;
  const value = status.toUpperCase();
  if (value === 'ACTIVE') return 'active';
  if (value === 'PAUSED' || value.endsWith('_PAUSED')) return 'paused';
  return 'other';
}

/** GET /api/search as the server answers it: one list, best match first, filters applied. */
function searchResponse(params) {
  const query = params.get('q');
  const limit = Number(params.get('limit'));
  const kind = params.get('kind');
  const statuses = params.getAll('status');
  const onlyAccounts = params.getAll('account');
  const needle = query.toLowerCase();
  const rank = (name) => (name.toLowerCase() === needle ? 0 : name.toLowerCase().startsWith(needle) ? 1 : 2);
  const names = Object.fromEntries(accounts.map((item) => [item.account_id, item.name]));
  const parents = new Map(Object.values(inventory).flatMap((levels) => [...levels.campaign, ...levels.adset])
    .map((item) => [item.entity_id, item.entity_name]));
  let kinds = kind ? [kind] : KIND_ORDER;
  if (onlyAccounts.length) kinds = kinds.filter((candidate) => candidate !== 'rule');
  if (statuses.length) kinds = kinds.filter((candidate) => candidate !== 'account');
  const ranked = [];
  const truncated = [];
  const take = (found) => {
    const kept = found
      .filter((item) => !statuses.length || statuses.includes(statusGroup(item.kind, item.status)))
      .filter((item) => !onlyAccounts.length || onlyAccounts.includes(item.account_id))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
    if (kept.length > limit) truncated.push(found[0].kind);
    ranked.push(...kept.slice(0, limit));
  };
  for (const level of ['campaign', 'adset', 'ad']) {
    if (!kinds.includes(level)) continue;
    take(Object.values(inventory).flatMap((levels) => levels[level])
      .filter((item) => item.entity_name.toLowerCase().includes(needle) || item.entity_id === query)
      .map((item, index) => ({
        kind: level, id: item.entity_id, name: item.entity_name, account_id: item.account_id,
        account_name: names[item.account_id], parent_name: level === 'campaign' ? '' : parents.get(item.parent_entity_id) ?? '',
        status: item.effective_status,
        updated_at: new Date(Date.UTC(2026, 9, 6) - (index % 9) * DAY).toISOString(),
      })));
  }
  if (kinds.includes('rule')) {
    take(presets.filter((item) => item.name.toLowerCase().includes(needle)).map((item) => ({
      kind: 'rule', id: String(item.id), name: item.name, account_id: '', account_name: '', parent_name: '',
      status: item.enabled ? 'active' : 'paused', updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })));
  }
  if (kinds.includes('account')) {
    take(accounts.filter((item) => item.name.toLowerCase().includes(needle) || item.account_id === query)
      .map((item) => ({
        kind: 'account', id: item.account_id, name: item.name, account_id: item.account_id, account_name: '',
        parent_name: '', status: '', updated_at: '2026-08-29T07:57:00Z',
      })));
  }
  const results = params.get('order') === 'updated'
    ? [...ranked].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    : [...ranked].sort((a, b) => rank(a.name) - rank(b.name));
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
        searches.push({ params: url.searchParams.toString(), scope });
        if (holdSearch) await holdSearch;
        // The page may have moved on and cancelled the request meanwhile.
        if (failNextSearch) {
          failNextSearch = false;
          return route.fulfill({ status: 503, json: { detail: 'Search is unavailable right now.' } }).catch(() => {});
        }
        return route.fulfill({ json: searchResponse(url.searchParams) }).catch(() => {});
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: accounts });
      if (path === '/api/analytics/hierarchy') {
        const parent = url.searchParams.get('parent_id');
        const level = url.searchParams.get('level');
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

    const field = page.getByRole('textbox', { name: 'Search workspace' });
    const results = page.getByRole('list', { name: 'Search results' });
    const rows = () => results.getByRole('link');
    const rowNames = async () => rows().evaluateAll((links) => links.map((link) => link.querySelector('[data-search-name]')?.textContent ?? ''));
    const rowKinds = async () => rows().evaluateAll((links) => links.map((link) => link.querySelector('[data-search-kind]')?.textContent ?? ''));
    const until = async (check, what) => {
      for (let tries = 0; tries < 50 && !check(); tries += 1) await new Promise((resolve) => { setTimeout(resolve, 100); });
      assert.ok(check(), what);
    };
    const lastSearch = () => new URLSearchParams(searches.at(-1)?.params ?? '');
    const preview = page.getByRole('region', { name: 'Preview' });
    const pathAndQuery = () => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}`;
    };
    const assertNoOverflow = async (where) => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${where} at ${width}px: document overflow`,
    );
    const waitForFocus = (expected) => page.waitForFunction((value) => {
      const element = document.activeElement;
      return [element?.getAttribute('aria-label'), element?.getAttribute('data-row-id'), element?.id].includes(value);
    }, expected);
    const openFromSidebar = async () => {
      // Below 880px the sidebar, and its Search button, sit in the drawer opened by Menu.
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      if (small && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      await page.getByRole('button', { name: 'Search workspace' }).click();
      await page.waitForURL(`${origin}/alpha/search`);
      await field.waitFor();
    };
    const submit = async (text) => {
      await field.fill(text);
      await field.press('Enter');
      await page.waitForURL((url) => url.searchParams.get('q') === text);
    };

    try {
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();

      // 1. The sidebar's Search button opens a page, not a window: the sidebar stays, nothing dims.
      await openFromSidebar();
      await waitForFocus('Search workspace');
      assert.equal(await field.getAttribute('placeholder'), 'Search campaigns, ad sets, ads, rules and ad accounts…');
      assert.equal(await page.title(), 'Search');
      await page.getByText('Find campaigns, ad sets, ads, rules and ad accounts.', { exact: true }).waitFor();
      for (const tab of ['All', 'Campaigns', 'Ad sets', 'Ads', 'Rules', 'Ad accounts']) {
        await page.getByRole('tab', { name: tab, exact: true }).waitFor();
      }
      await page.getByRole('button', { name: 'Add filter' }).waitFor();
      await page.getByRole('button', { name: 'Display options' }).waitFor();
      // On a phone the tabs scroll sideways; none shrinks to "Ca…".
      assert.deepEqual(
        await page.getByRole('tab').evaluateAll((tabs) => tabs.filter((tab) => tab.scrollWidth > tab.clientWidth
          || tab.querySelector('span').scrollWidth > tab.querySelector('span').clientWidth).map((tab) => tab.textContent)),
        [],
        `tabs cut at ${width}px`,
      );
      await assertNoOverflow('empty search page');
      await page.screenshot({ path: `${output}/empty-${width}.png` });

      // 2. Typing searches nothing; Enter does, writes the address and the tab title.
      await field.fill('Test Campaign');
      await page.waitForTimeout(400);
      assert.equal(searches.length, 0, 'typing alone does not search');
      let release;
      holdSearch = new Promise((resolve) => { release = resolve; });
      await field.press('Enter');
      await page.waitForURL(`${origin}/alpha/search?q=Test+Campaign`);
      await page.getByText('Searching Alpha…', { exact: true }).waitFor({ state: 'attached' });
      release();
      holdSearch = null;
      await results.waitFor();
      assert.equal(await page.title(), 'Search: Test Campaign');
      assert.deepEqual(await rowNames(), ['Test Campaign', 'Test campaign EU']);
      assert.deepEqual(await rowKinds(), ['Campaign', 'Campaign']);
      assert.equal(await rows().first().locator('strong').innerText(), 'Test Campaign', 'the match is bold');
      assert.equal(await rows().first().getAttribute('href'), '/alpha/ads-manager/campaigns/120045?account=act_1001');
      assert.equal(lastSearch().get('q'), 'Test Campaign');
      assert.equal(searches.at(-1).scope, 'alpha');
      // The ad account sits on the right from 768px; the age everywhere.
      assert.equal(await rows().first().getByText('Leads account', { exact: true }).isVisible(), width >= 768);
      await assertNoOverflow('results');
      await page.screenshot({ path: `${output}/results-${width}.png` });

      // 3. A tab searches one kind, prompts for it and keeps it in the address.
      await page.getByRole('tab', { name: 'Rules', exact: true }).click();
      await page.waitForURL(`${origin}/alpha/search?q=Test+Campaign&type=rule`);
      // The address changes before React renders the tab, so wait for what it shows and asks.
      await page.waitForFunction(() => document.querySelector('[data-search-page-input]')?.placeholder === 'Search rules by name…');
      await until(() => lastSearch().get('kind') === 'rule', 'the Rules tab searches rules');
      await page.getByText('No results found for "Test Campaign"', { exact: true }).waitFor();
      await submit('stop');
      await results.waitFor();
      assert.deepEqual(await rowNames(), ['Test stop without leads']);
      await page.getByRole('tab', { name: 'All', exact: true }).click();
      await page.waitForURL(`${origin}/alpha/search?q=stop`);

      // 4. Nothing found, a failure and its retry are told apart.
      await submit('zzz');
      await page.getByText('No results found for "zzz"', { exact: true }).waitFor();
      failNextSearch = true;
      await submit('Spring');
      await page.getByText("Couldn't search Alpha. Search is unavailable right now.", { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Retry search' }).click();
      await results.waitFor();
      assert.deepEqual(await rowNames(), ['Spring sale']);

      // 5. ↑/↓ open the preview; the first Esc closes it, the second leaves for where search opened.
      await submit('test');
      await results.waitFor();
      assert.deepEqual(await rowKinds(), ['Campaign', 'Campaign', 'Ad set', 'Ad', 'Rule']);
      await field.press('ArrowDown');
      await preview.waitFor();
      await preview.getByRole('heading', { name: 'Test Campaign' }).waitFor();
      await preview.getByRole('button', { name: 'Go to campaign' }).waitFor();
      // Below 768px the preview takes the panel and the field with it, so the page has the keys.
      await page.keyboard.press('ArrowDown');
      await preview.getByRole('heading', { name: 'Test campaign EU' }).waitFor();
      await assertNoOverflow('preview');
      await page.screenshot({ path: `${output}/preview-${width}.png` });
      await page.keyboard.press('Escape');
      await preview.waitFor({ state: 'detached' });
      assert.equal(new URL(page.url()).pathname, '/alpha/search', 'the first Esc stays on search');
      await page.keyboard.press('Escape');
      await page.waitForURL(`${origin}/alpha/inbox`);

      // 6. `/` opens it again with what was searched before; Clear History forgets it.
      await page.getByText('No notifications', { exact: true }).waitFor();
      await page.keyboard.press('/');
      await page.waitForURL(`${origin}/alpha/search`);
      const recent = page.getByRole('list', { name: 'Recent searches' });
      await recent.waitFor();
      assert.deepEqual(
        (await recent.getByRole('button').allInnerTexts()).map((text) => text.trim()),
        ['test', 'Spring', 'zzz', 'stop', 'Test Campaign'],
      );
      await assertNoOverflow('recent searches');
      await page.screenshot({ path: `${output}/recent-${width}.png` });
      await recent.getByRole('button', { name: 'stop' }).click();
      await page.waitForURL(`${origin}/alpha/search?q=stop`);
      await page.waitForFunction(() => document.querySelector('[data-search-page-input]')?.value === 'stop');
      await page.getByRole('button', { name: 'Clear search' }).click();
      await page.waitForURL(`${origin}/alpha/search`);
      await page.getByRole('button', { name: 'Clear History' }).click();
      await page.getByText('Find campaigns, ad sets, ads, rules and ad accounts.', { exact: true }).waitFor();

      // 7. Filters live in the address; the menu opens on Add filter and closes on Esc without leaving.
      await page.goto(`${origin}/alpha/search?q=test&status=paused`);
      await results.waitFor();
      assert.deepEqual(lastSearch().getAll('status'), ['paused']);
      assert.deepEqual(await rowNames(), ['Test creative', 'Test stop without leads']);
      await page.locator('[aria-label="Active filters"]').waitFor();
      await page.getByRole('button', { name: 'Add another filter' }).first().click();
      const filterField = page.getByRole('searchbox', { name: 'Add Filter…' });
      await filterField.waitFor();
      // The menu focuses its field a moment after it opens; its Esc is the field's.
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Add Filter…');
      await page.keyboard.press('Escape');
      await filterField.waitFor({ state: 'detached' });
      assert.equal(new URL(page.url()).pathname, '/alpha/search', 'Esc in the filter menu stays on search');
      await page.goto(`${origin}/alpha/search?q=test&account=act_1002`);
      await results.waitFor();
      assert.deepEqual(lastSearch().getAll('account'), ['act_1002']);
      assert.deepEqual(await rowNames(), ['Test campaign EU']);

      // 8. Display options: ordering and deleted records, both in the address.
      await page.getByRole('button', { name: 'Display options' }).click();
      const display = page.getByRole('dialog', { name: 'Display options' });
      await display.getByText('Ordering', { exact: true }).waitFor();
      await display.getByText('Most relevant', { exact: true }).waitFor();
      await display.getByRole('switch', { name: 'Include deleted' }).click();
      await page.waitForURL((url) => url.searchParams.get('includeDeleted') === 'true');
      await until(() => lastSearch().get('include_deleted') === 'true', 'Include deleted reaches the server');
      await assertNoOverflow('display options');
      await page.screenshot({ path: `${output}/display-${width}.png` });
      await page.keyboard.press('Escape');
      await display.waitFor({ state: 'detached' });
      assert.equal(new URL(page.url()).pathname, '/alpha/search', 'Esc in Display options stays on search');

      // 9. A result opens on its own row: Enter on the previewed one, as "Go to campaign".
      await page.goto(`${origin}/alpha/search?q=Test+audience`);
      await results.waitFor();
      await field.press('ArrowDown');
      await preview.getByRole('button', { name: 'Go to ad set' }).click();
      await page.waitForURL(`${origin}/alpha/ads-manager/adsets/230001?account=act_1001`);
      await waitForFocus('230001');
      await page.goto(`${origin}/alpha/search?q=stop`);
      await results.waitFor();
      await rows().first().click();
      await page.waitForURL(`${origin}/alpha/rules/7`);
      await waitForFocus('7');
      assert.ok(pathAndQuery().startsWith('/alpha/rules/7'));

      // Every search asked for this workspace only.
      assert.deepEqual([...new Set(searches.map((search) => search.scope))], ['alpha']);
      assert.deepEqual(errors, []);
      console.log(`Search page: Enter, tabs, states, preview and Esc, recent searches, filters and display options passed at ${width}px`);
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
