// Exercise the real App with a synthetic API: the workspace menu opens
// Settings → Members, invitations are sent, resent and revoked there, and
// Log out (menu item or Alt+Shift+Q) ends the session — all after Linear.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-members';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'members-team', name: 'Members Team', role: 'owner',
  badge_text: 'MT', badge_color: '', logo_url: '', is_active: true,
};
const owner = {
  username: 'owner', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'owner@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const scenarios = [
  { width: 1440, logout: 'menu' },
  { width: 390, logout: 'shortcut' },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, logout } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    let authenticated = true;
    let nextInviteId = 30;
    const invites = [
      { id: 21, email: 'waiting@example.test', role: 'buyer', status: 'pending', created_at: '2026-09-28T10:00:00Z' },
      { id: 22, email: null, role: 'viewer', status: 'pending', created_at: '2026-09-28T10:00:00Z' },
      { id: 23, email: 'gone@example.test', role: 'buyer', status: 'revoked', created_at: '2026-09-20T10:00:00Z' },
    ];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      const body = request.postDataJSON();
      if (verb !== 'GET') writes.push({ verb, path, body });
      if (verb === 'GET' && path === '/api/me') {
        return route.fulfill(authenticated ? { json: owner } : { status: 401, json: { detail: 'Not authenticated' } });
      }
      if (verb === 'POST' && path === '/api/auth/logout') {
        authenticated = false;
        return route.fulfill({ json: { status: 'ok' } });
      }
      if (verb === 'GET' && path === `/api/workspaces/${workspace.id}/members`) {
        return route.fulfill({ json: [
          { id: 1, user_id: 1, username: 'owner', full_name: 'Olga Owner', email: owner.email, avatar_url: '',
            role: 'owner', joined_at: '2026-09-02T10:00:00Z', is_current_user: true },
          { id: 2, user_id: 2, username: 'bob', full_name: 'Bob Buyer', email: 'bob@example.test', avatar_url: '',
            role: 'buyer', joined_at: '2026-09-25T10:00:00Z', is_current_user: false },
        ] });
      }
      if (verb === 'GET' && path === `/api/workspaces/${workspace.id}/invites`) {
        return route.fulfill({ json: invites });
      }
      if (verb === 'POST' && path === `/api/workspaces/${workspace.id}/invites`) {
        invites.unshift({ id: nextInviteId++, email: body.email, role: body.role, status: 'pending', created_at: '2026-09-30T10:00:00Z' });
        return route.fulfill({ json: invites[0] });
      }
      const resend = path.match(new RegExp(`^/api/workspaces/${workspace.id}/invites/(\\d+)/resend$`));
      if (verb === 'POST' && resend) {
        return route.fulfill({ json: { status: 'ok', message: 'Invite resent' } });
      }
      const revoke = path.match(new RegExp(`^/api/workspaces/${workspace.id}/invites/(\\d+)$`));
      if (verb === 'DELETE' && revoke) {
        invites.find(invite => invite.id === Number(revoke[1])).status = 'revoked';
        return route.fulfill({ json: { status: 'ok', message: 'Invite revoked' } });
      }
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
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    const assertNoOverflow = async () => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `members at ${width}px: document overflow`,
    );
    const table = page.getByRole('table', { name: 'Workspace members' });
    const row = (text) => table.getByRole('row').filter({ hasText: text });
    const openWorkspaceMenu = async () => {
      // Below 880px the workspace menu sits in the sidebar drawer, opened by Menu.
      // getAttribute waits for the header to render; isVisible would not.
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      if (width <= 880 && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      await page.getByRole('button', { name: `${workspace.name} Workspace Menu` }).click();
    };
    try {
      await page.goto(`${origin}/${workspace.slug}/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();

      // Workspace menu → Invite and manage members opens Settings → Members at its own address.
      await openWorkspaceMenu();
      await page.getByRole('menuitem', { name: 'Invite and manage members' }).click();
      await page.getByRole('heading', { name: 'Members', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, `/${workspace.slug}/settings/members`);
      await row('Bob Buyer').waitFor();
      assert.equal(await row('Olga Owner').getByText('Owner', { exact: true }).count(), 1);
      // Only personal invitations still waiting for someone are listed.
      await row('waiting@example.test').getByText('Buyer (Invited)', { exact: true }).waitFor();
      assert.equal(await row('gone@example.test').count(), 0);
      assert.equal(await table.getByText('Invited', { exact: false }).count() >= 1, true);
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/members-${width}.png`, fullPage: true });

      // Search narrows both groups by name or email.
      await page.getByRole('searchbox', { name: 'Search by name or email' }).fill('bob');
      assert.equal(await row('Olga Owner').count(), 0);
      await row('Bob Buyer').waitFor();
      await page.getByRole('searchbox', { name: 'Search by name or email' }).fill('');

      // Invite: one field, several comma-separated emails, one toast per email.
      await page.getByRole('button', { name: 'Invite', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Invite to your workspace' });
      await dialog.waitFor();
      await dialog.getByRole('textbox', { name: 'Email' }).fill('first@example.test, Second@Example.test');
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/invite-dialog-${width}.png` });
      await dialog.getByRole('button', { name: 'Send invites', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.deepEqual(writes.filter(write => write.path.endsWith('/invites')).map(write => write.body), [
        { email: 'first@example.test', role: 'buyer' },
        { email: 'second@example.test', role: 'buyer' },
      ]);
      await page.getByText('first@example.test has been notified by email to join Buyerly').waitFor();
      await row('second@example.test').waitFor();

      // Invited row menu: Resend invite, Revoke invite.
      await row('waiting@example.test').hover();
      await page.getByRole('button', { name: 'Invite actions for waiting@example.test' }).click();
      await page.getByRole('menuitem', { name: 'Resend invite' }).click();
      await page.getByText('waiting@example.test has been notified by email to join Buyerly').waitFor();
      await row('waiting@example.test').hover();
      await page.getByRole('button', { name: 'Invite actions for waiting@example.test' }).click();
      await page.getByRole('menuitem', { name: 'Revoke invite' }).click();
      await row('waiting@example.test').waitFor({ state: 'detached' });
      assert.deepEqual(
        writes.filter(write => /invites\/21/.test(write.path)).map(write => `${write.verb} ${write.path}`),
        [`POST /api/workspaces/${workspace.id}/invites/21/resend`, `DELETE /api/workspaces/${workspace.id}/invites/21`],
      );

      // Log out ends the session and lands on Linear's sign-in choices.
      await page.getByRole('link', { name: /Back to app/i }).click().catch(() => {});
      await page.goto(`${origin}/${workspace.slug}/inbox`);
      await page.getByText('No notifications', { exact: true }).waitFor();
      if (logout === 'menu') {
        await openWorkspaceMenu();
        await page.getByRole('menuitem', { name: 'Log out' }).click();
      } else {
        await page.keyboard.press('Alt+Shift+KeyQ');
      }
      await page.waitForURL('**/login');
      await page.getByRole('heading', { name: 'Log in to Buyerly', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Continue with email', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Log in with password', exact: true }).waitFor();
      assert.equal(writes.filter(write => write.path === '/api/auth/logout').length, 1);
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/login-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`Members: menu, invite, resend, revoke and ${logout} log out passed at ${width}px`);
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
