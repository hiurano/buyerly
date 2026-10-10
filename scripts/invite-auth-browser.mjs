// Exercise the real App with an isolated, synthetic invitation API.
// The flow follows Linear: the invite page names the email to log in as, the
// emailed code or link signs that email in, and the invite is then accepted
// without a second "Join" step. Someone else's session is logged out first.
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
const otherEmail = 'someone-else@example.test';
const scenarios = [390, 768, 1024, 1440].flatMap(width =>
  ['code', 'link'].map(method => ({ width, method })),
);
scenarios.push({ width: 1440, method: 'session' }, { width: 390, method: 'other' }, { width: 1440, method: 'other' });

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, method } of scenarios) {
    // The invite page follows the system theme like Linear: one wide logged-in run is dark.
    const dark = method === 'other' && width === 1440;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: dark ? 'dark' : 'light' });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    let documents = 0;
    let authenticated = method === 'session' || method === 'other';
    const user = {
      username: 'invitee', full_name: '', first_name: '', last_name: '',
      email, email_verified: true, unconfirmed_email: null, avatar_url: '',
      onboarding_completed: method === 'session',
      onboarding_step: method === 'session' ? 'completed' : 'workspace',
      active_workspace: null, workspaces: [],
    };
    // Someone else is logged in until the invite page logs them out.
    let sessionUser = method === 'other'
      ? { ...user, username: 'someone', email: otherEmail, onboarding_completed: true, onboarding_step: 'completed' }
      : user;
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
          ? { json: sessionUser }
          : { status: 401, json: { detail: 'Not authenticated' } });
      }
      // One account in this browser at a time here; several are checked by multi-account-browser.mjs.
      if (verb === 'GET' && path === '/api/auth/accounts') return route.fulfill({ json: [] });
      if (verb === 'GET' && path === `/api/invites/${inviteToken}`) {
        return route.fulfill({ json: {
          valid: true, status: 'pending', workspace_name: workspace.name,
          workspace_slug: workspace.slug, workspace_badge_text: workspace.badge_text,
          inviter_name: 'Team Owner', role: 'buyer', target_email: email,
        } });
      }
      if (verb === 'POST' && path === '/api/auth/logout') {
        authenticated = false;
        return route.fulfill({ json: { status: 'ok' } });
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
        sessionUser = user;
        return route.fulfill({ json: {
          username: user.username, full_name: '', role: 'buyer', message: 'Logged in', redirect_url: invitePath,
        } });
      }
      if (verb === 'POST' && path === `/api/invites/${inviteToken}/accept`) {
        assert.ok(authenticated && sessionUser === user, 'Only the invited email accepts the invitation');
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
      if (verb === 'GET' && path === '/api/inbox') {
        assert.equal(request.headers()['x-workspace-slug'], workspace.slug);
        return route.fulfill({ json: { items: [], has_more: false, unread_count: 0 } });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0 } });
      if (verb === 'GET' && path === '/api/inbox/display') return route.fulfill({ json: {} });
      if (verb === 'GET' && path === '/api/audit-events') {
        assert.equal(request.headers()['x-workspace-slug'], workspace.slug);
        return route.fulfill({ json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0, status_counts: {} } });
      }
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups'].includes(path)) {
        return route.fulfill({ json: [] });
      }
      // Settings reads the workspace teams (#371) for "Your teams" and the Members Teams column.
      if (verb === 'GET' && path.startsWith('/api/workspaces/') && path.endsWith('/teams')) return route.fulfill({ json: [] });
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });
    const assertNoOverflow = async () => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${method} at ${width}px: document overflow`,
    );
    try {
      await page.goto(`${origin}${invitePath}`);

      if (method !== 'session') {
        await page.getByRole('heading', { name: 'Team Owner has invited you to Invite Team', exact: true }).waitFor();
        // Logged out, or logged in as someone else, the page names the email to log in as.
        await page.getByText(`To accept the invitation please login as${email}.`).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Join workspace', exact: true }).count(), 0);
        if (method === 'other') {
          await page.getByText(`Logged in as${otherEmail}`).waitFor();
        }
        if (width === 1440) {
          // Linear's measurements (#284); the Log in button is Buyerly yellow instead of Linear's violet.
          const looks = await page.evaluate(() => {
            const style = selector => getComputedStyle(document.querySelector(selector));
            const box = selector => document.querySelector(selector).getBoundingClientRect();
            return {
              page: style('.buyerly-invite-page').backgroundColor,
              card: style('.buyerly-invite-card').backgroundColor,
              cardWidth: box('.buyerly-invite-card').width,
              mark: [box('.buyerly-invite-workspace-mark').width, box('.buyerly-invite-workspace-mark').height],
              title: [style('.buyerly-invite-title').fontSize, style('.buyerly-invite-title').fontWeight],
              divider: Boolean(document.querySelector('.buyerly-invite-divider')),
              button: style('.buyerly-invite-button').backgroundColor,
              buttonBox: [box('.buyerly-invite-button').width, box('.buyerly-invite-button').height],
            };
          });
          assert.deepEqual(looks, {
            page: dark ? 'rgb(17, 18, 18)' : 'rgb(248, 248, 249)',
            card: dark ? 'rgb(25, 25, 27)' : 'rgb(255, 255, 255)',
            cardWidth: 460,
            mark: [54, 54],
            title: ['24px', '500'],
            // Logged out, Linear describes the product under a divider; logged in, neither is shown.
            divider: method !== 'other',
            button: 'rgb(245, 184, 0)',
            buttonBox: [396, 44],
          }, `${method} at ${width}px: invite page measurements`);
        }
        if (method === 'other') {
          // "Logged in as" opens Linear's account menu.
          await page.getByRole('button', { name: /Logged in as/ }).click();
          await page.getByRole('menuitem', { name: 'Log out', exact: true }).waitFor();
          assert.equal(await page.getByRole('menu').getByText('Accounts', { exact: true }).count(), 1);
          // "Add an account" logs in to one more account without logging this one out (#231),
          // and the login carries the invitation back to this page.
          // Chosen from the keyboard: at 390px headless Chromium reports the page over the item.
          await page.getByRole('menuitem', { name: 'Add an account', exact: true }).focus();
          await page.keyboard.press('Enter');
          await page.waitForURL(`${origin}/auth/add-account?invite=${inviteToken}`);
          await page.getByRole('heading', { name: 'Add an account', exact: true }).waitFor();
          assert.deepEqual(writes, [], 'Add an account keeps the open account logged in');
          await page.getByRole('button', { name: /Back to Buyerly/ }).click();
          await page.waitForURL(`${origin}${invitePath}`);
          await page.getByRole('button', { name: /Logged in as/ }).waitFor();
        }
        await assertNoOverflow();
        await page.screenshot({ path: `${output}/${method}-invite-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Log in', exact: true }).click();
        if (method === 'other') {
          assert.deepEqual(writes.slice(0, 1), [{ path: '/api/auth/logout', body: {} }], 'The other account is logged out first');
          writes.length = 0;
        }
        await page.getByRole('heading', { name: 'What’s your email address?', exact: true }).waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'Email address', exact: true }).inputValue(), email);
        await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
        await page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor();
        assert.deepEqual(writes, [{ path: '/api/auth/request-temporary-password', body: { email, invite_token: inviteToken } }]);
        if (method === 'link') {
          await page.goto(`${origin}/auth/email/verify?token=link_browser_test`);
          await page.getByText('Logging you in securely…', { exact: true }).waitFor();
        } else {
          await page.getByRole('button', { name: 'Enter code manually', exact: true }).click();
          const code = page.getByRole('textbox', { name: 'Login code', exact: true });
          await code.fill('111111');
          await page.getByRole('button', { name: 'Continue with login code', exact: true }).click();
          await page.getByRole('alert').waitFor();
          assert.equal(await page.getByRole('alert').innerText(), 'Invalid or expired temporary password');
          await assertNoOverflow();
          await code.fill('123456');
          await page.getByRole('button', { name: 'Continue with login code', exact: true }).click();
          const checking = page.getByRole('button', { name: 'Checking…', exact: true });
          await checking.waitFor();
          assert.equal(await checking.isDisabled(), true);
        }
        releaseVerification();
      }

      // Linear: once the invited email is logged in, the invitation is accepted without another step.
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
      await page.getByText('No notifications', { exact: true }).waitFor();
      assert.equal(documents, method === 'link' ? 2 : 1, 'Signing in, accepting and onboarding must not reload the page');
      assert.deepEqual(writes.filter(write => write.path.endsWith('/accept')),
        [{ path: `/api/invites/${inviteToken}/accept`, body: {} }]);
      assert.deepEqual(writes.filter(write => write.path === '/api/onboarding/personal-details'), method === 'session' ? []
        : [{ path: '/api/onboarding/personal-details', body: { first_name: 'Invited', last_name: 'Buyer' } }]);
      assert.deepEqual(writes.filter(write => write.path.includes('/api/auth/verify-')), method === 'session' ? []
        : method === 'link' ? [{ path: '/api/auth/verify-email-link', body: { token: 'link_browser_test' } }]
          : ['111111', '123456'].map(code => ({ path: '/api/auth/verify-temporary-password', body: { email, code } })));
      assert.deepEqual(errors, []);
      console.log(`Invitation ${method}: log in as the invited email and automatic acceptance passed at ${width}px`);
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
