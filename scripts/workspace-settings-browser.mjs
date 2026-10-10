// Exercise the real App with a synthetic API: Settings → Administration lists
// Workspace, Teams, Members and Security for an owner or admin, after Linear. Workspace
// renames the workspace, uploads its logo, moves it to a new URL and deletes it;
// Teams shows Linear's toolbar over an empty table; Security turns the invite
// link on, copies it, resets it and turns it off again; a buyer sees no
// Administration and its addresses open Preferences instead.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-workspace-settings';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const scenarios = [
  { width: 1440, role: 'owner' },
  { width: 390, role: 'owner' },
  { width: 1440, role: 'admin' },
  { width: 390, role: 'buyer' },
];
// A 1×1 PNG for the logo upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, role } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    const workspace = {
      id: 7, slug: 'alpha', name: 'Alpha', role, badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
    };
    const other = {
      id: 8, slug: 'beta', name: 'Beta', role: 'owner', badge_text: 'B', badge_color: '#26B5CE', logo_url: '', is_active: false,
    };
    let deleted = false;
    let inviteLink = null;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const me = () => {
      const workspaces = deleted ? [{ ...other, is_active: true }] : [workspace, other];
      return {
        id: 1, username: 'olga', full_name: 'Olga Self', first_name: 'Olga', last_name: 'Self',
        email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
        onboarding_completed: true, onboarding_step: 'completed',
        active_workspace: workspaces[0], workspaces,
      };
    };
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      if (verb !== 'GET') {
        const body = path.endsWith('/logo') ? 'file' : request.postDataJSON();
        writes.push({ verb, path, body });
      }
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: me() });
      if (verb === 'POST' && path === '/api/onboarding/workspace/logo') {
        return route.fulfill({ json: { status: 'ok', logo_url: '/uploads/workspaces/logo_1_new.png' } });
      }
      if (path === `/api/workspaces/${workspace.id}` && verb === 'PATCH') {
        const body = request.postDataJSON();
        if (body.slug === 'beta') return route.fulfill({ status: 409, json: { detail: 'That workspace URL is already taken' } });
        if (body.name) workspace.name = body.name;
        if (body.slug) workspace.slug = body.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        if (body.logo_url !== undefined) workspace.logo_url = body.logo_url;
        return route.fulfill({ json: workspace });
      }
      if (path === `/api/workspaces/${workspace.id}` && verb === 'DELETE') {
        deleted = true;
        return route.fulfill({ json: { status: 'ok', message: 'Workspace deleted', next_workspace_id: other.id } });
      }
      if (path === `/api/workspaces/${workspace.id}/invite-link`) {
        if (verb === 'POST') inviteLink ??= '/invite/inv_first';
        if (verb === 'DELETE') inviteLink = null;
        return route.fulfill({ json: { invite_url: inviteLink } });
      }
      if (verb === 'POST' && path === `/api/workspaces/${workspace.id}/invite-link/reset`) {
        inviteLink = '/invite/inv_second';
        return route.fulfill({ json: { invite_url: inviteLink } });
      }
      if (path.startsWith('/uploads/')) return route.fulfill({ body: PNG, contentType: 'image/png' });
      if (verb === 'GET' && path === '/api/inbox') {
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/inbox/display') return route.fulfill({ json: {} });
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups', '/api/auth/accounts'].includes(path)) {
        return route.fulfill({ json: [] });
      }
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    await context.route('**/uploads/**', route => route.fulfill({ body: PNG, contentType: 'image/png' }));
    const assertNoOverflow = async (what) => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${what} at ${width}px: document overflow`,
    );
    const nav = page.getByRole('complementary', { name: 'Settings navigation' });
    const label = `${role} at ${width}px`;
    try {
      if (role === 'buyer') {
        // No Administration for a buyer: the address opens Preferences, the menu has no Members.
        await page.goto(`${origin}/alpha/settings/workspace`);
        await page.getByRole('heading', { name: 'Preferences', exact: true }).waitFor();
        await page.waitForURL(`${origin}/alpha/settings`);
        assert.equal(await nav.getByRole('heading', { name: 'Administration' }).count(), 0);
        assert.equal(await nav.getByRole('link', { name: 'Workspace' }).count(), 0);
        await page.goto(`${origin}/alpha/settings/security`);
        await page.getByRole('heading', { name: 'Preferences', exact: true }).waitFor();
        await page.waitForURL(`${origin}/alpha/settings`);
        await page.goto(`${origin}/alpha/settings/members`);
        await page.getByRole('heading', { name: 'Preferences', exact: true }).waitFor();
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
        await page.keyboard.press('o');
        await page.keyboard.press('s');
        const palette = page.getByRole('dialog', { name: 'Open settings' });
        await palette.getByRole('option', { name: 'Profile' }).waitFor();
        assert.equal(await palette.getByRole('option', { name: 'Workspace' }).count(), 0);
        assert.equal(await palette.getByRole('option', { name: 'Members' }).count(), 0);
        await page.keyboard.press('Escape');
        assert.deepEqual(errors, []);
        console.log(`Workspace settings: hidden from a ${label}`);
        continue;
      }

      await page.goto(`${origin}/alpha/settings/workspace`);
      await page.getByRole('heading', { name: 'Workspace', exact: true }).waitFor();
      // Linear's order under Administration (read from the DOM: on a phone the sidebar is a closed drawer).
      const administration = nav.locator('.preferences-nav-group').last();
      assert.deepEqual(
        await administration.locator('.preferences-nav-label').evaluateAll((labels) => labels.map((item) => item.textContent)),
        ['Workspace', 'Teams', 'Members', 'Security'],
      );
      assert.equal(await administration.locator('.preferences-nav-heading').textContent(), 'Administration');
      // Time & region and Member onboarding are left out.
      assert.equal(await page.getByText('Time & region').count(), 0);
      assert.equal(await page.getByText('Member onboarding').count(), 0);
      await assertNoOverflow('Workspace');
      await page.screenshot({ path: `${output}/workspace-${role}-${width}.png`, fullPage: true });

      // Name saves on blur.
      const name = page.getByRole('textbox', { name: 'Name', exact: true });
      await name.fill('Alpha Media');
      await name.press('Enter');
      await page.getByText('Workspace name updated').waitFor();
      // An empty name is put back, as Linear does.
      await name.fill('');
      await name.press('Enter');
      await page.getByText('Workspace name can’t be empty').waitFor();
      assert.equal(await name.inputValue(), 'Alpha Media');

      // Logo upload, then the workspace is saved with it.
      await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
      await page.locator('.preferences-workspace-logo img').waitFor();

      // URL: a taken address is refused in the dialog, a free one moves the page.
      await page.getByRole('textbox', { name: 'URL', exact: true }).click();
      const urlDialog = page.getByRole('dialog', { name: 'Change workspace URL' });
      await urlDialog.waitFor();
      await assertNoOverflow('Change workspace URL');
      await page.screenshot({ path: `${output}/url-dialog-${role}-${width}.png` });
      const urlField = urlDialog.getByRole('textbox', { name: 'Enter the new workspace URL' });
      await urlField.fill('beta');
      await urlDialog.getByRole('button', { name: 'Update', exact: true }).click();
      await urlDialog.getByText('That workspace URL is already taken').waitFor();
      await urlField.fill('alpha-media');
      await urlDialog.getByRole('button', { name: 'Update', exact: true }).click();
      await urlDialog.waitFor({ state: 'detached' });
      await page.waitForURL(`${origin}/alpha-media/settings/workspace`);
      await page.getByText('Workspace URL updated').waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'URL', exact: true }).inputValue(), 'alpha-media');

      // Teams: Linear's toolbar without Export CSV, an empty table, Create team off.
      await page.goto(`${origin}/alpha-media/settings/teams`);
      await page.getByRole('heading', { name: 'Teams', exact: true }).waitFor();
      await page.getByRole('searchbox', { name: 'Filter by name…' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Create team' }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Export CSV' }).count(), 0);
      await page.getByText('No teams yet').waitFor();
      await assertNoOverflow('Teams');
      await page.screenshot({ path: `${output}/teams-${role}-${width}.png`, fullPage: true });

      // Security: Linear's Invite links — off, on with the link, copy, reset after a confirm, off again.
      await page.goto(`${origin}/alpha-media/settings/security`);
      await page.getByRole('heading', { name: 'Security', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Workspace access' }).waitFor();
      await page.getByText('A uniquely generated invite link allows anyone with the link to join your workspace').waitFor();
      await page.getByText('Who can invite new members to the workspace').waitFor();
      const linkSwitch = page.getByRole('switch', { name: 'Enable invite links' });
      await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Enable invite links"]')?.getAttribute('aria-busy') !== 'true');
      assert.equal(await linkSwitch.getAttribute('aria-checked'), 'false');
      assert.equal(await page.getByRole('button', { name: 'Copy', exact: true }).count(), 0);
      await linkSwitch.click();
      await page.getByText(`${origin}/invite/inv_first`).waitFor();
      assert.equal(await linkSwitch.getAttribute('aria-checked'), 'true');
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await page.getByText('Invite link copied to clipboard').waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/invite/inv_first`);
      await assertNoOverflow('Security');
      await page.screenshot({ path: `${output}/security-${role}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Reset invite link' }).click();
      const resetDialog = page.getByRole('dialog', { name: 'Reset invite link?' });
      await resetDialog.getByText('This will expire the current link and generate a new one.').waitFor();
      await resetDialog.getByRole('button', { name: 'Reset invite link' }).click();
      await page.getByText('Invite link replaced').waitFor();
      await page.getByText(`${origin}/invite/inv_second`).waitFor();
      await linkSwitch.click();
      await page.getByRole('button', { name: 'Copy', exact: true }).waitFor({ state: 'detached' });
      assert.equal(await linkSwitch.getAttribute('aria-checked'), 'false');

      // Danger zone: only the owner deletes, after typing the name and acknowledging.
      await page.goto(`${origin}/alpha-media/settings/workspace`);
      const remove = page.getByRole('button', { name: 'Delete workspace' });
      if (role === 'admin') {
        assert.equal(await remove.isDisabled(), true);
        await page.getByText('Only the workspace owner can delete it').waitFor();
      } else {
        await remove.click();
        const dialog = page.getByRole('dialog', { name: 'Verify workspace deletion request' });
        await dialog.waitFor();
        const confirm = dialog.getByRole('button', { name: 'Delete my workspace' });
        assert.equal(await confirm.isDisabled(), true);
        await dialog.getByRole('textbox', { name: 'Enter the workspace name to confirm' }).fill('Alpha Media');
        assert.equal(await confirm.isDisabled(), true, 'the box must be ticked too');
        await dialog.getByRole('checkbox').check();
        await assertNoOverflow('Delete workspace');
        await page.screenshot({ path: `${output}/delete-dialog-${role}-${width}.png` });
        await confirm.click();
        await page.waitForURL(`${origin}/beta/inbox`);
        await page.getByText('Workspace deleted').waitFor();
      }

      const expected = [
        ['PATCH', '/api/workspaces/7', { name: 'Alpha Media' }],
        ['POST', '/api/onboarding/workspace/logo', 'file'],
        ['PATCH', '/api/workspaces/7', { logo_url: '/uploads/workspaces/logo_1_new.png' }],
        ['PATCH', '/api/workspaces/7', { slug: 'beta' }],
        ['PATCH', '/api/workspaces/7', { slug: 'alpha-media' }],
        ['POST', '/api/workspaces/7/invite-link', {}],
        ['POST', '/api/workspaces/7/invite-link/reset', {}],
        ['DELETE', '/api/workspaces/7/invite-link', null],
        ...(role === 'owner' ? [['DELETE', '/api/workspaces/7', null]] : []),
      ];
      assert.deepEqual(writes.map(write => [write.verb, write.path, write.body]), expected);
      assert.deepEqual(errors, []);
      console.log(`Workspace settings: rename, logo, URL, Teams, Security and delete passed for ${label}`);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${role}-${width}.png`, fullPage: true });
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
