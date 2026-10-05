// Exercise the real App with a synthetic API: Settings → Security & access lists
// this browser and the other sessions as Linear does, Revoke ends one, Revoke all
// ends every other one, and Log out on this browser signs out like the menu (#226).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-security';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'security-team', name: 'Security Team', role: 'owner',
  badge_text: 'ST', badge_color: '', logo_url: '', is_active: true,
};
const owner = {
  username: 'owner', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'owner@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const HOUR = 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
// The sessions on Linear's own screen (2026-10-03), so the two can be compared side by side.
const initialSessions = () => [
  {
    id: 'current-session', current: true, ip_address: '203.0.113.10',
    user_agent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36',
    created_at: '2026-09-29T20:48:00Z', expires_at: ago(-24 * HOUR), last_seen_at: ago(0),
  },
  {
    id: 'linux-session', current: false, ip_address: '203.0.113.11',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Safari/537.36',
    created_at: '2026-09-28T09:15:00Z', expires_at: ago(-20 * HOUR), last_seen_at: ago(14 * HOUR),
  },
  {
    id: 'firefox-session', current: false, ip_address: '203.0.113.12',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    created_at: '2026-09-27T08:00:00Z', expires_at: ago(-10 * HOUR), last_seen_at: ago(2 * 24 * HOUR),
  },
  {
    id: 'unplaced-session', current: false, ip_address: '',
    user_agent: 'curl/8.5.0',
    created_at: '2026-09-26T08:00:00Z', expires_at: ago(-5 * HOUR), last_seen_at: ago(4 * 24 * HOUR),
  },
  // Beyond Linear's screen: enough sessions for "Show all", one of them gone over a month.
  {
    id: 'mac-session', current: false, ip_address: '203.0.113.13',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    created_at: '2026-09-20T08:00:00Z', expires_at: ago(-30 * HOUR), last_seen_at: ago(3 * HOUR),
  },
  {
    id: 'edge-session', current: false, ip_address: '203.0.113.14',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Safari/537.36 Edg/129.0.2792.65',
    created_at: '2026-09-18T08:00:00Z', expires_at: ago(-30 * HOUR), last_seen_at: ago(5 * 24 * HOUR),
  },
  {
    id: 'stale-session', current: false, ip_address: '203.0.113.15',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    created_at: '2026-08-01T08:00:00Z', expires_at: ago(-30 * HOUR), last_seen_at: ago(40 * 24 * HOUR),
  },
];
// Most recently seen first, as Linear orders the other sessions.
const othersInOrder = ['mac-session', 'linux-session', 'firefox-session', 'unplaced-session', 'edge-session', 'stale-session'];
// The phone has no hover, so Revoke must be visible without it.
const scenarios = [
  { width: 1440, touch: false, entry: 'nav' },
  { width: 1024, touch: false, entry: 'nav' },
  { width: 768, touch: false, entry: 'address' },
  { width: 390, touch: true, entry: 'address' },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, touch, entry } of scenarios) {
    // The phone is dark, like the Linear screenshot it is compared with.
    const context = await browser.newContext({
      viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, colorScheme: touch ? 'dark' : 'light',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    let authenticated = true;
    let sessions = initialSessions();
    let failNextRevoke = true;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      if (verb !== 'GET') writes.push(`${verb} ${path}${url.search}`);
      if (verb === 'GET' && path === '/api/me') {
        return route.fulfill(authenticated ? { json: owner } : { status: 401, json: { detail: 'Not authenticated' } });
      }
      if (verb === 'GET' && path === '/api/auth/sessions') return route.fulfill({ json: sessions });
      const one = path.match(/^\/api\/auth\/sessions\/([\w-]+)$/);
      if (verb === 'DELETE' && one) {
        // The first Revoke fails, so the list must come back with the row in it.
        if (failNextRevoke) {
          failNextRevoke = false;
          return route.fulfill({ status: 500, json: { detail: 'Database is busy' } });
        }
        sessions = sessions.filter(session => session.id !== one[1]);
        return route.fulfill({ json: { message: 'Session ended' } });
      }
      if (verb === 'POST' && path === '/api/auth/logout-all') {
        assert.equal(url.searchParams.get('keep_current'), 'true');
        sessions = sessions.filter(session => session.current);
        return route.fulfill({ json: { message: 'Other sessions ended' } });
      }
      if (verb === 'POST' && path === '/api/auth/logout') {
        authenticated = false;
        return route.fulfill({ json: { message: 'Signed out' } });
      }
      if (verb === 'GET' && path === '/api/inbox') {
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/inbox/display') return route.fulfill({ json: {} });
      if (verb === 'GET' && path === '/api/audit-events') {
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups'].includes(path)) {
        return route.fulfill({ json: [] });
      }
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    const assertNoOverflow = async () => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `security at ${width}px: document overflow`,
    );
    const sessionRow = (id) => page.locator(`[data-session-id="${id}"]`);
    const revokeButton = (id) => sessionRow(id).getByRole('button', { name: /^Revoke / });
    const othersHeading = page.locator('.preferences-sessions-others');
    try {
      if (entry === 'nav') {
        await page.goto(`${origin}/${workspace.slug}/settings`);
        await page.getByRole('link', { name: 'Security & access' }).click();
      } else {
        await page.goto(`${origin}/${workspace.slug}/settings/account/security`);
      }
      await page.getByRole('heading', { name: 'Security & access', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, `/${workspace.slug}/settings/account/security`);
      await page.getByRole('heading', { name: 'Sessions', exact: true }).waitFor();
      await page.getByText('Devices logged into your account', { exact: true }).waitFor();

      // This browser first: "Chrome on Android", green "Current session", Log out.
      const current = sessionRow('current-session');
      await current.getByText('Chrome on Android', { exact: true }).waitFor();
      assert.equal((await current.locator('.preferences-session-desc').textContent()).trim(), 'Current session');
      await current.getByRole('button', { name: 'Log out', exact: true }).waitFor();
      const firstRow = await page.locator('[data-session-id]').first().getAttribute('data-session-id');
      assert.equal(firstRow, 'current-session');

      // Then a card headed "6 other sessions" with Revoke all, the most recently seen
      // first, five of them until "Show all".
      const othersCard = page.getByRole('region', { name: 'Other sessions' });
      assert.equal((await othersHeading.locator('span').first().textContent()).trim(), '6 other sessions');
      await othersHeading.getByRole('button', { name: 'Revoke all', exact: true }).waitFor();
      const otherIds = () => othersCard.locator('[data-session-id]').evaluateAll(rows => rows.map(row => row.dataset.sessionId));
      assert.deepEqual(await otherIds(), othersInOrder.slice(0, 5));
      await othersCard.getByRole('button', { name: 'Show all', exact: true }).click();
      assert.deepEqual(await otherIds(), othersInOrder);
      assert.equal(await othersCard.getByRole('button', { name: 'Show all' }).count(), 0);
      const desc = async (id) => (await sessionRow(id).locator('.preferences-session-desc').textContent()).trim();
      await sessionRow('linux-session').getByText('Chrome on Linux', { exact: true }).waitFor();
      assert.equal(await desc('linux-session'), 'Last seen about 14 hours ago');
      await sessionRow('firefox-session').getByText('Firefox on Linux', { exact: true }).waitFor();
      assert.equal(await desc('firefox-session'), 'Last seen 2 days ago');
      await sessionRow('unplaced-session').getByText('Unknown device', { exact: true }).waitFor();
      assert.equal(await desc('unplaced-session'), 'Last seen 4 days ago');
      // A session gone over a month is dimmed; the others are not.
      assert.equal(await sessionRow('stale-session').getAttribute('data-old'), 'true');
      assert.equal(await sessionRow('linux-session').getAttribute('data-old'), null);
      // Each tile carries the browser's mark; an unknown browser gets a globe.
      assert.equal(await sessionRow('firefox-session').locator('.preferences-session-icon svg').count(), 1);

      // Revoke and Log out show on hover on a desktop; on a phone they are always there.
      const opacity = (locator) => locator.evaluate(node => getComputedStyle(node).opacity);
      const logOutButton = current.getByRole('button', { name: 'Log out', exact: true });
      if (touch) {
        assert.equal(await opacity(revokeButton('linux-session')), '1');
        assert.equal(await opacity(logOutButton), '1');
      } else {
        await page.mouse.move(0, 0);
        assert.equal(await opacity(revokeButton('linux-session')), '0');
        assert.equal(await opacity(logOutButton), '0');
        await sessionRow('linux-session').hover();
        await page.waitForFunction(() => getComputedStyle(
          document.querySelector('[data-session-id="linux-session"] .preferences-session-button--on-hover'),
        ).opacity === '1');
      }
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/sessions-${width}.png`, fullPage: true });

      // A click on a session opens Linear's details: Device, IP address, Original sign in
      // (the date alone) and a red Revoke Access ("Revoke" on a phone) that takes focus.
      await sessionRow('firefox-session').getByRole('button', { name: /^Firefox on Linux/ }).click();
      const details = page.getByRole('dialog', { name: 'Firefox on Linux' });
      await details.waitFor();
      await details.getByText('203.0.113.12', { exact: true }).waitFor();
      await details.getByText('Original sign in', { exact: true }).waitFor();
      await details.getByText('Sep 27, 2026', { exact: true }).waitFor();
      const detailsAction = details.getByRole('button', { name: touch ? 'Revoke' : 'Revoke Access', exact: true });
      await detailsAction.waitFor();
      assert.equal(await detailsAction.evaluate(node => node === document.activeElement), true);
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/session-details-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape');
      await details.waitFor({ state: 'detached' });

      // Every revoke is confirmed first; Cancel changes nothing.
      const confirmation = page.getByRole('dialog', { name: 'Revoke access' });
      if (!touch) {
        // A right click offers View details and Revoke, as in Linear.
        await sessionRow('linux-session').locator('.preferences-session-main').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'View details' }).waitFor();
        await page.getByRole('menuitem', { name: 'Revoke' }).click();
      } else {
        await revokeButton('linux-session').click();
      }
      await confirmation.getByText('Revoke access to "Chrome on Linux"?', { exact: true }).waitFor();
      assert.equal(await confirmation.getByRole('button', { name: 'Revoke', exact: true })
        .evaluate(node => node === document.activeElement), true);
      await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
      await confirmation.waitFor({ state: 'detached' });
      assert.deepEqual(writes, []);

      // A failed Revoke says so, in Linear's words, and leaves the session in place.
      if (!touch) await sessionRow('linux-session').hover();
      await revokeButton('linux-session').click();
      await confirmation.getByRole('button', { name: 'Revoke', exact: true }).click();
      await page.getByText('Session could not be revoked', { exact: true }).waitFor();
      await sessionRow('linux-session').getByText('Chrome on Linux', { exact: true }).waitFor();

      // Revoke from the details ends that one session only and closes them.
      await sessionRow('linux-session').locator('.preferences-session-main').click();
      const linuxDetails = page.getByRole('dialog', { name: 'Chrome on Linux' });
      await linuxDetails.getByRole('button', { name: touch ? 'Revoke' : 'Revoke Access', exact: true }).click();
      await confirmation.getByRole('button', { name: 'Revoke', exact: true }).click();
      await sessionRow('linux-session').waitFor({ state: 'detached' });
      await linuxDetails.waitFor({ state: 'detached' });
      await page.getByText('Revoked session successfully', { exact: true }).first().waitFor();
      await page.waitForFunction(() => document.querySelector('.preferences-sessions-others')?.textContent?.startsWith('5 other sessions'));
      await sessionRow('firefox-session').waitFor();

      // Revoke all, once confirmed, ends every other session and keeps this one.
      await othersHeading.getByRole('button', { name: 'Revoke all', exact: true }).click();
      await confirmation.getByText('Revoke all other sessions? This cannot be undone.', { exact: true }).waitFor();
      await confirmation.getByRole('button', { name: 'Revoke', exact: true }).click();
      await page.getByText('You have been logged out of all other sessions.', { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('.preferences-sessions-others')?.textContent?.trim() === 'No sessions');
      assert.equal(await page.locator('[data-session-id]').count(), 1);
      await current.getByText('Current session', { exact: true }).waitFor();
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/only-current-${width}.png`, fullPage: true });

      // Log out on this browser asks first, then signs out like the menu.
      if (!touch) await current.hover();
      await logOutButton.click();
      const logOutConfirmation = page.getByRole('dialog', { name: 'Log out?' });
      await logOutConfirmation.getByText('You will be logged out from this session', { exact: true }).waitFor();
      await logOutConfirmation.getByRole('button', { name: 'Log out', exact: true }).click();
      await page.waitForURL('**/login');
      await page.getByRole('heading', { name: 'Log in to Buyerly', exact: true }).waitFor();

      assert.deepEqual(writes, [
        'DELETE /api/auth/sessions/linux-session',
        'DELETE /api/auth/sessions/linux-session',
        'POST /api/auth/logout-all?keep_current=true',
        'POST /api/auth/logout',
      ]);
      assert.deepEqual(errors, []);
      console.log(`Security & access: list, details, confirmations, revoke, revoke all and log out passed at ${width}px`);
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
