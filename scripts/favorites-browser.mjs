// Exercise the real App with a synthetic API: Favorites, as Linear's. The star
// beside a page's title (or Alt+F) adds the page to the sidebar's Favorites and
// takes it out again; the sidebar lights one row only, a favorite only where no
// row of its own shows the page; O then F lists the favorites under
// "Navigation", and a favorite's number opens it.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-favorites';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'star-team', name: 'Star Team', role: 'owner',
  badge_text: 'ST', badge_color: '', logo_url: '', is_active: true,
};
const owner = {
  id: 1, username: 'owner', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'owner@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = {
  id: 11, account_id: 'act_1001', name: 'Nutra US', currency: 'USD', lead_user_id: 1, active_rules: [],
  connection_type: 'system_user', is_active: true, account_status: 1, status_label: 'Active', rules_enabled: true,
};

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  const favorites = [];
  let nextId = 1;
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/health/live', route => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const verb = request.method();
    if (path === '/api/favorites' && verb === 'GET') return route.fulfill({ json: { favorites } });
    if (path === '/api/favorites' && verb === 'POST') {
      const input = request.postDataJSON();
      const item = { id: nextId++, position: favorites.length + 1, ...input };
      favorites.push(item);
      return route.fulfill({ status: 201, json: item });
    }
    if (path.startsWith('/api/favorites/') && verb === 'DELETE') {
      const index = favorites.findIndex(item => item.id === Number(path.split('/').pop()));
      if (index >= 0) favorites.splice(index, 1);
      return route.fulfill({ status: 204, body: '' });
    }
    if (verb !== 'GET') {
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: owner });
    if (path === '/api/accounts') return route.fulfill({ json: [account] });
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/audit-events') {
      return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
    }
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    // The pages around the star (members, teams, presets, analytics) have nothing to show here.
    return route.fulfill({ json: path === '/api/inbox/display' ? {} : [] });
  });

  const sidebar = page.locator('.app-sidebar');
  const lit = () => sidebar.locator('.buyerly-sidebar-nav-item[data-active="true"]').evaluateAll(
    rows => rows.map(row => row.textContent.trim()),
  );
  const star = page.locator('.buyerly-favorite-button');
  const starred = async () => (await star.getAttribute('aria-pressed')) === 'true';
  const waitFavorites = async (count) => {
    const deadline = Date.now() + 5000;
    while (favorites.length !== count) {
      assert.ok(Date.now() < deadline, `expected ${count} favorites, have ${favorites.length}`);
      await page.waitForTimeout(50);
    }
  };

  try {
    // Ad accounts, starred from its header: it joins Favorites, but the Workspace row stays the one lit.
    await page.goto(`${origin}/${workspace.slug}/accounts`);
    await page.waitForSelector('.app-shell');
    assert.equal(await sidebar.getByText('Favorites', { exact: true }).count(), 0, 'no Favorites before a star');
    assert.equal(await starred(), false);
    await star.click();
    await waitFavorites(1);
    assert.deepEqual(favorites.map(item => [item.kind, item.path]), [['page', 'accounts']]);
    await sidebar.getByText('Favorites', { exact: true }).waitFor();
    assert.equal(await starred(), true);
    assert.deepEqual(await lit(), ['Ad accounts'], 'one row lit on Ad accounts');
    assert.equal(await sidebar.locator('.buyerly-sidebar-nav-item', { hasText: 'Ad accounts' }).count(), 2);

    // An ad account's page: nothing of the sidebar's own lights; Alt+F stars it and its favorite lights.
    await page.goto(`${origin}/${workspace.slug}/accounts/${account.account_id}`);
    await page.getByRole('heading', { name: account.name }).first().waitFor();
    assert.deepEqual(await lit(), [], "an account's page lights no row of the sidebar's own");
    await page.locator('body').click({ position: { x: 900, y: 600 } });
    await page.keyboard.press('Alt+KeyF');
    await waitFavorites(2);
    assert.equal(favorites[1].path, `accounts/${account.account_id}`);
    await sidebar.locator('.buyerly-sidebar-nav-item', { hasText: account.name }).waitFor();
    assert.deepEqual(await lit(), [account.name], 'the favorite lights on its own page');

    // O then F: the favorites under Navigation with their numbers; 1 opens the first.
    await page.keyboard.press('o');
    await page.keyboard.press('f');
    const field = page.getByPlaceholder('Open favorite…');
    await field.waitFor();
    await page.getByText('Navigation', { exact: true }).waitFor();
    const rows = page.locator('[cmdk-item]');
    assert.deepEqual(
      await rows.evaluateAll(items => items.map(item => [item.getAttribute('aria-label'), item.querySelector('kbd')?.textContent])),
      [['Ad accounts', '1'], [account.name, '2']],
    );
    await page.screenshot({ path: `${output}/open-favorite.png` });
    await field.fill('nut');
    assert.deepEqual(await rows.evaluateAll(items => items.map(item => item.getAttribute('aria-label'))), [account.name]);
    await field.fill('');
    await page.keyboard.press('1');
    await page.waitForURL(`${origin}/${workspace.slug}/accounts`);
    await field.waitFor({ state: 'detached' });

    // Alt+F again takes the page out; Favorites keeps the account.
    await page.keyboard.press('Alt+KeyF');
    await waitFavorites(1);
    assert.equal(await starred(), false);
    assert.equal(await sidebar.locator('.buyerly-sidebar-nav-item', { hasText: 'Ad accounts' }).count(), 1);
    await sidebar.locator('.buyerly-sidebar-nav-item', { hasText: account.name }).waitFor();
    await page.screenshot({ path: `${output}/favorites.png` });

    // The command menu opens with the page's star, as Linear's "Favorite team".
    await page.keyboard.press('Control+K');
    const menu = page.getByRole('dialog', { name: 'Command menu' });
    assert.equal(await menu.getByRole('option').first().getAttribute('aria-label'), 'Favorite page');
    await page.keyboard.press('Enter');
    await waitFavorites(2);
    assert.equal(await starred(), true);

    assert.deepEqual(errors, []);
    console.log('Favorites: star, Alt+F and the command menu add and remove, one sidebar row lit, O then F opens by number');
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(errors, favorites);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
