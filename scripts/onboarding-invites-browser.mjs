// Onboarding's "Invite teammates" step (#403), on the real App with a synthetic API.
// Follows Linear's "Invite co-workers": the workspace invite link with Copy, an
// email field that flags a bad address before sending, a role, "Send N invites"
// and "I'll do this later". Checked at phone and desktop width, light and dark.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const root = fileURLToPath(new URL('../frontend/', import.meta.url));
process.chdir(root);
const output = join(tmpdir(), 'buyerly-onboarding-invites');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 7, slug: 'acme', name: 'Acme Media', role: 'owner',
  badge_text: 'A', badge_color: '#F5A300', logo_url: '', is_active: true,
};
const inviteUrl = '/invite/inv_onboarding_link';
// "link": invite links are on. "off": an admin turned them off in Settings → Security.
// "new": a new workspace that never had a link gets one, as Linear's are on by default.
const scenarios = [
  { width: 390, scheme: 'light', link: 'link' },
  { width: 1440, scheme: 'light', link: 'link' },
  { width: 1440, scheme: 'dark', link: 'off' },
  { width: 390, scheme: 'dark', link: 'new' },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width, scheme, link } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const page = await context.newPage();
    await mockSync(page);
    page.setDefaultTimeout(10_000);
    const label = `${link}-${scheme}-${width}`;
    const errors = [];
    const writes = [];
    let linkState = link;
    const user = {
      id: 3, username: 'owner', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
      email: 'olga@acme.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
      onboarding_completed: false, onboarding_step: 'invites',
      active_workspace: workspace, workspaces: [workspace],
    };
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      if (verb !== 'GET') writes.push({ verb, path, body: request.postDataJSON() });
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: user });
      if (verb === 'GET' && path === '/api/auth/accounts') return route.fulfill({ json: [] });
      if (path === `/api/workspaces/${workspace.id}/invite-link`) {
        if (verb === 'POST') {
          linkState = 'link';
          return route.fulfill({ json: { invite_url: inviteUrl, turned_off: false } });
        }
        return route.fulfill({ json: linkState === 'link'
          ? { invite_url: inviteUrl, turned_off: false }
          : { invite_url: null, turned_off: linkState === 'off' } });
      }
      if (verb === 'POST' && path === '/api/onboarding/invites') {
        user.onboarding_step = 'completed';
        user.onboarding_completed = true;
        return route.fulfill({ json: { sent_count: 2, invites: [], onboarding_completed: true, redirect_url: '/' } });
      }
      if (verb === 'POST' && path === '/api/onboarding/skip') {
        user.onboarding_step = 'completed';
        user.onboarding_completed = true;
        return route.fulfill({ json: { status: 'ok' } });
      }
      if (verb === 'GET') return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    try {
      await page.goto(`${origin}/${workspace.slug}/welcome`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByRole('heading', { name: 'Invite your team', exact: true }).waitFor();

      // One background from the very top, like the other onboarding screens: no band above.
      const backgrounds = await page.evaluate(() => {
        const at = (y) => {
          let node = document.elementFromPoint(window.innerWidth - 4, y);
          while (node && getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)') node = node.parentElement;
          return node ? getComputedStyle(node).backgroundColor : '';
        };
        return [at(2), at(60), at(140), at(window.innerHeight - 4)];
      });
      assert.equal(new Set(backgrounds).size, 1, `One page background from top to bottom: ${backgrounds.join(' | ')}`);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `No horizontal scroll at ${width}px`);
      if (width <= 400) {
        const box = await page.locator('.buyerly-onboarding-invites').boundingBox();
        assert.ok(box.x >= 16 && width - (box.x + box.width) >= 16, 'Phone width keeps 16px on both sides');
      }

      // Invite link: shown, read-only, copied in one click; or a pointer to Settings → Security.
      const linkField = page.getByRole('textbox', { name: 'Invite link', exact: true });
      if (link === 'off') {
        assert.equal(await linkField.count(), 0);
        await page.getByText('Invite links are turned off.', { exact: false }).waitFor();
        assert.ok(writes.every(write => !write.path.endsWith('/invite-link')), 'A link turned off stays off');
      } else {
        await linkField.waitFor();
        assert.equal(await linkField.inputValue(), `${origin}${inviteUrl}`);
        assert.equal(await linkField.getAttribute('readonly'), '');
        assert.deepEqual(
          writes.filter(write => write.path.endsWith('/invite-link')).map(write => write.verb),
          link === 'new' ? ['POST'] : [],
          'Only a workspace that never had a link turns one on',
        );
        await page.getByRole('button', { name: 'Copy', exact: true }).click();
        await page.getByRole('button', { name: 'Copied', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}${inviteUrl}`);
      }

      // Emails: the main button counts them and a bad address shows before sending.
      const send = page.locator('button[type="submit"]');
      assert.equal(await send.innerText(), 'Send invites');
      assert.equal(await send.isDisabled(), true);
      const field = page.getByRole('textbox', { name: 'Email', exact: true });
      const padding = await field.evaluate(node => parseFloat(getComputedStyle(node).paddingLeft));
      assert.ok(padding >= 10, 'The email field has room inside');
      await field.click();
      const ring = await field.evaluate(node => {
        const style = getComputedStyle(node);
        return { outline: style.outlineWidth, border: style.borderTopWidth };
      });
      assert.ok(parseFloat(ring.outline) <= 1 && parseFloat(ring.border) <= 1, `A thin focus line, not a thick frame: ${JSON.stringify(ring)}`);
      await page.screenshot({ path: `${output}/${label}-empty.png`, fullPage: true });

      await field.fill('ann@acme.test, bob@acme\nann@acme.test');
      await page.getByText('bob@acme isn’t a valid email', { exact: false }).waitFor();
      assert.equal(await field.getAttribute('aria-invalid'), 'true');
      assert.equal(await send.isDisabled(), true, 'A bad address blocks sending');
      await page.screenshot({ path: `${output}/${label}-invalid.png`, fullPage: true });

      await field.fill('ann@acme.test, bob@acme.test\nann@acme.test');
      assert.equal(await field.getAttribute('aria-invalid'), 'false');
      assert.equal(await send.innerText(), 'Send 2 invites');

      // Role: Member by default, Admin or Guest on request, as in Settings → Members.
      const role = page.getByRole('button', { name: 'Role: Member', exact: true });
      await role.click();
      await page.getByRole('menuitemradio', { name: /^Guest/ }).click();
      await page.getByRole('button', { name: 'Role: Guest', exact: true }).waitFor();
      await page.screenshot({ path: `${output}/${label}-ready.png`, fullPage: true });

      if (width === 390 && link === 'new') {
        await page.getByRole('button', { name: 'I’ll do this later', exact: true }).click();
        await page.waitForURL(`**/${workspace.slug}/inbox`);
        assert.deepEqual(writes.filter(write => write.path.startsWith('/api/onboarding/')),
          [{ verb: 'POST', path: '/api/onboarding/skip', body: {} }]);
      } else {
        await send.click();
        await page.waitForURL(`**/${workspace.slug}/inbox`);
        assert.deepEqual(writes.filter(write => write.path.startsWith('/api/onboarding/')), [{
          verb: 'POST', path: '/api/onboarding/invites',
          body: { invites: [{ email: 'ann@acme.test', role: 'guest' }, { email: 'bob@acme.test', role: 'guest' }] },
        }]);
      }
      assert.deepEqual(errors, []);
      console.log(`Onboarding invites (${link}, ${scheme}) passed at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${label}-failure.png`, fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
