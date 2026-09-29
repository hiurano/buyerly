// Exercise the real App with a synthetic API: the workspace menu's Switch workspace
// submenu and Linear's O then W palette list this account's workspaces, open the
// chosen one at its home, drop a late answer from the old workspace, and lead to
// "Create or join a workspace…" — all after Linear.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-workspace-switcher';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspaceItem = (id, slug, name, badgeColor) => ({
  id, slug, name, role: 'owner', badge_text: name[0], badge_color: badgeColor, logo_url: '', is_active: false,
});
const preset = (id, name) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gt', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 0, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    const delayedAlphaRules = [];
    let delayAlphaRules = true;
    const workspaces = [workspaceItem(1, 'alpha', 'Alpha', '#5E6AD2'), workspaceItem(2, 'beta', 'Beta', '#26B5CE')];
    let activeSlug = 'alpha';
    const me = () => {
      const items = workspaces.map(item => ({ ...item, is_active: item.slug === activeSlug }));
      return {
        username: 'switcher', full_name: 'Sam Switcher', first_name: 'Sam', last_name: 'Switcher',
        email: 'sam@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
        onboarding_completed: true, onboarding_step: 'completed',
        active_workspace: items.find(item => item.is_active), workspaces: items,
      };
    };
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      const scope = request.headers()['x-workspace-slug'];
      if (verb !== 'GET') writes.push({ verb, path, scope, body: request.postDataJSON() });
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: me() });
      if (verb === 'POST' && path === '/api/workspaces/switch') {
        activeSlug = request.postDataJSON().slug;
        return route.fulfill({ json: { status: 'ok', active_workspace: me().active_workspace } });
      }
      if (verb === 'GET' && path === '/api/onboarding/check-slug') {
        return route.fulfill({ json: { available: true, message: '' } });
      }
      if (verb === 'POST' && path === '/api/workspaces') {
        workspaces.push(workspaceItem(3, 'gamma', request.postDataJSON().name, '#F5A300'));
        activeSlug = 'gamma';
        return route.fulfill({ json: { ...workspaces[2], is_active: true, accounts_count: 0, members_count: 1 } });
      }
      if (verb === 'GET' && path === '/api/presets') {
        if (scope === 'alpha' && delayAlphaRules) { delayedAlphaRules.push(route); return; }
        return route.fulfill({ json: [preset(scope === 'alpha' ? 1 : 2, `${scope} rule`)] });
      }
      if (verb === 'GET' && path === '/api/inbox') {
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/audit-events') {
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (verb === 'GET' && path === '/api/analytics/hierarchy') return route.fulfill({ json: { items: [] } });
      if (verb === 'GET') return route.fulfill({ json: [] });
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    const assertNoOverflow = async (where) => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${where} at ${width}px: document overflow`,
    );
    const openSwitchSubmenu = async (name) => {
      await page.getByRole('button', { name: `${name} Workspace Menu` }).click();
      await page.getByRole('menuitem', { name: /Switch workspace/ }).click();
      return page.getByRole('menu').filter({ hasText: 'sam@example.test' });
    };
    const pathname = () => new URL(page.url()).pathname;
    try {
      // Alpha's rules are still loading when the user leaves for Beta.
      await page.goto(`${origin}/alpha/rules`);
      await page.getByRole('button', { name: 'Alpha Workspace Menu' }).waitFor();
      await page.waitForFunction(() => document.title === 'Alpha — Buyerly');
      assert.equal(delayedAlphaRules.length > 0, true);

      // Menu → Switch workspace: the account's email, its workspaces numbered 1…N with
      // the open one checked, then Account → Create or join a workspace….
      const submenu = await openSwitchSubmenu('Alpha');
      await submenu.waitFor();
      const items = await submenu.getByRole('menuitem').allInnerTexts();
      assert.deepEqual(items.map(text => text.replace(/\s+/g, ' ').trim()), [
        'A Alpha 1', 'B Beta 2', 'Create or join a workspace…',
      ]);
      assert.equal(await submenu.getByRole('menuitem', { name: /Alpha/ }).getByLabel('Current workspace').count(), 1);
      assert.equal(await submenu.getByRole('menuitem', { name: /Beta/ }).getByLabel('Current workspace').count(), 0);
      await submenu.getByText('Account', { exact: true }).waitFor();
      await assertNoOverflow('switch submenu');
      await page.screenshot({ path: `${output}/submenu-${width}.png` });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('menu').first().waitFor({ state: 'detached' });

      // O then W: Linear's palette. Typing filters and hides the numbers; with nothing
      // typed, a number opens that workspace at once.
      await page.keyboard.press('o');
      await page.keyboard.press('w');
      const palette = page.getByRole('dialog', { name: 'Switch workspace' });
      await palette.waitFor();
      await palette.getByText('sam@example.test', { exact: true }).waitFor();
      assert.equal(await palette.getByRole('option').count(), 2);
      await assertNoOverflow('switch palette');
      await page.screenshot({ path: `${output}/palette-${width}.png` });
      await palette.getByRole('combobox').fill('be');
      assert.deepEqual((await palette.getByRole('option').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim()), ['B Beta']);
      assert.equal(await palette.getByText('sam@example.test', { exact: true }).count(), 0);
      await palette.getByRole('combobox').fill('');
      await page.keyboard.press('2');
      await page.waitForURL(`${origin}/beta/inbox`);
      await page.getByRole('button', { name: 'Beta Workspace Menu' }).waitFor();
      await page.getByText('No notifications', { exact: true }).waitFor();
      assert.equal(await palette.count(), 0);
      await page.waitForFunction(() => document.title === 'Inbox');
      assert.deepEqual(writes.filter(write => write.path === '/api/workspaces/switch')
        .map(write => [write.body.slug, write.scope]), [['beta', 'beta']]);

      // Alpha's late answer must not surface in Beta.
      for (const route of delayedAlphaRules.splice(0)) await route.fulfill({ json: [preset(1, 'late alpha rule')] });
      delayAlphaRules = false;
      await page.keyboard.press('g');
      await page.keyboard.press('r');
      await page.waitForURL(`${origin}/beta/rules`);
      await page.getByText('beta rule', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('late alpha rule', { exact: true }).count(), 0);
      assert.equal(await page.getByText('alpha rule', { exact: true }).count(), 0);

      // The menu switches back with a click; the current workspace is a no-op.
      const back = await openSwitchSubmenu('Beta');
      assert.equal(await back.getByRole('menuitem', { name: /Beta/ }).getByLabel('Current workspace').count(), 1);
      await back.getByRole('menuitem', { name: /Alpha/ }).click();
      await page.waitForURL(`${origin}/alpha/inbox`);
      await page.getByRole('button', { name: 'Alpha Workspace Menu' }).waitFor();
      const again = await openSwitchSubmenu('Alpha');
      await again.getByRole('menuitem', { name: /Alpha/ }).click();
      assert.equal(pathname(), '/alpha/inbox');
      assert.deepEqual(writes.filter(write => write.path === '/api/workspaces/switch').map(write => write.body.slug), ['beta', 'alpha']);

      // Create or join a workspace… → Linear's create page with Back and Logged in as.
      const create = await openSwitchSubmenu('Alpha');
      await create.getByRole('menuitem', { name: 'Create or join a workspace…' }).click();
      await page.waitForURL(`${origin}/create-workspace`);
      await page.getByRole('heading', { name: 'Create a workspace', exact: true }).waitFor();
      await page.getByText('Logged in as').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Use a different email' }).count(), 0);
      await assertNoOverflow('create workspace');
      await page.screenshot({ path: `${output}/create-${width}.png` });
      await page.getByRole('button', { name: /Back to Buyerly/ }).click();
      await page.waitForURL(`${origin}/alpha/inbox`);
      await (await openSwitchSubmenu('Alpha')).getByRole('menuitem', { name: 'Create or join a workspace…' }).click();
      await page.getByRole('textbox', { name: 'Name' }).fill('Gamma');
      await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
      await page.waitForURL(`${origin}/gamma/inbox`);
      await page.getByRole('button', { name: 'Gamma Workspace Menu' }).waitFor();
      assert.deepEqual(writes.filter(write => write.path === '/api/workspaces').map(write => write.body), [{ name: 'Gamma' }]);
      const three = await openSwitchSubmenu('Gamma');
      assert.equal(await three.getByRole('menuitem').count(), 4);
      assert.equal(await three.getByRole('menuitem', { name: /Gamma/ }).getByLabel('Current workspace').count(), 1);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      // With a single workspace the list still shows it, checked, and nothing is empty.
      workspaces.splice(1);
      activeSlug = 'alpha';
      await page.goto(`${origin}/alpha/inbox`);
      const single = await openSwitchSubmenu('Alpha');
      assert.deepEqual((await single.getByRole('menuitem').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim()), [
        'A Alpha 1', 'Create or join a workspace…',
      ]);
      assert.equal(await single.getByLabel('Current workspace').count(), 1);
      await page.screenshot({ path: `${output}/single-${width}.png` });
      assert.deepEqual(errors, []);
      console.log(`Workspace switcher: submenu, O then W, late answer, create and single workspace passed at ${width}px`);
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
