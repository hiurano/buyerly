// Exercise the real App with a synthetic API: the workspace menu opens
// Settings → Members, invitations are sent, resent and revoked there, another
// member's role is changed and a member removed, the account leaves the
// workspace (an owner transfers ownership first) from its row or from Profile,
// and Log out (menu item or Alt+Shift+Q) ends the session — all after Linear.
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
const baseWorkspace = {
  id: 7, slug: 'members-team', name: 'Members Team', role: 'owner',
  badge_text: 'MT', badge_color: '', logo_url: '', is_active: true,
};
// Where the app lands once the account has left Members Team.
const nextWorkspace = {
  id: 8, slug: 'next-team', name: 'Next Team', role: 'owner',
  badge_text: 'NT', badge_color: '', logo_url: '', is_active: false,
};
const scenarios = [
  // The owner leaves from Profile → Workspace access and hands ownership to Bob first.
  { width: 1440, logout: 'menu', role: 'owner', leaveFrom: 'profile' },
  // An admin leaves from the menu on their own row with a plain confirmation.
  { width: 390, logout: 'shortcut', role: 'admin', leaveFrom: 'row' },
];
const member = (user_id, full_name, role, joined_at, extra = {}) => ({
  id: user_id, user_id, username: full_name.split(' ')[0].toLowerCase(), full_name,
  email: `${full_name.split(' ')[0].toLowerCase()}@example.test`, avatar_url: '', role, joined_at,
  is_current_user: false, ...extra,
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, logout, role, leaveFrom } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    let authenticated = true;
    let left = false;
    let nextInviteId = 30;
    const workspace = { ...baseWorkspace, role };
    const members = [
      member(1, 'Olga Self', role, '2026-09-02T10:00:00Z', { is_current_user: true }),
      ...(role === 'owner' ? [] : [member(5, 'Oscar Owner', 'owner', '2026-09-01T10:00:00Z')]),
      member(4, 'Adam Admin', 'admin', '2026-09-10T10:00:00Z'),
      member(2, 'Bob Buyer', 'buyer', '2026-09-25T10:00:00Z'),
      member(3, 'Vera Viewer', 'viewer', '2026-09-26T10:00:00Z'),
    ];
    const me = () => ({
      username: 'olga', full_name: 'Olga Self', first_name: 'Olga', last_name: 'Self',
      email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
      onboarding_completed: true, onboarding_step: 'completed',
      active_workspace: left ? { ...nextWorkspace, is_active: true } : workspace,
      workspaces: left ? [{ ...nextWorkspace, is_active: true }] : [workspace],
    });
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
        return route.fulfill(authenticated ? { json: me() } : { status: 401, json: { detail: 'Not authenticated' } });
      }
      if (verb === 'POST' && path === '/api/auth/logout') {
        authenticated = false;
        return route.fulfill({ json: { status: 'ok' } });
      }
      if (verb === 'GET' && path === `/api/workspaces/${workspace.id}/members`) {
        return route.fulfill({ json: members });
      }
      const memberPath = path.match(new RegExp(`^/api/workspaces/${workspace.id}/members/(\\d+)$`));
      if (memberPath) {
        const index = members.findIndex(item => item.user_id === Number(memberPath[1]));
        if (verb === 'PATCH') {
          members[index] = { ...members[index], role: body.role };
          return route.fulfill({ json: members[index] });
        }
        if (verb === 'DELETE') {
          members.splice(index, 1);
          return route.fulfill({ json: { status: 'ok', message: 'Member removed from the workspace' } });
        }
      }
      if (verb === 'POST' && path === `/api/workspaces/${workspace.id}/transfer-ownership`) {
        members.find(item => item.user_id === body.new_owner_user_id).role = 'owner';
        members[0].role = 'admin';
        workspace.role = 'admin';
        return route.fulfill({ json: { status: 'ok', message: 'Ownership transferred', new_owner_user_id: body.new_owner_user_id } });
      }
      if (verb === 'POST' && path === `/api/workspaces/${workspace.id}/leave`) {
        if (workspace.role === 'owner') {
          return route.fulfill({ status: 400, json: { detail: 'The owner cannot leave the workspace. Transfer ownership or delete the workspace.' } });
        }
        left = true;
        return route.fulfill({ json: { status: 'ok', message: 'You have left the workspace', next_workspace_id: nextWorkspace.id } });
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
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups'].includes(path)) {
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
    const openWorkspaceMenu = async (name = workspace.name) => {
      // Below 880px the workspace menu sits in the sidebar drawer, opened by Menu.
      // getAttribute waits for the header to render; isVisible would not.
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      if (width <= 880 && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      await page.getByRole('button', { name: `${name} Workspace Menu` }).click();
    };
    const rowAction = (name) => page.getByRole('button', { name: `Member actions for ${name}` });
    const openRowMenu = async (name) => {
      await row(name).hover();
      await rowAction(name).click();
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
      assert.equal(await row('Olga Self').getByText(role === 'owner' ? 'Owner' : 'Admin', { exact: true }).count(), 1);
      // Only personal invitations still waiting for someone are listed.
      await row('waiting@example.test').getByText('Buyer (Invited)', { exact: true }).waitFor();
      assert.equal(await row('gone@example.test').count(), 0);
      assert.equal(await table.getByText('Invited', { exact: false }).count() >= 1, true);
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/members-${width}.png`, fullPage: true });

      // Search narrows both groups by name or email.
      await page.getByRole('searchbox', { name: 'Search by name or email' }).fill('bob');
      assert.equal(await row('Olga Self').count(), 0);
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

      // Nobody manages the owner, and only the owner manages an admin.
      assert.equal(await rowAction('Oscar Owner').count(), 0);
      assert.equal(await rowAction('Adam Admin').count(), role === 'owner' ? 1 : 0);

      // Change role… picks one of the roles below Owner and shows it on the row.
      await openRowMenu('Bob Buyer');
      assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Change role…', 'Remove from workspace…']);
      await page.getByRole('menuitem', { name: 'Change role…' }).click();
      const roleDialog = page.getByRole('dialog', { name: "Change Bob Buyer's role" });
      await roleDialog.waitFor();
      assert.equal(await roleDialog.getByRole('radio', { name: /^Buyer/ }).isChecked(), true);
      assert.equal(await roleDialog.getByRole('radio').count(), 3);
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/change-role-${width}.png` });
      await roleDialog.getByRole('radio', { name: /^Admin/ }).check();
      await roleDialog.getByRole('button', { name: 'Change role', exact: true }).click();
      await roleDialog.waitFor({ state: 'detached' });
      await row('Bob Buyer').getByText('Admin', { exact: true }).waitFor();

      // Remove from workspace… asks first, then the row goes.
      await openRowMenu('Vera Viewer');
      await page.getByRole('menuitem', { name: 'Remove from workspace…' }).click();
      const removeDialog = page.getByRole('dialog', { name: `Remove Vera Viewer from ${workspace.name}?` });
      await removeDialog.waitFor();
      await page.screenshot({ path: `${output}/remove-member-${width}.png` });
      await removeDialog.getByRole('button', { name: 'Remove member', exact: true }).click();
      await row('Vera Viewer').waitFor({ state: 'detached' });
      assert.deepEqual(
        writes.filter(write => /\/members\/\d+$/.test(write.path)).map(write => [write.verb, write.path, write.body]),
        [
          ['PATCH', `/api/workspaces/${workspace.id}/members/2`, { role: 'admin' }],
          ['DELETE', `/api/workspaces/${workspace.id}/members/3`, null],
        ],
      );

      // Leave workspace…: from your own row, or from Profile → Workspace access.
      if (leaveFrom === 'row') {
        await openRowMenu('Olga Self');
        assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Leave workspace…']);
        await page.getByRole('menuitem', { name: 'Leave workspace…' }).click();
      } else {
        await page.locator('.preferences-sidebar').getByText('Profile', { exact: true }).click();
        await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'Workspace access', exact: true }).waitFor();
        await assertNoOverflow();
        await page.screenshot({ path: `${output}/profile-workspace-access-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Leave workspace', exact: true }).click();
      }
      const leaveDialog = page.getByRole('dialog', { name: `Leave ${workspace.name}?` });
      await leaveDialog.waitFor();
      if (role === 'owner') {
        // The owner names the new owner first; the confirm stays off until then.
        const newOwner = leaveDialog.getByRole('radiogroup', { name: 'New owner' });
        await newOwner.getByRole('radio', { name: /^Bob Buyer/ }).waitFor();
        assert.equal(await newOwner.getByRole('radio', { name: /^Olga Self/ }).count(), 0);
        assert.equal(await newOwner.getByRole('radio', { name: /^Vera Viewer/ }).count(), 0);
        const confirm = leaveDialog.getByRole('button', { name: 'Transfer ownership and leave', exact: true });
        assert.equal(await confirm.isDisabled(), true);
        await newOwner.getByRole('radio', { name: /^Bob Buyer/ }).check();
        await assertNoOverflow();
        await page.screenshot({ path: `${output}/leave-owner-${width}.png` });
        await confirm.click();
      } else {
        await page.screenshot({ path: `${output}/leave-${width}.png` });
        await leaveDialog.getByRole('button', { name: 'Leave workspace', exact: true }).click();
      }
      // The app reloads the account and opens the workspace it still belongs to.
      await page.waitForURL(`**/${nextWorkspace.slug}/inbox`);
      await page.getByText(`You left ${workspace.name}`).waitFor();
      await page.getByText('No notifications', { exact: true }).waitFor();
      assert.deepEqual(
        writes.filter(write => /transfer-ownership|leave$/.test(write.path)).map(write => [write.path, write.body]),
        [
          ...(role === 'owner'
            ? [[`/api/workspaces/${workspace.id}/transfer-ownership`, { new_owner_user_id: 2 }]]
            : []),
          [`/api/workspaces/${workspace.id}/leave`, {}],
        ],
      );

      // Log out ends the session and lands on Linear's sign-in choices.
      if (logout === 'menu') {
        await openWorkspaceMenu(nextWorkspace.name);
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
