// Exercise the real App with a synthetic API holding several accounts logged in to
// one browser (Linear's "Add an account…", #231): Switch workspace and O then W group
// workspaces by account email with one numbering, a workspace of another account opens
// with that account's data and every request names it, a late answer of the old
// account never shows, Add an account logs in one more without leaving, and Log out
// leaves only the open account and opens a remaining one.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-multi-account';
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
const clean = texts => texts.map(text => text.replace(/\s+/g, ' ').trim());

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
    const requests = [];
    const delayedSamRules = [];
    let delaySamRules = true;
    const users = {
      1: { username: 'sam', email: 'sam@example.test', workspaces: [workspaceItem(1, 'alpha', 'Alpha', '#5E6AD2')] },
      2: {
        username: 'kim', email: 'kim@example.test',
        workspaces: [workspaceItem(2, 'beta', 'Beta', '#26B5CE'), workspaceItem(3, 'gamma', 'Gamma', '#F5A300')],
      },
      3: { username: 'lee', email: 'lee@example.test', workspaces: [workspaceItem(4, 'delta', 'Delta', '#4CB782')] },
    };
    // Logged in to this browser, in the order added (the server's cookie slots).
    let loggedIn = [1, 2];
    const profile = id => {
      const user = users[id];
      const items = user.workspaces.map((item, index) => ({ ...item, is_active: index === 0 }));
      return {
        id, username: user.username, full_name: user.username, first_name: user.username, last_name: '',
        email: user.email, email_verified: true, unconfirmed_email: null, avatar_url: '',
        onboarding_completed: true, onboarding_step: 'completed',
        active_workspace: items[0], workspaces: items,
      };
    };
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      const scope = request.headers()['x-workspace-slug'];
      const header = request.headers()['x-buyerly-account'];
      requests.push({ verb, path, scope, account: header ? Number(header) : null });
      if (verb === 'GET' && path === '/api/auth/accounts') {
        return route.fulfill({ json: loggedIn.map((id, slot) => ({ ...profile(id), slot })) });
      }
      if (verb === 'POST' && path === '/api/auth/login') {
        if (!loggedIn.includes(3)) loggedIn.push(3);
        return route.fulfill({ json: { account_id: 3, username: 'lee', full_name: 'lee', role: 'buyer', message: 'Signed in successfully' } });
      }
      // The server never stands in another account for one that is not logged in.
      const account = header ? Number(header) : loggedIn[loggedIn.length - 1];
      if (!loggedIn.includes(account)) return route.fulfill({ status: 401, json: { detail: 'This account is no longer logged in' } });
      const own = users[account].workspaces.map(item => item.slug);
      if (scope && !own.includes(scope)) {
        errors.push(`${verb} ${path} for ${scope} as account ${account}`);
        return route.fulfill({ status: 403, json: { detail: 'Workspace access denied' } });
      }
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: profile(account) });
      if (verb === 'POST' && path === '/api/auth/logout') {
        loggedIn = loggedIn.filter(id => id !== account);
        return route.fulfill({ json: { message: 'Signed out' } });
      }
      if (verb === 'POST' && path === '/api/workspaces/switch') return route.fulfill({ json: { status: 'ok' } });
      if (verb === 'GET' && path === '/api/presets') {
        if (account === 1 && delaySamRules) { delayedSamRules.push(route); return; }
        return route.fulfill({ json: [preset(account, `${scope} rule`)] });
      }
      if (verb === 'GET' && path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/audit-events') {
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (verb === 'GET' && path === '/api/analytics/hierarchy') return route.fulfill({ json: { items: [] } });
      if (verb === 'GET') return route.fulfill({ json: [] });
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    const openSwitchSubmenu = async (name) => {
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      if (width <= 880 && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      await page.getByRole('button', { name: `${name} Workspace Menu` }).click();
      await page.getByRole('menuitem', { name: /Switch workspace/ }).click();
      return page.getByRole('menu').filter({ hasText: 'Add an account…' });
    };
    const closeMenus = async () => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('menu').first().waitFor({ state: 'detached' });
    };
    const since = mark => requests.slice(mark);
    try {
      // The address names Sam's workspace, so this tab opens as Sam; his rules are slow.
      await page.goto(`${origin}/alpha/rules`);
      await page.getByRole('button', { name: 'Alpha Workspace Menu' }).waitFor();
      assert.equal(delayedSamRules.length > 0, true);
      assert.equal(requests.filter(item => item.path === '/api/presets').every(item => item.account === 1), true);

      // One block per account, headed by its email, numbered straight through.
      const submenu = await openSwitchSubmenu('Alpha');
      await submenu.waitFor();
      assert.deepEqual(clean(await submenu.getByRole('menuitem').allInnerTexts()), [
        'A Alpha 1', 'B Beta 2', 'G Gamma 3', 'Create or join a workspace…', 'Add an account…',
      ]);
      for (const email of ['sam@example.test', 'kim@example.test']) await submenu.getByText(email, { exact: true }).waitFor();
      assert.equal(await submenu.getByLabel('Current workspace').count(), 1);
      assert.equal(await submenu.getByRole('menuitem', { name: /Alpha/ }).getByLabel('Current workspace').count(), 1);
      await page.screenshot({ path: `${output}/submenu-${width}.png` });

      // Kim's workspace opens at once, as Kim: no new login, every request names Kim.
      let mark = requests.length;
      await submenu.getByRole('menuitem', { name: /Beta/ }).click();
      await page.waitForURL(`${origin}/beta/inbox`);
      await page.getByRole('button', { name: 'Beta Workspace Menu' }).waitFor();
      const asKim = since(mark).filter(item => item.path !== '/api/auth/accounts');
      assert.equal(asKim.length > 0, true);
      assert.deepEqual([...new Set(asKim.map(item => item.account))], [2]);
      assert.equal(asKim.some(item => item.path === '/api/auth/login'), false);

      // Sam's late answer never reaches Kim's screen.
      for (const route of delayedSamRules.splice(0)) await route.fulfill({ json: [preset(1, 'late alpha rule')] });
      delaySamRules = false;
      await page.keyboard.press('g');
      await page.keyboard.press('r');
      await page.waitForURL(`${origin}/beta/rules`);
      await page.getByText('beta rule', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('late alpha rule', { exact: true }).count(), 0);

      // O then W: the same blocks; with nothing typed, 1 opens Sam's Alpha again.
      await page.keyboard.press('o');
      await page.keyboard.press('w');
      const palette = page.getByRole('dialog', { name: 'Switch workspace' });
      await palette.waitFor();
      for (const email of ['sam@example.test', 'kim@example.test']) await palette.getByText(email, { exact: true }).waitFor();
      assert.equal(await palette.getByRole('option').count(), 3);
      assert.equal(await palette.getByRole('option', { name: /Beta/ }).getByLabel('Current workspace').count(), 1);
      await page.screenshot({ path: `${output}/palette-${width}.png` });
      mark = requests.length;
      await page.keyboard.press('1');
      await page.waitForURL(`${origin}/alpha/inbox`);
      await page.getByRole('button', { name: 'Alpha Workspace Menu' }).waitFor();
      assert.deepEqual([...new Set(since(mark).filter(item => item.path !== '/api/auth/accounts').map(item => item.account))], [1]);

      // Add an account…: Linear's login screen with Back and "Logged in as", then a third account.
      await (await openSwitchSubmenu('Alpha')).getByRole('menuitem', { name: 'Add an account…' }).click();
      await page.waitForURL(`${origin}/auth/add-account`);
      await page.getByRole('heading', { name: 'Add an account', exact: true }).waitFor();
      await page.getByText('sam@example.test', { exact: true }).waitFor();
      await page.getByText('Logged in as').waitFor();
      await page.screenshot({ path: `${output}/add-account-${width}.png` });
      await page.getByRole('button', { name: 'Log in with password' }).click();
      await page.getByPlaceholder('Username or email').fill('lee');
      await page.getByPlaceholder('Password').fill('lee-password');
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await page.waitForURL(`${origin}/delta/inbox`);
      await page.getByRole('button', { name: 'Delta Workspace Menu' }).waitFor();
      assert.deepEqual(loggedIn, [1, 2, 3]);
      const three = await openSwitchSubmenu('Delta');
      assert.deepEqual(clean(await three.getByRole('menuitem').allInnerTexts()), [
        'A Alpha 1', 'B Beta 2', 'G Gamma 3', 'D Delta 4', 'Create or join a workspace…', 'Add an account…',
      ]);
      await closeMenus();

      // Log out (Alt+Shift+Q) leaves only Lee; a remaining account's workspace opens.
      mark = requests.length;
      await page.keyboard.press('Alt+Shift+KeyQ');
      await page.waitForURL(`${origin}/alpha/inbox`);
      await page.getByRole('button', { name: 'Alpha Workspace Menu' }).waitFor();
      assert.deepEqual(since(mark).filter(item => item.path === '/api/auth/logout').map(item => item.account), [3]);
      assert.deepEqual(loggedIn, [1, 2]);
      const after = await openSwitchSubmenu('Alpha');
      assert.equal(await after.getByText('lee@example.test', { exact: true }).count(), 0);
      assert.equal(await after.getByRole('menuitem').count(), 5);
      await closeMenus();

      // The last account out lands on the login screen.
      await page.keyboard.press('Alt+Shift+KeyQ');
      await page.waitForURL(`${origin}/beta/inbox`);
      await page.getByRole('button', { name: 'Beta Workspace Menu' }).waitFor();
      await page.keyboard.press('Alt+Shift+KeyQ');
      await page.waitForURL(`${origin}/login`);
      await page.getByRole('heading', { name: 'Log in to Buyerly', exact: true }).waitFor();
      assert.deepEqual(loggedIn, []);
      assert.deepEqual(errors, []);
      console.log(`Multi-account: grouped switcher, switch with data and rights, late answer, add account and log out passed at ${width}px`);
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
