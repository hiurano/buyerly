// Exercise the real App with a synthetic API: Settings → Profile as Linear has it
// (#368, read off linear.app on 2026-10-09). Profile picture, Email, Full name,
// Title and Username in one card, then Workspace access. Fields save on blur or
// Enter without a confirmation; a refused value stays in the field next to an
// error toast. The avatar uploads on click, and once set opens Change avatar /
// Remove avatar. Password lives in Security & access now.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-profile';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'profile-team', name: 'Profile Team', role: 'owner',
  badge_text: 'PT', badge_color: '', logo_url: '', is_active: true,
};
const initialUser = () => ({
  id: 1, username: 'olga', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner', title: '',
  email: 'owner@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
});
// A 1×1 PNG for the avatar upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
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
    const context = await browser.newContext({
      viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, colorScheme: 'dark',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    let user = initialUser();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: user });
      if (verb === 'GET' && path === `/api/workspaces/${workspace.id}/members`) {
        // The owner is alone, so Leave workspace is off.
        return route.fulfill({ json: [{ id: 1, username: 'olga', full_name: 'Olga Owner', role: 'owner', is_current_user: true }] });
      }
      if (verb === 'POST' && path === '/api/auth/update-profile') {
        const body = request.postDataJSON();
        writes.push(`POST update-profile ${JSON.stringify(body)}`);
        if (body.username !== undefined && !/^[A-Za-z0-9_.-]+$/.test(body.username)) {
          return route.fulfill({
            status: 400,
            json: { detail: 'The username can only contain alpha-numeric characters in addition to - _ and .' },
          });
        }
        user = { ...user, ...body };
        return route.fulfill({ json: { message: 'Profile updated', ...user } });
      }
      if (verb === 'POST' && path === '/api/onboarding/avatar') {
        writes.push('POST avatar');
        user = { ...user, avatar_url: '/uploads/avatars/avatar_1_test.png' };
        return route.fulfill({ json: { status: 'ok', avatar_url: user.avatar_url } });
      }
      if (verb === 'DELETE' && path === '/api/onboarding/avatar') {
        writes.push('DELETE avatar');
        user = { ...user, avatar_url: '' };
        return route.fulfill({ json: { status: 'ok', avatar_url: '' } });
      }
      if (verb === 'GET' && path === '/api/auth/sessions') return route.fulfill({ json: [] });
      if (verb === 'GET' && path === '/api/inbox') {
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/inbox/display') return route.fulfill({ json: {} });
      if (verb === 'GET' && path === '/api/audit-events') {
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups', '/api/auth/accounts'].includes(path)) {
        return route.fulfill({ json: [] });
      }
      // Settings reads the workspace teams (#371) for "Your teams" and the Members Teams column.
      if (verb === 'GET' && path.startsWith('/api/workspaces/') && path.endsWith('/teams')) return route.fulfill({ json: [] });
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    await page.route('**/uploads/avatars/**', route => route.fulfill({ contentType: 'image/png', body: PNG }));
    const card = page.locator('.preferences-card-container--divided');
    const field = (name) => page.getByRole('textbox', { name, exact: true });
    const toastAlert = page.getByRole('alert');
    const box = (locator) => locator.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    try {
      await page.goto(`${origin}/${workspace.slug}/settings/account/profile`);
      await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();

      // One card in Linear's order; Password is gone from Profile.
      const titles = await card.locator('.preferences-row-title').allTextContents();
      assert.deepEqual(titles.map(text => text.trim()), ['Profile picture', 'Email', 'Full name', 'Title', 'Username']);
      await card.getByText('Your job title or role', { exact: true }).waitFor();
      await card.getByText('One word, like a nickname or first name', { exact: true }).waitFor();
      assert.equal(await page.getByText('Password', { exact: true }).count(), 0);
      assert.equal(await field('Title').getAttribute('placeholder'), 'Software engineer');
      assert.equal(await field('Title').getAttribute('maxlength'), '128');
      assert.equal(await field('Username').inputValue(), 'olga');
      assert.equal(await field('Username').getAttribute('maxlength'), '40');

      // The avatar: a 32px circle with initials.
      const upload = page.getByRole('button', { name: 'Upload profile photo', exact: true });
      const avatarBox = await box(upload);
      assert.equal(Math.round(avatarBox.width), 32);
      assert.equal(Math.round(avatarBox.height), 32);
      assert.equal((await upload.textContent()).trim(), 'OO');

      // Workspace access: the sole owner cannot leave.
      await page.getByRole('heading', { name: 'Workspace access', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Leave workspace', exact: true }).isDisabled(), true);

      if (touch) {
        // On a phone every row stacks: the label over a full-width field.
        const label = await box(card.getByText('Title', { exact: true }));
        const input = await box(field('Title'));
        const cardBox = await box(card);
        assert.ok(input.y > label.y + label.height - 1, 'Title field sits under its label on a phone');
        assert.ok(input.width > cardBox.width - 40, 'Title field takes the card width on a phone');
        assert.ok(avatarBox.y > (await box(card.getByText('Profile picture', { exact: true }))).y, 'avatar under its label');
      } else {
        const label = await box(card.getByText('Title', { exact: true }));
        const input = await box(field('Title'));
        assert.ok(Math.abs((input.y + input.height / 2) - (label.y + label.height / 2)) < 16, 'Title field beside its label');
        assert.equal(Math.round(input.width), 180);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no overflow');
      await page.screenshot({ path: `${output}/profile-${width}.png`, fullPage: true });

      // Title saves on blur, with no toast.
      await field('Title').fill('Media buyer');
      await field('Title').blur();
      await page.waitForFunction(() => document.querySelector('[aria-label="Title"]').value === 'Media buyer');
      await page.waitForTimeout(200);
      assert.equal(await toastAlert.count(), 0);

      // An empty full name is refused before any request, and stays empty in the field.
      await field('Full name').fill('');
      await field('Full name').press('Enter');
      await toastAlert.filter({ hasText: 'Your full name cannot be empty.' }).waitFor();
      assert.equal(await field('Full name').inputValue(), '');
      // Escape puts the saved name back.
      await field('Full name').focus();
      await field('Full name').press('Escape');
      assert.equal(await field('Full name').inputValue(), 'Olga Owner');

      // A username the server refuses: Linear's toast, and the typed value stays.
      await field('Username').fill('bad name!');
      await field('Username').blur();
      const refused = toastAlert.filter({ hasText: 'Unable to update profile' });
      await refused.waitFor();
      await refused.getByText('The username can only contain alpha-numeric characters in addition to - _ and .').waitFor();
      assert.equal(await field('Username').inputValue(), 'bad name!');
      await field('Username').fill('olga.o');
      await field('Username').press('Enter');
      await page.waitForFunction(() => document.querySelector('[aria-label="Username"]').value === 'olga.o');

      // Upload, then the menu: Change avatar / Remove avatar; Remove takes effect at once.
      const chooser = page.waitForEvent('filechooser');
      await upload.click();
      await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
      const change = page.getByRole('button', { name: 'Change avatar', exact: true });
      await change.waitFor();
      await change.locator('img').waitFor();
      await change.click();
      const menu = page.getByRole('menu');
      assert.deepEqual(
        (await menu.getByRole('menuitem').allTextContents()).map(text => text.trim()),
        ['Change avatar', 'Remove avatar'],
      );
      await page.screenshot({ path: `${output}/avatar-menu-${width}.png` });
      await menu.getByRole('menuitem', { name: 'Remove avatar' }).click();
      await upload.waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);

      assert.deepEqual(writes, [
        'POST update-profile {"title":"Media buyer"}',
        'POST update-profile {"username":"bad name!"}',
        'POST update-profile {"username":"olga.o"}',
        'POST avatar',
        'DELETE avatar',
      ]);

      // Password: its own block in Security & access, after Sessions.
      await page.goto(`${origin}/${workspace.slug}/settings/account/security`);
      await page.getByRole('heading', { name: 'Password', exact: true }).waitFor();
      await page.getByText('Password set', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Change password', exact: true }).click();
      await page.getByRole('dialog', { name: 'Change password' }).waitFor();
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `${output}/security-password-${width}.png`, fullPage: true });

      assert.deepEqual(errors, []);
      console.log(`Profile: layout, saving, errors, avatar and password block passed at ${width}px`);
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
