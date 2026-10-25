// Exercise the real App with a synthetic API: Linear's bell on an ad account's
// page. For an account somebody else leads nothing is checked; a click saves
// the kinds at once, the choice is there on reopening, Esc closes and gives
// focus back to the bell, and a refused save puts the checkbox back.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-account-bell';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'bell-team', name: 'Bell Team', role: 'buyer',
  badge_text: 'BT', badge_color: '', logo_url: '', is_active: true,
};
const buyer = {
  id: 2, username: 'buyer', full_name: 'Boris Buyer', first_name: 'Boris', last_name: 'Buyer',
  email: 'buyer@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
// Led by somebody else, so by Inbox's own rule none of its events are the buyer's.
const account = {
  id: 11, account_id: 'act_1001', name: 'Nutra US', currency: 'USD', lead_user_id: 1, active_rules: [],
  connection_type: 'system_user', is_active: true, account_status: 1, status_label: 'Active', rules_enabled: true,
};

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    await mockSync(page);
    page.setDefaultTimeout(10_000);
    const errors = [];
    const saves = [];
    let kinds = [];
    let refuse = false;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/health/live', route => route.fulfill({ json: { status: 'alive', version: 'local' } }));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      if (path === `/api/accounts/${account.account_id}/notifications`) {
        if (verb === 'PUT') {
          saves.push(request.postDataJSON().kinds);
          if (refuse) return route.fulfill({ status: 500, json: { detail: 'Database is down' } });
          kinds = request.postDataJSON().kinds;
          return route.fulfill({ json: { account_id: account.account_id, kinds, custom: true } });
        }
        return route.fulfill({ json: { account_id: account.account_id, kinds, custom: saves.length > 0 } });
      }
      if (verb !== 'GET') {
        errors.push(`Unexpected API request: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: buyer });
      if (path === '/api/accounts') return route.fulfill({ json: [account] });
      if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
      if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
      if (path === '/api/audit-events') {
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
      // Members, teams, rules and analytics around the page have nothing to show here.
      return route.fulfill({ json: path === '/api/inbox/display' ? {} : [] });
    });

    const bell = page.getByRole('button', { name: 'Setup ad account notifications' });
    const popover = page.getByRole('dialog', { name: 'Ad account notifications' });
    const checked = () => popover.getByRole('checkbox').evaluateAll(
      boxes => boxes.filter(box => box.checked).map(box => box.id.replace('buyerly-bell-', '')),
    );
    try {
      await page.goto(`${origin}/${workspace.slug}/accounts/${account.account_id}`);
      await page.getByRole('heading', { name: account.name }).first().waitFor();
      await bell.click();
      await popover.getByText('Send inbox notifications for', { exact: false }).waitFor();
      assert.equal(await popover.getByText(account.name, { exact: true }).count(), 1);
      assert.equal(await popover.getByRole('checkbox').count(), 6, 'one checkbox per kind, Team has no account');
      assert.deepEqual(await checked(), [], 'nothing of an account somebody else leads');
      assert.equal(await bell.getAttribute('aria-expanded'), 'true');

      // A click on the words saves at once.
      await popover.getByText('An error or a problem with the ad account', { exact: true }).click();
      await popover.getByRole('checkbox', { name: 'A rule sends an alert' }).check();
      await page.waitForTimeout(200);
      assert.deepEqual(saves, [['urgent'], ['urgent', 'rule_alerts']]);
      assert.deepEqual(await checked(), ['urgent', 'rule_alerts']);
      await page.screenshot({ path: `${output}/bell-${scheme}.png` });

      // Esc closes and focus goes back to the bell; reopening keeps the choice.
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'detached' });
      assert.equal(await bell.evaluate(element => element === document.activeElement), true);
      await page.reload();
      await page.getByRole('heading', { name: account.name }).first().waitFor();
      await bell.click();
      await popover.waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.buyerly-bell-box input:checked').length === 2);

      // A refused save puts the box back and says so.
      refuse = true;
      await popover.getByRole('checkbox', { name: 'A rule sends an alert' }).click();
      await page.getByText("Couldn't save notification settings", { exact: true }).waitFor();
      assert.deepEqual(await checked(), ['urgent', 'rule_alerts']);

      // A click outside closes it.
      await page.mouse.click(700, 500);
      await popover.waitFor({ state: 'detached' });

      assert.deepEqual(errors, []);
      console.log(`Ad account bell (${scheme}): nothing by default for another's account, saves each click, keeps it, undoes a refused save`);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${scheme}.png`, fullPage: true });
      console.error(errors, saves);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
