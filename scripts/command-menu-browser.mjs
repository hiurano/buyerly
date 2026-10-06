// Exercise the real App with a synthetic API: Linear's command menu (#190,
// #310, #311). Ctrl/Cmd+K opens from anywhere with no dimmed backdrop: the
// page's own group, then everyone's in a fixed order, each with its keys;
// letters match in order, and from two letters "Quick results" come from
// GET /api/search. Esc closes it with focus given back, and a row selection
// keeps its own actions menu. G then a letter does what the hints say (#306).
// `/` stays text in a field and outside one opens the search page, which
// scripts/search-page-browser.mjs checks.
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


let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const searches = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      if (verb !== 'GET') {
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/search') {
        const q = url.searchParams.get('q');
        searches.push(q);
        // Only "test" finds anything: one campaign, so a quick result can be opened.
        const results = q === 'test'
          ? [{
            kind: 'campaign', id: '120045', name: 'Test Campaign', account_id: 'act_1001', account_name: 'Leads account',
            parent_name: '', status: 'ACTIVE', updated_at: '2026-10-01T08:00:00Z',
          }]
          : [];
        return route.fulfill({ json: { query: q, limit: 20, results, truncated: [] } });
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

    const commands = page.getByRole('dialog', { name: 'Command menu' });
    const commandField = commands.getByRole('combobox');
    // Each row's label, and its keys as read aloud: "Go to rules · G then R".
    const commandTexts = async () => commands.getByRole('option').evaluateAll((options) => options.map((option) => {
      const label = option.getAttribute('aria-label') ?? '';
      const keys = option.querySelector('[aria-label]')?.getAttribute('aria-label');
      return keys ? `${label} · ${keys}` : label;
    }));
    const headings = () => commands.locator('[cmdk-group-heading]').allInnerTexts();
    const wide = width > 880;
    const closed = () => commands.waitFor({ state: 'detached' });
    const waitForFocus = (expected) => page.waitForFunction((value) => {
      const element = document.activeElement;
      return [element?.getAttribute('aria-label'), element?.getAttribute('data-row-id'), element?.id].includes(value);
    }, expected);
    const assertNoOverflow = async (where) => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${where} at ${width}px: document overflow`,
    );
    const onSearchPage = () => page.waitForURL(`${origin}/alpha/search`);

    try {
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();

      // 1. `/` typed in a field is text: an input, a textarea, rich text and the Inbox filter.
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
        assert.equal(new URL(page.url()).pathname, '/alpha/inbox', `${id}: / did not open search`);
      }
      await page.locator('#probe-rich').evaluate((element) => element.blur());
      await page.keyboard.press('f');
      const filterField = page.getByRole('searchbox', { name: 'Add Filter…' });
      await filterField.waitFor();
      // The menu focuses its field a moment after it opens.
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Add Filter…');
      await page.keyboard.type('a/b');
      assert.equal(await filterField.inputValue(), 'a/b');
      assert.equal(new URL(page.url()).pathname, '/alpha/inbox', 'the Inbox filter keeps the slash');
      await page.keyboard.press('Escape');
      await filterField.waitFor({ state: 'detached' });

      // 2. Ctrl/Cmd+K opens commands from a text field too, with nothing dimmed behind:
      //    the page's group first, then everyone's, each with its keys. Pressed again it closes.
      await page.locator('#probe-textarea').focus();
      await page.keyboard.press('Control+K');
      await commandField.waitFor();
      assert.equal(await commandField.getAttribute('placeholder'), 'Type a command or search…');
      assert.deepEqual(await headings(), ['Notifications', 'Rules', 'Filter', 'Navigation']);
      assert.deepEqual(await commandTexts(), [
        'Delete all notifications', 'Delete all read notifications · ⇧ ⌫', 'Create rule…', 'Search workspace…',
        // Linear leaves out Go to inbox on Inbox itself.
        'Go to advanced search · /', 'Go to Ads Manager · G then A', 'Go to rules · G then R', 'Go to settings · G then S',
        ...(wide ? ['Collapse navigation sidebar · ['] : []),
      ]);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('body *')].some((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.position === 'fixed' && box.width >= innerWidth && box.height >= innerHeight
          && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
      })), false, 'nothing dims the page behind the menu');
      await assertNoOverflow('command menu');
      await page.screenshot({ path: `${output}/commands-${width}.png` });
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

      // 3. Outside a field `/` opens the search page; so does the command "Search workspace…".
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await page.keyboard.press('/');
      await onSearchPage();
      await page.getByRole('textbox', { name: 'Search workspace' }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'Search workspace' }).inputValue(), '', 'the slash is not typed');
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();
      await page.keyboard.press('Control+K');
      await commandField.fill('search');
      await commands.getByRole('option', { name: 'Search workspace…' }).waitFor();
      await page.keyboard.press('Enter');
      await closed();
      await onSearchPage();

      // 4. With rows selected, Ctrl/Cmd+K is the selection's own actions menu.
      await page.goto(`${origin}/alpha/ads-manager/adsets?account=act_1001`);
      await page.locator('[data-row-id="230001"]').waitFor();
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

      // 5. Letters match in order; from two letters "Quick results" follow, here empty.
      const noResults = 'No results found, go to advanced search';
      await page.keyboard.press('Control+K');
      await commandField.fill('i');
      await commands.getByRole('option', { name: 'Go to inbox' }).waitFor();
      assert.equal(await commands.getByText(/^Quick results/).count(), 0, 'one letter only filters commands');
      await commandField.fill('inbox');
      await commands.getByRole('option', { name: noResults }).waitFor();
      assert.deepEqual(await commandTexts(), ['Go to inbox · G then I', noResults]);
      await commandField.fill('gtset');
      await commands.getByRole('option', { name: 'Go to settings' }).waitFor();
      await commands.getByRole('option', { name: noResults }).waitFor();
      assert.deepEqual(await commandTexts(), ['Go to settings · G then S', noResults]);
      await commandField.fill('zzz');
      await commands.getByText('Quick results for "zzz"', { exact: true }).waitFor();
      await commands.getByRole('option', { name: noResults }).waitFor();
      assert.deepEqual(await commandTexts(), [noResults]);
      await commandField.fill('inbox');
      await commands.getByRole('option', { name: 'Go to inbox' }).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${origin}/alpha/inbox`);
      await page.keyboard.press('Control+K');
      await commandField.fill('create rule');
      await commands.getByRole('option', { name: 'Create rule…' }).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${origin}/alpha/rules`);
      await page.getByRole('dialog', { name: 'New rule' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'New rule' }).waitFor({ state: 'detached' });

      // 6. A quick result opens its record; Ctrl+/ and the footer open the search page with the words.
      await page.keyboard.press('Control+K');
      await commandField.waitFor();
      assert.deepEqual((await commandTexts()).slice(0, 1), ['Create rule… · C'], 'C creates a rule on the Rules page');
      await commandField.fill('test');
      const testCampaign = commands.getByRole('option', { name: 'Campaign Test Campaign, Leads account' });
      await testCampaign.waitFor();
      assert.deepEqual(await commandTexts(), ['Campaign Test Campaign, Leads account', 'Search entire workspace test']);
      await commands.getByText('Quick results for "test"', { exact: true }).waitFor();
      await commands.getByRole('button', { name: /Advanced search/ }).waitFor();
      await commands.getByText('Open', { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/quick-results-${width}.png` });
      await page.keyboard.press('Enter');
      await closed();
      await page.waitForURL(`${origin}/alpha/ads-manager/campaigns/120045?account=act_1001`);
      await page.keyboard.press('Control+K');
      await commandField.fill('test');
      await testCampaign.waitFor();
      // The opened row loads behind the menu; it must not take the field's focus.
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('cmdk-input')), true, 'the field keeps focus');
      await page.keyboard.press('Control+/');
      await closed();
      await page.waitForURL(`${origin}/alpha/search?q=test`);
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();
      await page.keyboard.press('Control+K');
      await commandField.fill('zzz');
      await commands.getByRole('option', { name: noResults }).waitFor();
      await commands.getByRole('button', { name: /Advanced search/ }).click();
      await closed();
      await page.waitForURL(`${origin}/alpha/search?q=zzz`);

      // 7. G then a letter does what the hints say (#306): G A, G R, G S, G I; Statistics is off, so G T does nothing.
      await page.goto(`${origin}/alpha/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();
      const goTo = [['a', /\/alpha\/ads-manager\/campaigns/], ['r', /\/alpha\/rules$/], ['s', /\/alpha\/settings/], ['i', /\/alpha\/inbox$/]];
      for (const [letter, address] of goTo) {
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
        await page.keyboard.press('g');
        await page.keyboard.press(letter);
        await page.waitForURL(address);
      }
      await page.keyboard.press('g');
      await page.keyboard.press('t');
      await page.waitForTimeout(300);
      assert.equal(new URL(page.url()).pathname, '/alpha/inbox', 'G T opens nothing while Statistics is off');

      assert.ok(searches.includes('test') && searches.includes('zzz'), 'quick results asked GET /api/search');
      assert.ok(searches.every((query) => query.length >= 2), `quick results wait for two letters: ${searches}`);
      assert.deepEqual(errors, []);
      console.log(`Command menu: / in fields, Ctrl/Cmd+K groups and keys, letter matching, quick results and G shortcuts passed at ${width}px`);
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
