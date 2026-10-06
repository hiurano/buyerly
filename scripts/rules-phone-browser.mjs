// Exercise the real App with a synthetic API: managing rules once the first
// one exists (#321). "New rule" sits in the page header at every width; a
// rule's "⋯" shows without hover and stays on screen on a phone; there the ad
// accounts are listed in the menu itself rather than in a submenu, and every
// control a finger taps is at least 40px tall. On a phone everything is
// tapped: create a second rule, edit it, run it on an ad account, delete it.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-rules-phone';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = {
  id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  username: 'buyer', full_name: 'Bo Buyer', first_name: 'Bo', last_name: 'Buyer',
  email: 'bo@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '', has_password: true,
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const account = {
  id: 100, account_id: 'act_100', name: 'Leads account', custom_name: '', note: '', connection_type: 'system_user',
  timezone_name: 'UTC', currency: 'USD', account_status: 1, status_label: 'Active (ACTIVE)',
  rules_enabled: false, is_active: true, primary_result: '', target_cost_per_result: null, active_rules: [],
};
const preset = (id, name) => ({
  id, name, action: 'turn_off', level: 'adset', enabled: true,
  conditions: [{ metric: 'spend', operator: 'gte', value: 10, time_window: 'today' }],
  condition_logic: 'and', cooldown_minutes: 1440, check_interval_minutes: 5,
  budget_change_percent: 0, budget_max_daily: 0, needs_review: false,
  review_reason: '', last_run_at: '', attached_account_ids: [], attached_scopes: {},
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const width of [390, 1440]) {
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: phone, isMobile: phone });
    await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // The workspace as the server keeps it: one rule to begin with.
    const presets = [preset(7, 'First rule')];
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const verb = request.method();
      if (verb !== 'GET') {
        const body = request.postData() ? request.postDataJSON() : null;
        writes.push({ verb, path, body });
        const one = path.match(/^\/api\/presets\/(\d+)$/);
        const assign = path.match(/^\/api\/accounts\/act_100\/assign-rule$/);
        const detach = path.match(/^\/api\/accounts\/act_100\/detach-rule\/(\d+)$/);
        if (verb === 'POST' && path === '/api/presets') {
          const created = { ...preset(9, body.name), ...body };
          presets.push(created);
          return route.fulfill({ json: created });
        }
        if (one && verb === 'PUT') {
          const index = presets.findIndex((item) => item.id === Number(one[1]));
          presets[index] = { ...presets[index], ...body };
          return route.fulfill({ json: presets[index] });
        }
        if (one && verb === 'DELETE') {
          presets.splice(presets.findIndex((item) => item.id === Number(one[1])), 1);
          return route.fulfill({ json: { success: true, deleted_item_id: 55 } });
        }
        if (assign || detach) {
          const target = presets.find((item) => item.id === (assign ? body.preset_id : Number(detach[1])));
          target.attached_account_ids = assign ? ['act_100'] : [];
          target.attached_scopes = assign ? { act_100: body.scope } : {};
          return route.fulfill({ json: { account_id: 'act_100', active_rules: [], rules_enabled: Boolean(assign) } });
        }
        errors.push(`Unexpected write: ${verb} ${path}`);
        return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
      }
      if (path === '/api/me') return route.fulfill({ json: me });
      if (path === '/api/accounts') return route.fulfill({ json: [account] });
      if (path === '/api/presets') return route.fulfill({ json: presets });
      if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
      return route.fulfill({ json: [] });
    });

    const press = (locator) => (phone ? locator.tap() : locator.click());
    const lastWrite = () => writes.at(-1);
    const waitForWrites = async (count) => {
      for (let tries = 0; writes.length < count && tries < 100; tries += 1) await page.waitForTimeout(50);
      assert.equal(writes.length, count, `expected ${count} writes, saw ${JSON.stringify(writes)}`);
    };
    // Laid-out height: the boundingBox would catch an opening scale animation.
    const fingerSized = async (locator, what) => {
      if (!phone) return;
      const height = await locator.evaluate((el) => el.offsetHeight);
      assert.ok(height >= 40, `${what} is finger-sized, not ${height}px`);
    };
    const onScreen = async (locator, what) => {
      const box = await locator.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${what} is on screen: ${JSON.stringify(box)}`);
    };
    const rowMenu = (name) => page.getByRole('button', { name: `Actions for ${name}` });
    const openRowMenu = async (name) => {
      const trigger = rowMenu(name);
      // No pointer over the row: the "⋯" shows anyway on a phone, on a hover elsewhere.
      if (phone) {
        assert.equal(await trigger.evaluate((el) => getComputedStyle(el).opacity), '1', '⋯ shows without hover');
        await onScreen(trigger, '⋯');
        await fingerSized(trigger, '⋯');
      }
      // One press opens it, the first time included.
      await press(trigger);
      const menu = page.getByRole('menu');
      await menu.waitFor();
      return menu;
    };

    try {
      await page.goto(`${origin}/alpha/rules`);
      await page.locator('[data-row-id="7"]').waitFor();
      await page.mouse.move(0, 0);
      if (phone) {
        assert.equal(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), true, 'the phone is a touch screen');
      }

      // 0. The condition carries its window and the account currency, and a
      // rule attached nowhere says how to attach it (#324).
      assert.match(await page.locator('[data-row-id="7"]').innerText(), /IF Spend ≥ USD\s10\.00 today/);
      const attachNote = page.getByRole('note').filter({ hasText: 'runs nowhere yet' });
      assert.match(await attachNote.innerText(), /^“First rule” runs nowhere yet\. Attach a rule to an ad account/);
      await onScreen(attachNote, 'the attach note');

      // 1. A second rule from the header button, shown with no pointer anywhere.
      const newRule = page.getByRole('button', { name: 'New rule' });
      await onScreen(newRule, 'New rule');
      await fingerSized(newRule, 'New rule');
      await press(newRule);
      const form = page.getByRole('dialog', { name: 'New rule' });
      await form.waitFor();
      await onScreen(form, 'the rule form');
      // What "Applies to" picks, and where the rule looks once attached.
      assert.match(await form.innerText(), /Checks each ad set on its own\. Attached to an ad account, it covers every ad set there; attached to a campaign, every ad set in that campaign\./);
      await form.getByRole('textbox', { name: 'Rule name' }).fill('Second rule');
      await form.getByRole('spinbutton').first().fill('5');
      // The form's own menus: a pill and its items are finger-sized.
      const actionPill = form.getByRole('button', { name: /^Action:/ });
      await fingerSized(actionPill, 'the Action pill');
      await press(actionPill);
      const actionMenu = page.getByRole('menu');
      await actionMenu.waitFor();
      await fingerSized(actionMenu.getByRole('menuitem').first(), 'a form menu item');
      await page.screenshot({ path: `${output}/form-menu-${width}.png` });
      await page.keyboard.press('Escape');
      await actionMenu.waitFor({ state: 'detached' });
      const create = form.getByRole('button', { name: 'Create rule' });
      await fingerSized(create, 'Create rule');
      await press(create);
      await waitForWrites(1);
      assert.equal(lastWrite().verb, 'POST');
      assert.equal(lastWrite().path, '/api/presets');
      assert.equal(lastWrite().body.name, 'Second rule');
      await form.waitFor({ state: 'detached' });
      await page.locator('[data-row-id="9"]').waitFor();
      await page.mouse.move(0, 0);
      await attachNote.filter({ hasText: '2 rules run nowhere yet.' }).waitFor();

      // 2. Edit it from its row's menu.
      let menu = await openRowMenu('Second rule');
      await page.screenshot({ path: `${output}/row-menu-${width}.png` });
      const edit = menu.getByRole('menuitem', { name: 'Edit rule' });
      await fingerSized(edit, 'Edit rule');
      await press(edit);
      const editForm = page.getByRole('dialog', { name: 'Edit rule' });
      await editForm.waitFor();
      await editForm.getByRole('textbox', { name: 'Rule name' }).fill('Second rule v2');
      await press(editForm.getByRole('button', { name: 'Save changes' }));
      await waitForWrites(2);
      assert.equal(lastWrite().verb, 'PUT');
      assert.equal(lastWrite().path, '/api/presets/9');
      assert.equal(lastWrite().body.name, 'Second rule v2');
      await editForm.waitFor({ state: 'detached' });
      await rowMenu('Second rule v2').waitFor();
      await page.mouse.move(0, 0);

      // 3. Run it on the ad account: listed in the menu itself on a phone.
      menu = await openRowMenu('Second rule v2');
      const accountItem = page.getByRole('menuitemcheckbox', { name: /Leads account/ });
      if (phone) {
        assert.equal(await accountItem.count(), 1, 'the ad account is in the menu, not a submenu');
        assert.ok(await menu.locator('[role="menuitemcheckbox"]').count() === 1, 'the account item is inside the row menu');
        await fingerSized(accountItem, 'the ad account item');
      } else {
        await menu.getByRole('menuitem', { name: /Run on ad accounts/ }).hover();
      }
      await press(accountItem);
      await waitForWrites(3);
      assert.deepEqual(lastWrite(), {
        verb: 'POST', path: '/api/accounts/act_100/assign-rule',
        body: { preset_id: 9, scope: { level: 'account', ids: [] } },
      });
      if (phone) {
        // The menu stays open for another account; the check shows once saved.
        await page.waitForFunction(() => document.querySelector('[role="menuitemcheckbox"]')?.getAttribute('aria-checked') === 'true');
        await page.screenshot({ path: `${output}/accounts-${width}.png` });
      }
      await page.keyboard.press('Escape');
      await page.getByRole('menu').first().waitFor({ state: 'detached' });
      // Attached, it leaves the note to the first rule.
      await attachNote.filter({ hasText: '“First rule” runs nowhere yet.' }).waitFor();

      // 4. Delete it.
      menu = await openRowMenu('Second rule v2');
      await press(menu.getByRole('menuitem', { name: 'Delete rule' }));
      const confirm = page.getByRole('dialog', { name: /Delete/ });
      await confirm.waitFor();
      const confirmDelete = confirm.getByRole('button', { name: 'Delete' });
      await fingerSized(confirmDelete, 'Delete');
      await press(confirmDelete);
      await waitForWrites(4);
      assert.deepEqual(lastWrite(), { verb: 'DELETE', path: '/api/presets/9', body: null });
      await page.locator('[data-row-id="9"]').waitFor({ state: 'detached' });
      await page.locator('[data-row-id="7"]').waitFor();

      assert.deepEqual(errors, []);
      console.log(`Rules on a phone: create a second rule, edit, attach and delete passed at ${width}px`);
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
