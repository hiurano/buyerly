// Exercise the real App with a synthetic API: Inbox behaves like Linear's —
// unread dots and counts, opening reads, J/K, U, H, Backspace, the row menu,
// Show unreads only and Display options, which survive a reload.
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
  const item = ({ read, deleted, snoozed, unsnoozed, ...fields }) => ({
    ...fields, is_read: read, snoozed_until: snoozed, unsnoozed_at: unsnoozed ?? null,
  });
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
    // Display options are saved for the member on the server, as in Linear.
    let savedDisplay = { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false };
    const state = inboxState();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const verb = request.method();
      const body = request.postDataJSON();
      if (path === '/api/inbox/display') {
        if (verb === 'PUT') savedDisplay = body;
        return route.fulfill({ json: savedDisplay });
      }
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
        // Snoozing keeps the read state, as in Linear; until null is Unsnooze.
        if (action[2] === 'snooze') row.snoozed = body.until;
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
      const addFilter = page.getByRole('dialog', { name: 'Add filter' });
      assert.equal(await addFilter.getAttribute('class'), 'linear-menu-enter');
      const typeRow = addFilter.getByRole('option', { name: /Notification type/ });
      const typeValues = page.getByRole('dialog', { name: 'Notification type values' });
      const fromValues = page.getByRole('dialog', { name: 'From values' });
      // Hovering a property opens its values, no click needed, as in Linear.
      await typeRow.hover();
      await typeValues.waitFor();
      assert.match(await typeValues.getByRole('option', { name: /Turned off/ }).innerText(), /2 notifications/);
      await typeValues.getByText(/options not matching any notifications/).waitFor();
      // Fewer than five values: no search field, nothing highlighted until the pointer gets there.
      assert.equal(await typeValues.getByRole('searchbox').count(), 0);
      if (!phone) {
        assert.equal(await typeValues.getByRole('checkbox', { checked: false }).first().isVisible(), false);
        // To the right of the menu, with the first value level with the hovered row.
        const [rowBox, menuBox, valuesBox, firstValueBox] = await Promise.all([
          typeRow.boundingBox(), addFilter.boundingBox(), typeValues.boundingBox(),
          typeValues.getByRole('option').first().boundingBox(),
        ]);
        assert.ok(Math.abs(valuesBox.x - (menuBox.x + menuBox.width - 3)) <= 1, 'values open to the right');
        assert.ok(Math.abs(firstValueBox.y - rowBox.y) <= 1, 'first value level with the row');
        // Heading for the values across the From row keeps them open; stopping on From opens its own.
        const fromBox = await addFilter.getByRole('option', { name: /From/ }).boundingBox();
        await page.mouse.move(rowBox.x + 120, rowBox.y + rowBox.height / 2);
        await page.mouse.move(rowBox.x + 180, fromBox.y + fromBox.height / 2, { steps: 4 });
        await typeValues.waitFor();
        assert.equal(await fromValues.count(), 0);
        await page.mouse.move(rowBox.x + 170, fromBox.y + fromBox.height / 2, { steps: 2 });
        await fromValues.waitFor();
        await typeRow.hover();
      }
      await typeValues.waitFor();
      await page.screenshot({ path: `${output}/filter-menu-${width}.png` });
      await typeValues.getByRole('option', { name: /Rule alert/ }).click();
      // Escape closes the whole menu, as in Linear: the submenu goes at once, the menu fades out.
      await page.keyboard.press('Escape');
      assert.equal(await typeValues.count(), 0);
      assert.equal(await addFilter.getAttribute('class'), 'linear-menu-exit');
      await addFilter.waitFor({ state: 'detached' });
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

      // H opens Linear's snooze palette: the notification above a search, then the choices and Custom….
      await page.keyboard.press('h');
      const palette = page.getByRole('dialog', { name: 'Snooze notification', exact: true });
      const paletteSearch = palette.getByPlaceholder('Snooze notification until…');
      await paletteSearch.waitFor();
      await palette.getByText(/Meta access expired/).waitFor();
      for (const name of ['An hour from now', 'Tomorrow', 'Next week', 'A month from now', 'Custom…']) {
        await palette.getByRole('option', { name: new RegExp(name) }).waitFor();
      }
      await page.screenshot({ path: `${output}/snooze-${width}.png` });
      // Typed time replaces the choices with what it reads as; nonsense reads as nothing.
      await paletteSearch.fill('2 days');
      const inTwoDays = palette.getByRole('option', { name: /^In 2 days/ });
      await inTwoDays.waitFor();
      assert.equal(await palette.getByRole('option').count(), 1);
      await page.screenshot({ path: `${output}/snooze-typed-${width}.png` });
      await paletteSearch.fill('asdf');
      await inTwoDays.waitFor({ state: 'detached' });
      assert.equal(await palette.getByRole('option').count(), 0);
      await paletteSearch.fill('4 pm');
      await palette.getByRole('option', { name: /at 4:00 PM/ }).waitFor();
      await page.keyboard.press('Escape');
      await palette.waitFor({ state: 'detached' });
      assert.match(page.url(), /\/inbox\/2$/, 'Escape closes the palette, not the notification');

      // The header clock opens the same palette with Linear's "Try: …" hint; Custom… picks a day.
      await page.getByRole('button', { name: 'Snooze notification', exact: true }).click();
      await palette.getByPlaceholder('Try: 4 pm, 2 days, in 5 weeks…').waitFor();
      await palette.getByRole('option', { name: 'Custom…' }).click();
      const calendar = page.getByRole('dialog', { name: 'Snooze notification until' });
      await calendar.getByRole('button', { name: 'Apply' }).waitFor();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayName = (date) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
      assert.equal(await calendar.getByRole('button', { name: dayName(tomorrow) }).getAttribute('aria-pressed'), 'true', 'tomorrow picked');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      // The calendar starts at tomorrow's month, so yesterday shows only when that is the same month.
      if (yesterday.getMonth() === tomorrow.getMonth()) {
        assert.ok(await calendar.getByRole('button', { name: dayName(yesterday) }).isDisabled(), 'past days are off');
      }
      await page.screenshot({ path: `${output}/snooze-custom-${width}.png` });
      const inFiveDays = new Date();
      inFiveDays.setDate(inFiveDays.getDate() + 5);
      // Two months show, from tomorrow's, so five days ahead is always on screen.
      await calendar.getByRole('button', { name: dayName(inFiveDays) }).click();
      await calendar.getByRole('button', { name: 'Apply' }).click();
      await calendar.waitFor({ state: 'detached' });
      assert.equal(writes.at(-1).path, '/api/inbox/2/snooze');
      const until = new Date(writes.at(-1).body.until);
      assert.equal(until.toDateString(), inFiveDays.toDateString(), 'Apply snoozes to the picked day');
      assert.equal(`${until.getHours()}:${until.getMinutes()}`, '9:0', 'at 9:00, as Linear');
      assert.equal(await row('Meta access expired').count(), 0);

      // Escape closes the notification.
      await page.keyboard.press('Escape');
      await page.waitForURL(`**/${workspace.slug}/inbox`);

      // Right-click menu, as in Linear.
      await row('Older stop').click({ button: 'right' });
      const rowMenu = page.getByRole('menu').filter({ hasText: 'Delete notification' });
      await rowMenu.getByRole('menuitem', { name: /Mark as unread/ }).waitFor();
      await rowMenu.getByRole('menuitem', { name: /Delete notification/ }).waitFor();
      await rowMenu.getByRole('menuitem', { name: /Snooze/ }).waitFor();
      if (!phone) {
        // Snooze opens on hover to the right, its first choice level with the Snooze row, as in Linear.
        const snoozeItem = rowMenu.getByRole('menuitem', { name: /Snooze/ });
        await snoozeItem.hover();
        const snoozeSub = page.getByRole('menu').filter({ hasText: 'Tomorrow' });
        await snoozeSub.waitFor();
        const [itemBox, subBox, firstBox] = await Promise.all([
          snoozeItem.boundingBox(), snoozeSub.boundingBox(), snoozeSub.getByRole('menuitem').first().boundingBox(),
        ]);
        assert.ok(Math.abs(firstBox.y - itemBox.y) <= 1, 'first snooze choice level with Snooze');
        assert.ok(subBox.x > itemBox.x, 'snooze choices to the right');
        // The search sits above the choices and reads typed time, as in Linear.
        const subSearch = snoozeSub.getByPlaceholder('Try: 4 pm, 2 days, in 5 weeks…');
        assert.ok((await subSearch.boundingBox()).y < firstBox.y, 'search above the choices');
        await snoozeSub.getByRole('menuitem', { name: 'Custom…' }).waitFor();
        await subSearch.click();
        await page.keyboard.type('in 5 weeks');
        const searchedSub = page.getByRole('menu').filter({ has: page.getByPlaceholder('Try: 4 pm, 2 days, in 5 weeks…') });
        await searchedSub.getByRole('menuitem', { name: /^In 5 weeks/ }).waitFor();
        assert.equal(await searchedSub.getByRole('menuitem').count(), 1);
        await page.screenshot({ path: `${output}/row-snooze-typed-${width}.png` });
        await rowMenu.getByRole('menuitem', { name: /Mark as unread/ }).hover();
        await snoozeSub.waitFor({ state: 'detached' });
      }
      await page.screenshot({ path: `${output}/row-menu-${width}.png` });
      await rowMenu.getByRole('menuitem', { name: /Mark as unread/ }).click();
      await page.waitForFunction(() => document.title === 'Inbox (1)');

      // Show unreads only, then Linear's empty state once they are read.
      await page.getByRole('button', { name: 'Show unreads only' }).click();
      // The snoozed one is hidden, so only the one just marked shows.
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
      // One whose snooze ran out comes back unread with "Unsnoozed …" (the server puts it on top).
      Object.assign(state.find(1), { read: false, unsnoozed: minutesAgo(2) });
      await display.getByRole('switch', { name: 'Show snoozed' }).click();
      await row('Meta access expired').waitFor();
      await page.keyboard.press('Escape');
      const metaRow = page.locator('[data-inbox-event-id="2"]');
      // Snoozed five days ahead at 9:00: Linear rounds what is left to 4d or 5d.
      const snoozedLine = metaRow.getByText(/^Snoozed for [45]d$/);
      await snoozedLine.waitFor();
      assert.match(await snoozedLine.getAttribute('title'), /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?, 9:00 AM$/, 'snooze time on hover');
      const metaBox = await metaRow.boundingBox();
      assert.ok(Math.abs(metaBox.height - 79) <= 1, `a snoozed row grows by one line, got ${metaBox.height}`);
      await page.locator('[data-inbox-event-id="1"]').getByText('Unsnoozed 2 minutes ago', { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/snoozed-rows-${width}.png` });

      // Unsnooze comes first for a snoozed one, as in Linear, and puts it back as it was.
      if (!phone) {
        await row('Meta access expired').click({ button: 'right' });
        const metaMenu = page.getByRole('menu').filter({ hasText: 'Delete notification' });
        const snoozeEntry = metaMenu.getByRole('menuitem', { name: /Snooze/ });
        await snoozeEntry.hover();
        const unsnoozeSub = page.getByRole('menu').filter({ hasText: 'Unsnooze notification' });
        await unsnoozeSub.waitFor();
        const unsnooze = unsnoozeSub.getByRole('menuitem').first();
        assert.match(await unsnooze.innerText(), /^Unsnooze notification\s+Snoozed for [45]d$/);
        const [entryBox, unsnoozeBox] = await Promise.all([snoozeEntry.boundingBox(), unsnooze.boundingBox()]);
        assert.ok(Math.abs(entryBox.y - unsnoozeBox.y) <= 1, 'Unsnooze level with Snooze');
        await page.screenshot({ path: `${output}/row-unsnooze-${width}.png` });
        await unsnooze.click();
      } else {
        await row('Meta access expired').click();
        await page.keyboard.press('h');
        const unsnooze = palette.getByRole('option').first();
        assert.match(await unsnooze.innerText(), /^Unsnooze notification\s+Snoozed for [45]d$/);
        await page.screenshot({ path: `${output}/palette-unsnooze-${width}.png` });
        await unsnooze.click();
        await palette.waitFor({ state: 'detached' });
        await page.keyboard.press('Escape');
      }
      assert.deepEqual(writes.at(-1), { verb: 'POST', path: '/api/inbox/2/snooze', body: { until: null } });
      await snoozedLine.waitFor({ state: 'detached' });
      await row('Meta access expired').waitFor();

      // Shift+Backspace deletes every read notification; the one back from snooze is unread.
      await page.keyboard.press('Shift+Backspace');
      assert.equal(writes.at(-1).path, '/api/inbox/delete-all-read');
      await row('Meta access expired').waitFor({ state: 'detached' });
      await row('Older stop').waitFor();
      await assertNoOverflow('after delete all read');

      // Display options survive a reload: Show snoozed is still on.
      assert.equal(savedDisplay.show_snoozed, true, 'Show snoozed saved');
      await page.reload();
      await row('Older stop').waitFor();
      await page.getByRole('button', { name: 'Display options' }).click();
      const reloaded = page.getByRole('dialog', { name: 'Display options' });
      assert.equal(await reloaded.getByRole('switch', { name: 'Show snoozed' }).getAttribute('aria-checked'), 'true');
      await page.keyboard.press('Escape');

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
