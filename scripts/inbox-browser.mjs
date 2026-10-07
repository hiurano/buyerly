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

/** Waits for a save the page sends in the background. */
async function expectSaved(check, timeout = 5_000) {
  const until = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > until) throw new Error('The page did not save the change');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
function event(id, minutes, fields) {
  return {
    id, workspace_id: 7, actor_type: 'system', actor_id: null, category: 'RULE_ACTION', event_type: 'STOP',
    status: 'SUCCESS', account_id: 'act_1', account_name: 'Leads account', adset_id: '', adset_name: '',
    entity_level: 'adset', entity_id: String(900 + id), entity_name: `Ad set ${id}`, rule_id: 3,
    rule_name: 'Stop without leads', action: 'STOP', message: 'Spent $4.50 with 0 leads', correlation_id: null,
    reverts_event_id: null, reverted_by_event_id: null, is_reverted: false, display_status: 'SUCCESS',
    can_undo: false, undo_reason: '', duration_ms: 12, created_at: minutesAgo(minutes), kind: 'rule_actions',
    ...fields,
  };
}

/** Server semantics the UI relies on, kept in memory; the saved display gives the priority inbox. */
function inboxState(savedPriority) {
  const rows = [
    { ...event(4, 5, { event_type: 'NOTIFY_ONLY', action: 'NOTIFY_ONLY', message: 'CPL is $14, above the $12 goal', kind: 'rule_alerts' }), read: false, deleted: false, snoozed: null },
    { ...event(3, 60 * 3, {}), read: false, deleted: false, snoozed: null },
    { ...event(2, 60 * 30, { status: 'ERROR', display_status: 'ERROR', event_type: 'TOKEN_EXPIRED', message: 'Meta access expired', kind: 'urgent' }), read: true, deleted: false, snoozed: null },
    { ...event(1, 60 * 24 * 9, { message: 'Older stop' }), read: true, deleted: false, snoozed: null },
  ];
  const visible = (row, showSnoozed) => !row.deleted && (showSnoozed || !row.snoozed);
  const unread = () => rows.filter(row => visible(row, false) && !row.read).length;
  // Kinds and custom filters (#260): either puts a notification in Priority.
  const inPriority = (row, { kinds, rules = [] }) =>
    kinds.includes(row.kind) || rules.some(rule => matches(row, rule));
  // What every Inbox answer carries, as the server sends it.
  const counts = (priority = savedPriority()) => ({
    unread_count: unread(),
    priority_unread_count: rows.filter(row => visible(row, false) && !row.read && inPriority(row, priority)).length,
  });
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
    counts,
    list(params) {
      const showSnoozed = params.get('show_snoozed') === 'true';
      let items = rows.filter(row => visible(row, showSnoozed));
      if (params.get('unread_only') === 'true') items = items.filter(row => !row.read);
      const priority = params.has('priority') ? JSON.parse(params.get('priority')) : savedPriority();
      if (params.has('tab')) items = items.filter(row => inPriority(row, priority) === (params.get('tab') === 'priority'));
      const unfiltered = items.length;
      const clauses = JSON.parse(params.get('filter') || '[]');
      items = items.filter(row => matches(row, clauses));
      const hidden = unfiltered - items.length;
      if (params.get('ordering') === 'oldest') items = [...items].reverse();
      if (params.get('unread_first') === 'true') items = [...items].sort((a, b) => Number(a.read) - Number(b.read));
      return { items: items.map(item), has_more: false, ...counts(priority), hidden_by_filters: hidden };
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
    // Settings → Notifications → Email (#274, #275).
    const allKinds = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'];
    let savedChannels = {
      email: { enabled: true, priority_only: false, kinds: [...allKinds] },
      telegram: { enabled: false, priority_only: false, kinds: [...allKinds] },
    };
    // Settings → Connected accounts → Telegram (#277, #278).
    const noTelegram = { available: true, connected: false, username: null, first_name: null, connected_at: null, error: null };
    let telegram = { ...noTelegram };
    let telegramLinks = 0;
    await context.route('https://t.me/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Telegram</title>' }));
    const state = inboxState(() => ({
      kinds: savedDisplay.priority_kinds ?? ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'],
      rules: savedDisplay.priority_rules ?? [],
    }));
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
      if (path === '/api/notifications/channels') {
        if (verb === 'PUT') savedChannels = body;
        return route.fulfill({ json: savedChannels });
      }
      if (path === '/api/telegram/connection') {
        if (verb === 'DELETE') telegram = { ...noTelegram };
        return route.fulfill({ json: telegram });
      }
      if (verb === 'POST' && path === '/api/telegram/link') {
        telegramLinks += 1;
        return route.fulfill({ json: { url: `https://t.me/buyerly_test_bot?start=token${telegramLinks}`, expires_at: '' } });
      }
      if (verb !== 'GET') writes.push({ verb, path, body });
      if (verb === 'GET' && path === '/api/me') return route.fulfill({ json: owner });
      if (verb === 'GET' && path === '/api/inbox') return route.fulfill({ json: state.list(url.searchParams) });
      if (verb === 'GET' && path === '/api/inbox/facets') return route.fulfill({ json: state.facets() });
      // Everyone in the workspace, whether anything came from them yet or not (#271).
      if (verb === 'GET' && path === '/api/inbox/senders') {
        return route.fulfill({ json: [
          { value: 'user:1', label: 'Olga Owner', kind: 'user' },
          { value: 'user:2', label: 'Pavel Quiet', kind: 'user' },
          { value: 'rule:3', label: 'Stop without leads', kind: 'rule' },
          { value: 'buyerly', label: 'Buyerly', kind: 'buyerly' },
        ] });
      }
      if (verb === 'GET' && path === '/api/inbox/unread-count') return route.fulfill({ json: state.counts() });
      const action = path.match(/^\/api\/inbox\/(\d+)\/(read|delete|snooze)$/);
      if (verb === 'POST' && action) {
        const row = state.find(Number(action[1]));
        if (action[2] === 'read') row.read = body.read;
        if (action[2] === 'delete') row.deleted = true;
        // Snoozing keeps the read state, as in Linear; until null is Unsnooze.
        if (action[2] === 'snooze') row.snoozed = body.until;
        return route.fulfill({ json: { success: true, ...state.counts() } });
      }
      if (verb === 'POST' && path === '/api/inbox/delete-all-read') {
        state.rows.forEach(row => { if (row.read) row.deleted = true; });
        return route.fulfill({ json: { success: true, ...state.counts() } });
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
        // Measure once the 250ms scale-in has ended; mid-animation boxes are scaled.
        await Promise.all([addFilter, typeValues].map((menu) => menu.evaluate(
          (node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
        )));
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
        await Promise.all([rowMenu, snoozeSub].map((menu) => menu.evaluate(
          (node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
        )));
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
      const deletedAllRead = page.waitForResponse((response) => response.url().endsWith('/api/inbox/delete-all-read'));
      await page.keyboard.press('Shift+Backspace');
      await deletedAllRead;
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

      // Group unreads by Focus and priority inbox (#240), on a fresh set of notifications.
      state.rows.forEach((entry) => { entry.deleted = true; });
      state.rows.push(
        { ...event(10, 10, { event_type: 'TOKEN_EXPIRED', message: 'Focus urgent', kind: 'urgent' }), read: false, deleted: false, snoozed: null },
        { ...event(11, 20, { event_type: 'NOTIFY_ONLY', message: 'Focus alert one', kind: 'rule_alerts' }), read: false, deleted: false, snoozed: null },
        { ...event(12, 30, { event_type: 'NOTIFY_ONLY', message: 'Focus alert two', kind: 'rule_alerts' }), read: false, deleted: false, snoozed: null },
        { ...event(13, 40, { event_type: 'ACCOUNT_DAY_STARTED', message: 'Focus new day', kind: 'system', rule_id: null }), read: false, deleted: false, snoozed: null },
        { ...event(14, 5, { message: 'Focus read stop' }), read: true, deleted: false, snoozed: null },
      );
      await page.reload();
      await waitForRows(5);
      await page.getByRole('button', { name: 'Display options' }).click();
      const options = page.getByRole('dialog', { name: 'Display options' });
      await options.getByRole('combobox').filter({ hasText: 'No grouping' }).click();
      await page.getByRole('option', { name: 'Focus' }).click();
      await page.keyboard.press('Escape');
      const headers = page.locator('.linear-inbox-group-header');
      // A lone System notification is too small for Other, so the group takes its name, as in Linear.
      await page.waitForFunction(() => document.querySelectorAll('.linear-inbox-group-header').length === 4);
      assert.deepEqual(await headers.allInnerTexts(), ['Urgent', 'Rule alerts', 'System', 'Read']);
      assert.equal(savedDisplay.grouping, 'focus');
      const order = () => page.locator('[data-inbox-event-id]').evaluateAll(
        (nodes) => nodes.map((node) => Number(node.getAttribute('data-inbox-event-id'))),
      );
      // The newest read one still sits under Read, below every unread group.
      assert.deepEqual(await order(), [10, 11, 12, 13, 14]);
      await page.screenshot({ path: `${output}/focus-groups-${width}.png` });
      // Folding a group hides its rows; J skips them.
      await headers.filter({ hasText: 'Rule alerts' }).click();
      assert.equal(await headers.filter({ hasText: 'Rule alerts' }).getAttribute('aria-expanded'), 'false');
      assert.deepEqual(await order(), [10, 13, 14]);
      // Leave the folded header so J reaches the list; at 390px nothing beside the list is free to click.
      await page.evaluate(() => (document.activeElement)?.blur());
      await page.keyboard.press('j');
      await page.waitForFunction(() => /\/inbox\/10$/.test(location.pathname));
      await page.keyboard.press('j');
      await page.waitForFunction(() => /\/inbox\/13$/.test(location.pathname));
      // Reading them does not move them out of their groups while the list is open.
      assert.deepEqual(await headers.allInnerTexts(), ['Urgent', 'Rule alerts', 'System', 'Read']);
      await page.keyboard.press('Escape');
      await headers.filter({ hasText: 'Rule alerts' }).click();

      // Priority inbox: /inbox/priority with Priority N and Other tabs.
      await page.getByRole('button', { name: 'Display options' }).click();
      await options.getByRole('switch', { name: 'Enable priority inbox' }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/inbox/priority'));
      const tabs = page.getByRole('navigation', { name: 'Priority inbox' });
      // Two were read above, so two unread are left, both priority by default.
      assert.equal(await tabs.getByRole('link', { name: /^Priority/ }).textContent(), 'Priority2');
      assert.equal(await tabs.getByRole('link', { name: /^Other/ }).textContent(), 'Other');
      const include = options.getByRole('combobox', { name: 'Priority notification options' });
      assert.equal(await include.innerText(), 'All');
      await include.click();
      const kindsMenu = page.getByRole('listbox', { name: 'Priority notification options' });
      await kindsMenu.getByRole('option', { name: 'Rule alerts' }).click();
      assert.equal(await include.innerText(), '6 selected');
      await page.screenshot({ path: `${output}/priority-options-${width}.png` });
      await page.keyboard.press('Escape');
      assert.deepEqual(savedDisplay.priority_kinds, ['urgent', 'rule_actions', 'assistant', 'manual', 'team', 'system']);
      await page.waitForFunction(() => document.querySelector('[aria-label="Priority inbox"]')?.textContent === 'PriorityOther2');
      // Badge count: Priority only leaves the two Other ones out of the tab title.
      assert.equal(await page.title(), 'Inbox (2)');
      await options.getByRole('combobox').filter({ hasText: 'Priority & Other' }).click();
      await page.getByRole('option', { name: 'Priority only' }).click();
      await page.waitForFunction(() => document.title === 'Inbox');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await tabs.getByRole('link', { name: /^Other/ }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/inbox/other'));
      await page.waitForFunction(() => document.querySelectorAll('[data-inbox-event-id]').length === 2);
      assert.deepEqual((await order()).sort(), [11, 12]);
      await page.screenshot({ path: `${output}/priority-other-${width}.png` });
      await assertNoOverflow('priority inbox');
      // It all comes back after a reload, tab included.
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('[data-inbox-event-id]').length === 2);
      assert.equal(await tabs.getByRole('link', { name: /^Other/ }).getAttribute('aria-current'), 'page');
      // Add custom filters (#260): Linear opens Settings → Notifications →
      // Priority notifications, where a filter brings Rule alerts back to Priority.
      await page.getByRole('button', { name: 'Display options' }).click();
      await include.click();
      await kindsMenu.getByRole('option', { name: 'Add custom filters' }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/settings/account/notifications/priority-filter'));
      await page.getByRole('heading', { name: 'Priority notifications' }).waitFor();
      assert.equal(await page.getByRole('switch', { name: 'Rule alerts' }).getAttribute('aria-checked'), 'false');
      assert.equal(await page.getByRole('switch', { name: 'Urgent' }).getAttribute('aria-checked'), 'true');
      const customFilters = page.getByRole('region', { name: 'Custom filters' });
      await customFilters.getByText('No custom filters').waitFor();
      await customFilters.getByRole('button', { name: 'Add filter' }).click();
      assert.equal(await customFilters.getByRole('button', { name: 'Save' }).isDisabled(), true);
      await customFilters.getByRole('button', { name: 'Filter' }).click();
      await page.getByRole('dialog', { name: 'Add filter' }).getByRole('option', { name: /Notification type/ }).hover();
      await page.getByRole('dialog', { name: 'Notification type values' }).getByRole('option', { name: /Rule alert/ }).click();
      await page.keyboard.press('Escape');
      await customFilters.getByRole('button', { name: 'Save' }).click();
      await customFilters.getByText('1 custom filter').waitFor();
      assert.deepEqual(savedDisplay.priority_rules, [[{ field: 'type', operator: 'is', values: ['NOTIFY_ONLY'] }]]);
      assert.match(await customFilters.innerText(), /Include\s*Notification type\s*is\s*Rule alert/);
      await page.screenshot({ path: `${output}/priority-custom-filter-${width}.png` });
      await assertNoOverflow('priority notifications');
      // Back in Inbox both rule alerts are priority again, and the menu counts the filter.
      await page.goto(`${origin}/${workspace.slug}/inbox/priority`);
      await page.waitForFunction(() => document.querySelector('[aria-label="Priority inbox"]')?.textContent === 'Priority2Other');
      await page.waitForFunction(() => document.querySelectorAll('[data-inbox-event-id]').length === 5);
      await page.getByRole('button', { name: 'Display options' }).click();
      await include.click();
      await kindsMenu.getByRole('option', { name: '1 custom filter' }).waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // Edit and Delete sit behind "…" on the filter, as in Linear.
      await page.goto(`${origin}/${workspace.slug}/settings/account/notifications/priority-filter`);
      await customFilters.getByText('1 custom filter').waitFor();
      await customFilters.getByRole('button', { name: 'Custom filter actions' }).click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();
      // From lists every member, even one nothing came from, without counts (#271).
      await customFilters.getByRole('button', { name: 'Add another filter' }).click();
      await page.getByRole('dialog', { name: 'Add filter' }).getByRole('option', { name: /From/ }).hover();
      const ruleFrom = page.getByRole('dialog', { name: 'From values' });
      await ruleFrom.getByRole('option', { name: /Pavel Quiet/ }).waitFor();
      assert.equal(await ruleFrom.getByRole('option').count(), 4);
      assert.doesNotMatch(await ruleFrom.innerText(), /notification/);
      // People first, then rules tagged like Linear's agents ("Agent"), Buyerly last.
      assert.deepEqual(
        (await ruleFrom.getByRole('option').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim()),
        ['Olga Owner', 'Pavel Quiet', 'Stop without leads Rule', 'Buyerly'],
      );
      await page.keyboard.press('Escape');
      await customFilters.getByRole('button', { name: 'Cancel' }).click();
      await customFilters.getByRole('button', { name: 'Custom filter actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await customFilters.getByText('No custom filters').waitFor();
      assert.deepEqual(savedDisplay.priority_rules, []);
      // Settings → Notifications lists priority inbox and how many types go in it.
      await page.getByRole('button', { name: 'Notifications', exact: true }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/settings/account/notifications'));
      await page.getByRole('button', { name: /Priority notifications.*6 types/ }).waitFor();
      assert.equal(await page.getByRole('switch', { name: 'Priority inbox' }).getAttribute('aria-checked'), 'true');
      await page.screenshot({ path: `${output}/notifications-settings-${width}.png` });
      await page.goto(`${origin}/${workspace.slug}/inbox/other`);
      await page.waitForFunction(() => document.querySelectorAll('[data-inbox-event-id]').length === 2);

      // Turning priority inbox off goes back to /inbox.
      await page.getByRole('button', { name: 'Display options' }).click();
      await options.getByRole('switch', { name: 'Enable priority inbox' }).click();
      await page.waitForFunction(() => /\/inbox$/.test(location.pathname));
      await page.waitForFunction(() => document.title === 'Inbox (2)');
      await page.keyboard.press('Escape');
      // With it off, Linear dims Priority notifications, opens nothing and says why on hover (#273).
      await page.goto(`${origin}/${workspace.slug}/settings/account/notifications`);
      const dimmedRow = page.locator('.preferences-row-item--disabled', { hasText: 'Priority notifications' });
      await dimmedRow.waitFor();
      assert.equal(await page.getByRole('button', { name: /Priority notifications/ }).count(), 0);
      await dimmedRow.hover();
      await page.getByRole('tooltip').filter({ hasText: 'Enable priority inbox to customize priority types' }).waitFor();
      await dimmedRow.click();
      assert.ok(page.url().endsWith('/settings/account/notifications'));
      await page.screenshot({ path: `${output}/notifications-priority-off-${width}.png` });
      // By its link the page still opens, with the types dimmed and no custom filters.
      await page.goto(`${origin}/${workspace.slug}/settings/account/notifications/priority-filter`);
      await page.getByRole('heading', { name: 'Priority notifications' }).waitFor();
      assert.equal(await page.getByRole('switch', { name: 'Urgent' }).getAttribute('aria-disabled'), 'true');
      await page.getByRole('switch', { name: 'Urgent' }).click({ force: true });
      assert.deepEqual(savedDisplay.priority_kinds, ['urgent', 'rule_actions', 'assistant', 'manual', 'team', 'system']);
      assert.equal(await page.getByRole('region', { name: 'Custom filters' }).count(), 0);

      // Push notifications: Email and Telegram rows; the Email row follows Linear's wording (#274, #276).
      await page.goto(`${origin}/${workspace.slug}/settings/account/notifications`);
      await page.getByRole('heading', { name: 'Push notifications' }).waitFor();
      // Telegram stands where Linear has Slack: Disabled until an account is connected, yet it opens.
      await page.getByRole('button', { name: /^Telegram\s+Disabled/ }).waitFor();
      await page.getByRole('button', { name: /^Email\s+Enabled for all notifications/ }).waitFor();
      await page.screenshot({ path: `${output}/notifications-push-${width}.png` });

      // The Email page (#275): types switch one by one and are saved for the member.
      await page.getByRole('button', { name: /^Email/ }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/settings/account/notifications/email'));
      await page.getByRole('heading', { name: 'Email' }).waitFor();
      await page.getByText('Email notifications to owner@example.test').waitFor();
      // Priority inbox is off, so "Only deliver priority notifications" is dimmed and says why.
      const priorityOnly = page.getByRole('switch', { name: 'Only deliver priority notifications' });
      assert.equal(await priorityOnly.getAttribute('aria-disabled'), 'true');
      await page.locator('.preferences-row-item--disabled', { hasText: 'Only deliver priority notifications' }).hover();
      await page.getByRole('tooltip').filter({ hasText: "Priority inbox isn't enabled" }).waitFor();
      await page.getByRole('switch', { name: 'Team' }).click();
      await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Team"]')?.getAttribute('aria-checked') === 'false');
      await expectSaved(() => savedChannels.email.kinds.join() === 'urgent,rule_alerts,rule_actions,assistant,manual,system');
      await page.screenshot({ path: `${output}/notifications-email-${width}.png` });
      await page.locator('.preferences-breadcrumb').click();
      await page.getByRole('button', { name: /^Email\s+Enabled for urgent, rule alerts, 4 others/ }).waitFor();

      // Switching email off dims every type and the row says Disabled.
      await page.getByRole('button', { name: /^Email/ }).click();
      await page.getByRole('switch', { name: 'Enable email notifications' }).click();
      assert.equal(await page.getByRole('switch', { name: 'Urgent' }).getAttribute('aria-disabled'), 'true');
      await expectSaved(() => savedChannels.email.enabled === false);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Enable email notifications"]')?.getAttribute('aria-checked') === 'false');
      await page.goto(`${origin}/${workspace.slug}/settings/account/notifications`);
      await page.getByRole('button', { name: /^Email\s+Disabled/ }).waitFor();

      // Telegram page before connecting: Linear's "not connected" card and dimmed types (#277).
      await page.getByRole('button', { name: /^Telegram/ }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/settings/account/notifications/telegram'));
      await page.getByRole('heading', { name: 'Telegram' }).waitFor();
      assert.equal(await page.getByRole('switch', { name: 'Enable Telegram notifications' }).count(), 0);
      assert.equal(await page.getByRole('switch', { name: 'Urgent' }).getAttribute('aria-disabled'), 'true');
      await page.screenshot({ path: `${output}/notifications-telegram-off-${width}.png` });
      await page.getByRole('button', { name: /Personal Telegram account not connected\s+Connected accounts/ }).click();
      await page.waitForFunction(() => location.pathname.endsWith('/settings/account/connections'));
      await page.getByRole('heading', { name: 'Connected accounts' }).waitFor();
      await page.screenshot({ path: `${output}/connections-${width}.png` });

      // Connect opens the bot by a one-time link; pressing Start there shows up here.
      const popup = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const bot = await popup;
      await bot.waitForURL(/^https:\/\/t\.me\/buyerly_test_bot\?start=token1$/);
      await bot.close();
      telegram = { ...noTelegram, connected: true, username: 'acme_tg', first_name: 'Acme', connected_at: '2026-10-03T10:00:00Z' };
      savedChannels = { ...savedChannels, telegram: { enabled: true, priority_only: false, kinds: [...allKinds] } };
      await page.getByText('Telegram · @acme_tg').waitFor();
      await page.getByRole('button', { name: 'Connected', exact: true }).waitFor();
      await page.screenshot({ path: `${output}/connections-connected-${width}.png` });

      // Connected: the Telegram page has the channel switch, like Email, and the row its status (#278).
      await page.goto(`${origin}/${workspace.slug}/settings/account/notifications`);
      await page.getByRole('button', { name: /^Telegram\s+Enabled for all notifications/ }).click();
      await page.getByText('Telegram notifications to @acme_tg').waitFor();
      await page.getByRole('switch', { name: 'Rule alerts' }).click();
      await expectSaved(() => savedChannels.telegram.kinds.join() === 'urgent,rule_actions,assistant,manual,team,system');
      await page.screenshot({ path: `${output}/notifications-telegram-${width}.png` });

      // A blocked bot is shown above the switches.
      telegram = { ...telegram, error: 'blocked' };
      await page.reload();
      await page.getByText("Notifications can't be delivered: the bot is blocked").waitFor();

      // Disconnect: menu under Connected, Linear's confirmation, then Connect again.
      await page.goto(`${origin}/${workspace.slug}/settings/account/connections`);
      await page.getByRole('button', { name: 'Connected', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Disconnect personal Telegram account' }).click();
      await page.getByRole('dialog', { name: 'Disconnect personal Telegram account?' }).waitFor();
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await page.getByText('Disabled Telegram integration').waitFor();
      await page.getByRole('button', { name: 'Connect', exact: true }).waitFor();
      assert.equal(telegram.connected, false);

      // A rule alert opens its rule, its campaign and its ad set (#325).
      savedDisplay = { unread_only: false, ordering: 'newest', show_snoozed: false, unread_first: false };
      state.rows.push({
        ...event(50, 1, {
          event_type: 'NOTIFY_ONLY', action: 'NOTIFY_ONLY', message: 'Spend is $12 with no leads', kind: 'rule_alerts',
          rule_name: 'Spend alert', details: { campaign_id: '777' },
        }),
        read: false, deleted: false, snoozed: null,
      });
      await page.goto(`${origin}/${workspace.slug}/inbox/50`);
      const notification = page.getByRole('region', { name: 'Notification' });
      const ruleLink = notification.getByRole('link', { name: 'Spend alert' });
      await ruleLink.waitFor();
      assert.equal(await ruleLink.getAttribute('href'), `/${workspace.slug}/rules/3`);
      assert.equal(
        await notification.getByRole('link', { name: 'Open in Ads Manager' }).getAttribute('href'),
        `/${workspace.slug}/ads-manager/campaigns/777?account=act_1`,
      );
      assert.equal(
        await notification.getByRole('link', { name: 'Ad set 50' }).getAttribute('href'),
        `/${workspace.slug}/ads-manager/adsets/950?account=act_1`,
      );
      await ruleLink.click();
      await page.waitForFunction((path) => location.pathname === path, `/${workspace.slug}/rules/3`);

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
