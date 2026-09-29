// Exercise the real App with a synthetic API: Inbox behaves like Linear's —
// unread dots and counts, opening reads, J/K, U, H, Backspace, the row menu,
// Show unreads only and Display options.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-inbox';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
const workspace = {
  id: 7, slug: 'inbox-team', name: 'Inbox Team', role: 'owner',
  badge_text: 'IT', badge_color: '', logo_url: '', is_active: true,
};
const owner = {
  username: 'owner', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'owner@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
function event(id, minutes, fields) {
  return {
    id, workspace_id: 7, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'STOP',
    status: 'SUCCESS', account_id: 'act_1', account_name: 'Leads account', adset_id: '', adset_name: '',
    entity_level: 'adset', entity_id: String(900 + id), entity_name: `Ad set ${id}`, rule_id: 3,
    rule_name: 'Stop without leads', action: 'STOP', message: 'Spent $4.50 with 0 leads', correlation_id: null,
    reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
    can_undo: false, undo_reason: '', duration_ms: 12, created_at: minutesAgo(minutes),
    ...fields,
  };
}

/** Server semantics the UI relies on, kept in memory. */
function inboxState() {
  const rows = [
    { ...event(4, 5, { event_type: 'NOTIFY_ONLY', action: 'NOTIFY_ONLY', message: 'CPL is $14, above the $12 goal' }), read: false, deleted: false, snoozed: null },
    { ...event(3, 60 * 3, {}), read: false, deleted: false, snoozed: null },
    { ...event(2, 60 * 30, { status: 'ERROR', display_status: 'ERROR', event_type: 'TOKEN_EXPIRED', message: 'Meta access expired' }), read: true, deleted: false, snoozed: null },
    { ...event(1, 60 * 24 * 9, { message: 'Older stop' }), read: true, deleted: false, snoozed: null },
  ];
  const visible = (row, showSnoozed) => !row.deleted && (showSnoozed || !row.snoozed);
  const unread = () => rows.filter(row => visible(row, false) && !row.read).length;
  const item = ({ read, deleted, snoozed, ...fields }) => ({ ...fields, is_read: read, snoozed_until: snoozed });
  const fieldValue = (row, field) => ({
    type: row.event_type,
    status: row.status,
    account: row.account_id,
    from: row.actor_type === 'user' ? `user:${row.actor_id}` : row.rule_id ? `rule:${row.rule_id}` : 'buyerly',
  })[field];
  const matches = (row, clauses) => clauses.every(({ field, operator, values }) =>
    values.includes(fieldValue(row, field)) === (operator === 'is'));
  return {
    rows,
    unread,
    list(params) {
      const showSnoozed = params.get('show_snoozed') === 'true';
      let items = rows.filter(row => visible(row, showSnoozed));
      if (params.get('unread_only') === 'true') items = items.filter(row => !row.read);
      const unfiltered = items.length;
      const clauses = JSON.parse(params.get('filter') || '[]');
      items = items.filter(row => matches(row, clauses));
      const hidden = unfiltered - items.length;
      if (params.get('ordering') === 'oldest') items = [...items].reverse();
      if (params.get('unread_first') === 'true') items = [...items].sort((a, b) => Number(a.read) - Number(b.read));
      return { items: items.map(item), has_more: false, unread_count: unread(), hidden_by_filters: hidden };
    },
    facets() {
      const shown = rows.filter(row => visible(row, false));
      const facet = (field, label) => Object.values(shown.reduce((groups, row) => {
        const value = fieldValue(row, field);
        groups[value] ??= { value, label: label?.(row), count: 0 };
        groups[value].count += 1;
        return groups;
      }, {}));
      return {
        type: facet('type'), status: facet('status'),
        account: facet('account', row => row.account_name),
        from: facet('from', row => row.rule_name || 'Buyerly'),
      };
    },
    find: (id) => rows.find(row => row.id === id),
  };
}

const scenarios = [{ width: 1440 }, { width: 390 }];
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  for (const { width } of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const writes = [];
    const state = inboxState();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      const body = request.postDataJSON();
      if (verb !== 'GET') writes.push({ verb, path, body });
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: owner });
      if (verb === 'GET' && path === '/api/inbox') return route.fulfill({ json: state.list(url.searchParams) });
      if (verb === 'GET' && path === '/api/inbox/facets') return route.fulfill({ json: state.facets() });
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: state.unread() } });
      const action = path.match(/^\/api\/inbox\/(\d+)\/(read|delete|snooze)$/);
      if (verb === 'POST' && action) {
        const row = state.find(Number(action[1]));
        if (action[2] === 'read') row.read = body.read;
        if (action[2] === 'delete') row.deleted = true;
        if (action[2] === 'snooze') Object.assign(row, { snoozed: body.until, read: false });
        return route.fulfill({ json: { success: true, unread_count: state.unread() } });
      }
      if (verb === 'POST' && path === '/api/inbox/delete-all-read') {
        state.rows.forEach(row => { if (row.read) row.deleted = true; });
        return route.fulfill({ json: { success: true, unread_count: state.unread() } });
      }
      if (verb === 'GET' && ['/api/accounts', '/api/meta/connections', '/api/account-groups'].includes(path)) {
        return route.fulfill({ json: [] });
      }
      if (verb === 'GET') return route.fulfill({ json: [] });
      errors.push(`Unexpected API request: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    });

    const list = page.getByRole('listbox', { name: 'Notifications' });
    const rows = list.getByRole('option');
    const row = (text) => rows.filter({ hasText: text });
    const pathname = () => new URL(page.url()).pathname;
    // Lists refetch after a toggle; wait for the new rows instead of reading the old ones.
    const waitForRows = (count) => page.waitForFunction(
      (expected) => document.querySelectorAll('[data-inbox-event-id]').length === expected, count,
    );
    const phone = width < 768;
    const assertNoOverflow = async (where) => assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${where} at ${width}px: document overflow`,
    );
    try {
      await page.goto(`${origin}/${workspace.slug}/inbox`);
      await waitForRows(4);
      // Two unread: Linear's dot before the title, the count in the sidebar and tab title.
      assert.equal(await list.getByRole('option', { name: /^Unread: / }).count(), 2);
      await page.waitForFunction(() => document.title === 'Inbox (2)');
      if (!phone) {
        await page.getByText('2 unread notifications', { exact: true }).waitFor();
        assert.equal(await page.locator('.linear-sidebar-count').innerText(), '2');
      }
      for (const removed of ['Workspace activity', 'Search workspace events', 'Previous']) {
        assert.equal(await page.getByText(removed).count(), 0, `${removed} is gone`);
      }
      await assertNoOverflow('list');
      await page.screenshot({ path: `${output}/list-${width}.png` });

      // Filter, as in Linear: F opens "Add Filter…", Notification type lists the types with counts.
      await page.keyboard.press('f');
      await page.getByRole('dialog', { name: 'Add filter' }).getByRole('option', { name: /Notification type/ }).click();
      const typeValues = page.getByRole('dialog', { name: 'Notification type values' });
      assert.match(await typeValues.getByRole('option', { name: /Turned off/ }).innerText(), /2 notifications/);
      await typeValues.getByText(/options not matching any notifications/).waitFor();
      await page.screenshot({ path: `${output}/filter-menu-${width}.png` });
      await typeValues.getByRole('option', { name: /Rule alert/ }).click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await waitForRows(1);
      const bar = page.locator('[aria-label="Active filters"]');
      assert.match(await bar.innerText(), /Notification type\s*is\s*Rule alert/);
      await page.getByText('hidden by filters').waitFor();
      assert.match(await page.getByText('hidden by filters').locator('..').innerText(), /3 notifications hidden by filters/);
      assert.match(page.url(), /\?filter=/);
      // "is" turns into "is not", as in Linear's operator menu.
      await bar.getByRole('button', { name: 'is', exact: true }).click();
      await page.getByRole('dialog', { name: 'Notification type operator' }).getByRole('option', { name: 'is not' }).click();
      await waitForRows(3);
      await page.screenshot({ path: `${output}/filter-bar-${width}.png` });
      await page.getByRole('button', { name: /Clear Filters/ }).click();
      await waitForRows(4);
      assert.doesNotMatch(page.url(), /filter=/);
      assert.equal(await bar.count(), 0);

      // Opening a notification reads it and gives it its own address.
      await row('CPL is $14').click();
      assert.equal(pathname(), `/${workspace.slug}/inbox/4`);
      await page.getByRole('heading', { name: 'Rule alert', level: 2 }).waitFor();
      await page.waitForFunction(() => document.title === 'Inbox (1)');
      assert.deepEqual(writes.at(-1), { verb: 'POST', path: '/api/inbox/4/read', body: { read: true } });
      await assertNoOverflow('detail');
      await page.screenshot({ path: `${output}/detail-${width}.png` });

      // J opens the next one, U marks it unread again.
      await page.keyboard.press('j');
      await page.waitForURL(`**/${workspace.slug}/inbox/3`);
      await page.waitForFunction(() => document.title === 'Inbox');
      await page.keyboard.press('u');
      await page.waitForFunction(() => document.title === 'Inbox (1)');
      assert.deepEqual(writes.at(-1), { verb: 'POST', path: '/api/inbox/3/read', body: { read: false } });

      // Backspace deletes and Linear opens the next notification.
      await page.keyboard.press('Backspace');
      await page.waitForURL(`**/${workspace.slug}/inbox/2`);
      assert.deepEqual(writes.at(-1), { verb: 'POST', path: '/api/inbox/3/delete', body: null });
      // On a phone the list hides behind the open notification, so count the DOM.
      assert.equal(await page.locator('[data-inbox-event-id]').count(), 3);

      // H opens Snooze; the notification leaves the list until then.
      await page.keyboard.press('h');
      const snoozeMenu = page.getByRole('menu');
      await snoozeMenu.getByRole('menuitem', { name: /An hour from now/ }).waitFor();
      await page.screenshot({ path: `${output}/snooze-${width}.png` });
      await snoozeMenu.getByRole('menuitem', { name: /Tomorrow/ }).click();
      assert.equal(writes.at(-1).path, '/api/inbox/2/snooze');
      assert.ok(Date.parse(writes.at(-1).body.until) > Date.now());
      assert.equal(await row('Meta access expired').count(), 0);

      // Escape closes the notification.
      await page.keyboard.press('Escape');
      await page.waitForURL(`**/${workspace.slug}/inbox`);

      // Right-click menu, as in Linear.
      await row('Older stop').click({ button: 'right' });
      const rowMenu = page.getByRole('menu');
      await rowMenu.getByRole('menuitem', { name: /Mark as unread/ }).waitFor();
      await rowMenu.getByRole('menuitem', { name: /Delete notification/ }).waitFor();
      await rowMenu.getByRole('menuitem', { name: /Snooze/ }).waitFor();
      await page.screenshot({ path: `${output}/row-menu-${width}.png` });
      await rowMenu.getByRole('menuitem', { name: /Mark as unread/ }).click();
      await page.waitForFunction(() => document.title === 'Inbox (1)');

      // Show unreads only, then Linear's empty state once they are read.
      await page.getByRole('button', { name: 'Show unreads only' }).click();
      // The snoozed one is unread but hidden, so only the one just marked shows.
      await waitForRows(1);
      await row('Older stop').click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Show unreads only' }).click();
      await page.getByRole('button', { name: 'Show unreads only' }).click();
      await page.getByText('No unreads', { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/no-unreads-${width}.png` });
      await page.getByRole('button', { name: 'Show all notifications' }).click();
      await waitForRows(2);

      // Display options: Show snoozed brings the snoozed one back.
      await page.getByRole('button', { name: 'Display options' }).click();
      const display = page.getByRole('dialog', { name: 'Display options' });
      await display.getByText('Ordering').waitFor();
      await page.screenshot({ path: `${output}/display-${width}.png` });
      await display.getByRole('switch', { name: 'Show snoozed' }).click();
      await row('Meta access expired').waitFor();
      await page.keyboard.press('Escape');

      // Shift+Backspace deletes every read notification.
      await page.keyboard.press('Shift+Backspace');
      assert.equal(writes.at(-1).path, '/api/inbox/delete-all-read');
      await row('Older stop').waitFor({ state: 'detached' });
      await row('Meta access expired').waitFor();
      await assertNoOverflow('after delete all read');

      assert.deepEqual(errors, []);
      console.log(`Inbox: unread, open, J/U/Backspace/H, row menu, unreads only and display options passed at ${width}px`);
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
