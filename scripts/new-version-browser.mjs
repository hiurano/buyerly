// Exercise the real App with a synthetic API: a tab built from one release asks
// /health/live which release the server runs. While they match, or while the
// server is down mid-deploy, nothing shows; once they differ, one "Update
// available" notice with Reload appears, never over an open dialog, and Reload
// loads the page again (#303).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-new-version';
await mkdir(output, { recursive: true });
// vite.config.ts bakes this into the bundle as the release the tab runs.
const BUILD = 'release-a';
const NEXT = 'release-b';
process.env.APP_VERSION = BUILD;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'release-team', name: 'Release Team', role: 'owner',
  badge_text: 'RT', badge_color: '', logo_url: '', is_active: true,
};
const owner = {
  username: 'owner', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'owner@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const scenarios = [
  { width: 1440, touch: false },
  { width: 390, touch: true },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, touch } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    // What /health/live answers: the release, or 'down' / 'broken' while a deploy restarts the API.
    let health = BUILD;
    let healthRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/health/live', async route => {
      healthRequests += 1;
      if (health === 'down') return route.abort('connectionrefused');
      if (health === 'broken') return route.fulfill({ status: 502, body: '<html>Bad gateway</html>' });
      return route.fulfill({ json: { status: 'alive', version: health } });
    });
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      if (verb !== 'GET') writes.push(`${verb} ${path}`);
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: owner });
      if (verb === 'GET' && path === '/api/inbox') {
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/inbox/display') return route.fulfill({ json: {} });
      if (verb === 'GET' && path === '/api/auth/sessions') return route.fulfill({ json: [] });
      if (verb === 'GET' && path === '/api/audit-events') {
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups'].includes(path)) {
        return route.fulfill({ json: [] });
      }
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    const notice = page.getByText('Update available', { exact: true });
    // The tab coming back into view is one of the moments it asks the server.
    const returnToTab = async () => {
      const before = healthRequests;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const deadline = Date.now() + 5000;
      while (healthRequests === before) {
        assert.ok(Date.now() < deadline, `new version at ${width}px: /health/live was not asked`);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(300);
    };
    try {
      await page.goto(`${origin}/${workspace.slug}/settings`);
      await page.waitForSelector('.app-shell');
      // The tab does not ask on load: index.html is never cached, so it is already current.
      assert.equal(healthRequests, 0);

      // Same release: nothing to say.
      await returnToTab();
      assert.equal(await notice.count(), 0, 'no notice on the current release');

      // The API is down or behind a failing proxy while the deploy restarts it: no notice, no error.
      health = 'down';
      await returnToTab();
      health = 'broken';
      await returnToTab();
      assert.equal(await notice.count(), 0, 'no notice while the server is unavailable');

      // A newer release while the command menu is open: the notice waits until it closes.
      health = NEXT;
      await page.keyboard.press('Control+K');
      await page.getByRole('dialog').first().waitFor();
      await returnToTab();
      await page.waitForTimeout(1000);
      assert.equal(await notice.count(), 0, 'the notice does not cover an open dialog');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').first().waitFor({ state: 'detached' });
      await notice.waitFor();
      await page.getByText('A new version of Buyerly is available.', { exact: true }).waitFor();

      // It stays put (it is not a passing toast) and never repeats: once found, the tab stops asking.
      await page.waitForTimeout(9000);
      const asked = healthRequests;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(500);
      assert.equal(healthRequests, asked, 'no more checks after the notice');
      assert.equal(await notice.count(), 1, 'exactly one notice');
      await page.screenshot({ path: `${output}/notice-${width}.png`, fullPage: true });

      // Reload is the only thing that reloads: the page loads again, and the notice is gone.
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name: 'Reload', exact: true }).click(),
      ]);
      await page.waitForSelector('.app-shell');
      assert.equal(await notice.count(), 0, 'the reloaded page starts clean');

      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      console.log(`New version notice: silent when current or down, waits for the dialog, shows once, reloads at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${width}.png`, fullPage: true });
      console.error(errors, writes);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
