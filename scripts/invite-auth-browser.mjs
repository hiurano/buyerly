// Exercise the real App with an isolated, synthetic invitation API.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-invite-auth';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 1, slug: 'invite-team', name: 'Invite Team', role: 'buyer',
  badge_text: 'IT', badge_color: '', logo_url: '', is_active: true,
};
const inviteToken = 'inv_browser_test';
const invitePath = `/invite/${inviteToken}`;
const email = 'invitee@example.test';
const scenarios = [390, 768, 1024, 1440].flatMap(width =>
  ['code', 'link'].map(method => ({ width, method })),
);
scenarios.push({ width: 1440, method: 'session' });

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, method } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    let documents = 0;
    let authenticated = method === 'session';
    const user = {
      username: 'invitee', full_name: '', first_name: '', last_name: '',
      email, email_verified: true, unconfirmed_email: null, avatar_url: '',
      onboarding_completed: method === 'session',
      onboarding_step: method === 'session' ? 'completed' : 'workspace',
      active_workspace: null, workspaces: [],
    };
    let releaseVerification;
    const verificationGate = new Promise(resolve => { releaseVerification = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.resourceType() === 'document') documents += 1; });
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      const body = request.postDataJSON();
      if (verb !== 'GET') writes.push({ path, body });
      if (verb === 'GET' && path === '/api/me') {
        return route.fulfill(authenticated
          ? { json: user }
          : { status: 401, json: { detail: 'Not authenticated' } });
      }
      if (verb === 'GET' && path === `/api/invites/${inviteToken}`) {
        return route.fulfill({ json: {
          valid: true, status: 'pending', workspace_name: workspace.name,
          workspace_slug: workspace.slug, workspace_badge_text: workspace.badge_text,
          inviter_name: 'Team Owner', role: 'buyer', target_email: email,
        } });
      }
      if (verb === 'POST' && path === '/api/auth/request-temporary-password') {
        return route.fulfill({ json: { message: 'Email sent' } });
      }
      if (verb === 'POST' && ['/api/auth/verify-temporary-password', '/api/auth/verify-email-link'].includes(path)) {
        if (path.endsWith('verify-temporary-password') && body.code !== '123456') {
          return route.fulfill({ status: 400, json: { detail: 'Invalid or expired temporary password' } });
        }
        await verificationGate;
        authenticated = true;
        return route.fulfill({ json: {
          username: user.username, full_name: '', role: 'buyer', message: 'Logged in', redirect_url: invitePath,
        } });
      }
      if (verb === 'POST' && path === `/api/invites/${inviteToken}/accept`) {
        assert.ok(authenticated, 'Invitation acceptance requires a session');
        user.active_workspace = workspace;
        user.workspaces = [workspace];
        if (!user.onboarding_completed) user.onboarding_step = 'personal_details';
        return route.fulfill({ json: {
          workspace_slug: workspace.slug, onboarding_completed: user.onboarding_completed,
        } });
      }
      if (verb === 'POST' && path === '/api/onboarding/personal-details') {
        assert.equal(user.active_workspace?.id, workspace.id);
        Object.assign(user, body, {
          full_name: `${body.first_name} ${body.last_name}`, onboarding_completed: true, onboarding_step: 'completed',
        });
        return route.fulfill({ json: { user, active_workspace: workspace, onboarding_completed: true, onboarding_step: 'completed' } });
      }
      if (verb === 'GET' && path === '/api/audit-events') {
        assert.equal(request.headers()['x-workspace-slug'], workspace.slug);
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
      `${method} at ${width}px: document overflow`,
    );
    try {
      await page.goto(`${origin}${invitePath}`);
      await page.getByRole('heading', { name: 'Join Invite Team', exact: true }).waitFor();
      if (method !== 'session') {
        await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
        assert.equal(await page.getByRole('textbox', { name: 'Email address', exact: true }).inputValue(), email);
        await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
        await page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor();
        assert.deepEqual(writes, [{ path: '/api/auth/request-temporary-password', body: { email, invite_token: inviteToken } }]);
        if (method === 'code') {
          await page.getByRole('button', { name: 'Enter code manually', exact: true }).click();
          const code = page.getByRole('textbox', { name: 'Six-digit login code', exact: true });
          await code.fill('111111');
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          await page.getByRole('alert').waitFor();
          assert.equal(await page.getByRole('alert').innerText(), 'Invalid or expired temporary password');
          assert.equal(await page.getByRole('button', { name: 'Join workspace', exact: true }).count(), 0);
          await assertNoOverflow();
          await code.fill('123456');
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          const checking = page.getByRole('button', { name: 'Checking…', exact: true });
          await checking.waitFor();
          assert.equal(await checking.isDisabled(), true);
        } else {
          await page.goto(`${origin}/auth/email/verify?token=link_browser_test`);
          await page.getByText('Logging you in securely…', { exact: true }).waitFor();
        }
        releaseVerification();
      }

      const join = page.getByRole('button', { name: 'Join workspace', exact: true });
      await join.waitFor();
      assert.equal(new URL(page.url()).pathname, invitePath);
      assert.equal(await page.getByRole('textbox', { name: 'Six-digit login code', exact: true }).count(), 0);
      assert.equal(writes.filter(write => write.path.endsWith('/accept')).length, 0, 'Joining remains an explicit step');
      assert.equal(documents, method === 'link' ? 2 : 1, 'Authentication must return to the invitation without reloading');
      await assertNoOverflow();
      await page.screenshot({ path: `${output}/${method}-join-${width}.png`, fullPage: true });
      await join.focus();
      assert.equal(await join.evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('Enter');

      if (method !== 'session') {
        await page.getByRole('heading', { name: 'Set up your profile', exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, `/${workspace.slug}/welcome`);
        const name = page.getByRole('textbox', { name: 'Name', exact: true });
        await name.fill('Invited Buyer');
        await assertNoOverflow();
        await page.screenshot({ path: `${output}/${method}-welcome-${width}.png`, fullPage: true });
        await name.press('Enter');
      }
      await page.waitForURL(`**/${workspace.slug}/inbox`);
      await page.getByText('No workspace events yet', { exact: true }).waitFor();
      assert.equal(documents, method === 'link' ? 2 : 1, 'Joining and onboarding must not reload the page');
      assert.deepEqual(writes.filter(write => write.path.endsWith('/accept')),
        [{ path: `/api/invites/${inviteToken}/accept`, body: {} }]);
      assert.deepEqual(writes.filter(write => write.path === '/api/onboarding/personal-details'), method === 'session' ? []
        : [{ path: '/api/onboarding/personal-details', body: { first_name: 'Invited', last_name: 'Buyer' } }]);
      assert.deepEqual(writes.filter(write => write.path.includes('/api/auth/verify-')), method === 'session' ? []
        : method === 'link' ? [{ path: '/api/auth/verify-email-link', body: { token: 'link_browser_test' } }]
          : ['111111', '123456'].map(code => ({ path: '/api/auth/verify-temporary-password', body: { email, code } })));
      assert.deepEqual(errors, []);
      console.log(`Invitation ${method}: authentication, explicit acceptance and workspace entry passed at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${method}-failure-${width}.png`, fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
