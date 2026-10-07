// Exercise the real App with a synthetic API: at Linear's small width (880px and
// below) the sidebar is a drawer over full-width content, opened by the header's
// Menu button or [, and closed by the backdrop, a swipe left or navigation.
// Settings navigation is the same drawer, and its fields stay inside 390px.
// Wider windows keep the desktop sidebar column (#191, #192); collapsed, it peeks over the content (#288).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-mobile-sidebar';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 1, slug: 'acme', name: 'Acme', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  username: 'phone', full_name: 'Pat Phone', first_name: 'Pat', last_name: 'Phone',
  email: 'pat@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const accounts = [{
  account_id: 'act_1', name: 'A deliberately long advertising account name', connection_type: 'facebook_login',
  currency: 'USD',
}];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [390, 768, 1024, 1440]) {
    const small = width <= 880;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: small, isMobile: small });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') return route.fulfill({ json: {} });
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: accounts });
      if (path === '/api/inbox/display') {
        return route.fulfill({ json: { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false } });
      }
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread: 0, priority_unread: 0, other_unread: 0 } });
      if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread: 0, hidden_by_filters: 0 } });
      if (path === '/api/inbox/facets') return route.fulfill({ json: { type: [], status: [], account: [], from: [] } });
      return route.fulfill({ json: [] });
    });
    const sidebar = page.locator('[data-sidebar-surface]');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    const settled = () => page.waitForTimeout(450);
    const isClosed = async (locator) => {
      const box = await locator.boundingBox();
      return box.x + box.width <= 0;
    };
    const isOpen = async (locator) => (await locator.boundingBox()).x === 0;
    const wrapper = page.locator('.sidebar-slot-wrapper');
    const backdrop = page.locator('.sidebar-backdrop').first();
    const isPeeking = async () => (await isOpen(sidebar)) && (await backdrop.getAttribute('data-open')) === 'true';
    const contentX = async () => Math.round((await page.locator('main.linear-floating-canvas').boundingBox()).x);
    const assertNoOverflow = async (label) => {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= width, `${label} overflows at ${width}px: ${scrollWidth}`);
    };
    const assertInside = async (locator, label) => {
      const box = await locator.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${label} leaves the ${width}px viewport: ${JSON.stringify(box)}`);
    };

    try {
      await page.goto(`${origin}/acme/inbox`);
      await sidebar.waitFor();
      await settled();
      if (!small) {
        // Desktop keeps the 244px column, [ collapses it and the header offers it back.
        assert.equal(await menu.count(), 0);
        assert.deepEqual(await sidebar.boundingBox(), { x: 0, y: 0, width: 244, height: 844 });
        await page.keyboard.press('[');
        await settled();
        assert.ok(await isClosed(sidebar));
        // A pointer click would first hover the button, which (as in Linear) opens
        // the peek over it at once; a bare click event tests the button itself.
        await page.getByRole('button', { name: 'Open sidebar' }).dispatchEvent('click');
        await settled();
        assert.ok(await isOpen(sidebar));
        assert.equal(Math.round((await wrapper.boundingBox()).width), 244);

        // Linear's peek (#288): the collapsed sidebar shows over the content, its column stays 8px.
        await page.mouse.move(width / 2, 400);
        await page.keyboard.press('[');
        await settled();
        await page.mouse.move(width / 2, 400);
        const collapsedContentX = await contentX();
        await page.keyboard.press('Control+Backslash');
        await settled();
        assert.ok(await isPeeking());
        assert.equal(await contentX(), collapsedContentX);
        assert.equal(Math.round((await wrapper.boundingBox()).width), 8);
        assert.equal(Math.round((await sidebar.boundingBox()).width), 244);
        const look = await sidebar.evaluate((element) => {
          const style = getComputedStyle(element);
          return { radius: style.borderTopRightRadius, background: style.backgroundColor, shadow: style.boxShadow };
        });
        assert.equal(look.radius, '12px');
        assert.notEqual(look.background, 'rgba(0, 0, 0, 0)');
        assert.notEqual(look.shadow, 'none');
        await page.screenshot({ path: `${output}/peek-${width}.png` });

        // Opened by ⌘\, the cursor moving over the backdrop leaves it open, as in Linear.
        await page.mouse.move(width / 2 + 40, 420);
        await page.waitForTimeout(100);
        assert.ok(await isPeeking());

        // The cursor on the sidebar keeps it (and makes it a hover peek); moving out to the backdrop closes it.
        await page.mouse.move(120, 400);
        await page.waitForTimeout(100);
        assert.ok(await isPeeking());
        await page.mouse.move(width / 2, 400);
        await settled();
        assert.ok(await isClosed(sidebar));
        assert.equal(await backdrop.getAttribute('data-open'), 'false');

        // The window's left edge opens it after 250ms.
        await page.mouse.move(3, 400);
        await page.waitForTimeout(150);
        assert.ok(await isClosed(sidebar));
        await page.waitForTimeout(700);
        assert.ok(await isPeeking());

        // Leaving the window closes it after 500ms.
        await page.mouse.move(120, 400);
        await page.evaluate(() => document.documentElement.dispatchEvent(
          new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }),
        ));
        await page.waitForTimeout(300);
        assert.ok(await isPeeking());
        await page.waitForTimeout(700);
        assert.ok(await isClosed(sidebar));

        // Entering the header's sidebar button opens it at once; ⌘\ / Ctrl+\ closes it.
        // A bare mouse move: Playwright's hover() rejects the peek covering the button.
        const toggleBox = await page.getByRole('button', { name: 'Open sidebar' }).boundingBox();
        await page.mouse.move(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
        await page.waitForTimeout(50);
        assert.equal(await backdrop.getAttribute('data-open'), 'true');
        await settled();
        assert.ok(await isPeeking());
        await page.mouse.move(120, 600);
        await page.keyboard.press('Control+Backslash');
        await settled();
        assert.ok(await isClosed(sidebar));

        // Navigation closes it.
        await page.keyboard.press('Control+Backslash');
        await settled();
        await sidebar.getByRole('button', { name: 'Rules', exact: true }).click();
        await page.waitForURL(`${origin}/acme/rules`);
        await settled();
        assert.ok(await isClosed(sidebar));

        // Dragging the resizer expands the column again.
        await page.keyboard.press('Control+Backslash');
        await settled();
        assert.ok(await isPeeking());
        await page.mouse.move(244, 400);
        await page.mouse.down();
        await page.mouse.move(280, 400);
        await page.mouse.move(300, 400);
        await page.mouse.up();
        await settled();
        assert.ok(await isOpen(sidebar));
        assert.equal(Math.round((await wrapper.boundingBox()).width), 300);
        assert.equal(await backdrop.getAttribute('data-open'), 'false');

        // ⌘\ does nothing while the column is expanded.
        await page.keyboard.press('Control+Backslash');
        await settled();
        assert.equal(await backdrop.getAttribute('data-open'), 'false');
        assert.equal(Math.round((await wrapper.boundingBox()).width), 300);

        await page.goto(`${origin}/acme/settings`);
        await page.getByRole('heading', { name: 'Preferences', exact: true }).waitFor();
        assert.ok(await isOpen(page.locator('.preferences-sidebar')));
        await assertNoOverflow('settings');
        await page.screenshot({ path: `${output}/settings-${width}.png` });
        assert.deepEqual(errors, []);
        console.log(`Mobile sidebar: desktop column, [, Open sidebar and the peek passed at ${width}px`);
        continue;
      }

      // Closed by default; the content fills the window and the header has Menu.
      assert.ok(await isClosed(sidebar));
      const content = await page.locator('main.linear-floating-canvas').boundingBox();
      assert.equal(content.x, 0);
      assert.equal(Math.round(content.width), width);
      await page.screenshot({ path: `${output}/start-${width}.png` });

      await menu.click();
      await settled();
      assert.ok(await isOpen(sidebar));
      assert.equal(Math.round((await sidebar.boundingBox()).width), Math.min(width - 40, 330));
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      await page.screenshot({ path: `${output}/drawer-${width}.png` });

      // A tap on the backdrop closes it and reaches nothing underneath.
      await page.touchscreen.tap(width - 10, 400);
      await settled();
      assert.ok(await isClosed(sidebar));
      assert.equal(new URL(page.url()).pathname, '/acme/inbox');

      // Navigation closes it.
      await menu.click();
      await settled();
      await sidebar.getByRole('button', { name: 'Rules', exact: true }).click();
      await page.waitForURL(`${origin}/acme/rules`);
      await settled();
      assert.ok(await isClosed(sidebar));
      assert.ok(await menu.isVisible());

      // A quick swipe to the left closes it.
      await menu.click();
      await settled();
      const touch = await context.newCDPSession(page);
      const finger = (type, x) => touch.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 300 }],
      });
      await finger('touchStart', 250);
      await finger('touchMove', 220);
      await finger('touchMove', 150);
      await finger('touchEnd');
      await settled();
      assert.ok(await isClosed(sidebar));

      // [ opens and closes the drawer instead of collapsing a column.
      await page.keyboard.press('[');
      await settled();
      assert.ok(await isOpen(sidebar));
      await page.keyboard.press('[');
      await settled();
      assert.ok(await isClosed(sidebar));
      // The desktop peek's ⌘\ leaves the drawer alone.
      await page.keyboard.press('Control+Backslash');
      await settled();
      assert.ok(await isClosed(sidebar));

      // Touch screens get Linear's 36px navigation rows.
      const row = await sidebar.locator('.linear-sidebar-nav-item').first().boundingBox();
      assert.equal(row.height, 36);

      for (const path of ['inbox', 'ads-manager/campaigns']) {
        await page.goto(`${origin}/acme/${path}`);
        await menu.waitFor();
        await assertNoOverflow(path);
        await page.screenshot({ path: `${output}/${path.replace('/', '-')}-${width}.png` });
      }

      // Settings: the same drawer, a header with Menu and "‹ Settings", fields inside the viewport.
      await page.goto(`${origin}/acme/settings`);
      await page.getByRole('heading', { name: 'Preferences', exact: true }).waitFor();
      const settingsNav = page.locator('.preferences-sidebar');
      await settled();
      assert.ok(await isClosed(settingsNav));
      await assertInside(page.getByRole('combobox', { name: 'Interface theme' }), 'Interface theme');
      await menu.click();
      await settled();
      assert.ok(await isOpen(settingsNav));
      await settingsNav.getByText('Profile', { exact: true }).click();
      await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
      await settled();
      assert.ok(await isClosed(settingsNav));
      await assertInside(page.getByRole('textbox', { name: 'Full name' }), 'Full name');
      await assertNoOverflow('settings');
      await page.screenshot({ path: `${output}/settings-profile-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.waitForURL((url) => !url.pathname.includes('/settings'));

      // Growing past 880px leaves the drawer closed when the window narrows again.
      await menu.click();
      await page.setViewportSize({ width: 1200, height: 844 });
      await settled();
      await page.setViewportSize({ width, height: 844 });
      await settled();
      assert.ok(await isClosed(sidebar));

      assert.deepEqual(errors, []);
      console.log(`Mobile sidebar: drawer, backdrop, navigation, swipe, [ and Settings passed at ${width}px`);
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
