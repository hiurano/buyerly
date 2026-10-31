// Exercise the real App with a synthetic API: Filter and Display options on
// the workspace Members and Teams pages, as Linear's.
// - Members: ordering by Name, Role or Joined (the header or Display options),
//   Role, Joined and Teams as display properties, a Role filter; the view is
//   saved under "members" and the filter rides in the address.
// - Teams: ordering by Name or Created, ID, Membership, Owners, Ad accounts,
//   Created and Members as display properties (Owners, Ad accounts and Created
//   off by default), filters by Team name, Members, Owners, Private and Created
//   date; saved under "teams".
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(require.resolve('vite'));
const root = new URL('../frontend/', import.meta.url).pathname;
process.chdir(root);
const output = '/tmp/buyerly-workspace-lists';
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });

const workspace = { id: 1, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true };
const me = {
  id: 5, username: 'olga', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const member = (id, user_id, full_name, role, joined_at) => ({
  id, user_id, username: full_name.split(' ')[0].toLowerCase(), full_name, email: null, avatar_url: '', role, joined_at, is_current_user: user_id === 5,
});
const members = [
  member(1, 5, 'Olga Owner', 'owner', '2026-08-01T10:00:00Z'),
  member(2, 6, 'Anna Admin', 'admin', '2026-09-01T10:00:00Z'),
  member(3, 7, 'Bob Buyer', 'member', '2026-10-01T10:00:00Z'),
];
const team = (id, name, key, fields) => ({
  id, name, key, description: '', created_at: '2026-09-01T10:00:00Z', retired_at: null, deleted_at: null, restorable_until: null,
  member_user_ids: [5], owner_user_ids: [5], account_ids: [], is_member: true, private: false, ...fields,
});
const teams = [
  team(10, 'Media', 'MED', { member_user_ids: [5, 7], account_ids: [101, 102] }),
  team(11, 'Ops', 'OPS', { private: true, created_at: '2026-10-15T10:00:00Z', member_user_ids: [5, 6], owner_user_ids: [6] }),
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const page = await context.newPage();
  await mockSync(page);
  page.setDefaultTimeout(10_000);
  const errors = [];
  const views = {};
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const verb = request.method();
    if (path === '/api/view-settings') return route.fulfill({ json: { views } });
    const key = path.match(/^\/api\/view-settings\/([\w.-]+)$/)?.[1];
    if (key && verb === 'PUT') {
      views[key] = request.postDataJSON().settings;
      return route.fulfill({ json: { view_key: key, settings: views[key] } });
    }
    if (key && verb === 'DELETE') {
      delete views[key];
      return route.fulfill({ status: 204, body: '' });
    }
    if (verb !== 'GET') {
      errors.push(`Unexpected write: ${verb} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/workspaces/1/teams') return route.fulfill({ json: teams });
    if (path === '/api/workspaces/1/members') return route.fulfill({ json: members });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    return route.fulfill({ json: [] });
  });

  const rowIds = () => page.locator('main [data-row-id]').evaluateAll((rows) => rows.map((row) => row.dataset.rowId));
  const headers = async () => (await page.getByRole('columnheader').allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  const popover = page.locator('.buyerly-display-options-popover');
  const property = (name) => popover.locator('.buyerly-display-property', { hasText: new RegExp(`^${name}$`) });
  const bar = page.locator('[aria-label="Active filters"]');
  const menu = page.getByRole('dialog', { name: 'Add filter' });
  const settle = () => page.waitForTimeout(400);

  try {
    // Members.
    await page.goto(`${origin}/alpha/members`, { timeout: 120_000 });
    await page.locator('main [data-row-id="7"]').waitFor();
    await page.getByRole('button', { name: 'Display options' }).waitFor();
    assert.deepEqual(await headers(), ['Name', 'Role', 'Joined', 'Teams']);
    assert.deepEqual(await rowIds(), ['6', '7', '5'], 'Name A to Z');
    await page.getByRole('button', { name: 'Order by Role' }).click();
    assert.deepEqual(await rowIds(), ['5', '6', '7'], 'Owner, Admin, Member');
    await settle();
    assert.equal(views.members.ordering, 'role');

    await page.keyboard.press('Shift+V');
    await popover.waitFor();
    assert.match(await popover.innerText(), /Ordering[\s\S]*Display properties/);
    assert.doesNotMatch(await popover.innerText(), /List options|Grouping/);
    await property('Joined').click();
    assert.deepEqual(await headers(), ['Name', 'Role', 'Teams']);
    await settle();
    assert.equal(views.members.properties.joined, false);
    await popover.getByRole('button', { name: 'Reset to default' }).click();
    assert.deepEqual(await headers(), ['Name', 'Role', 'Joined', 'Teams']);
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'detached' });

    await page.keyboard.press('f');
    await menu.getByRole('option', { name: 'Role' }).click();
    await page.getByRole('listbox', { name: 'Role values' }).getByRole('option', { name: /^Admin/ }).click();
    await page.keyboard.press('Escape');
    await page.locator('main [data-row-id="5"]').waitFor({ state: 'detached' });
    assert.deepEqual(await rowIds(), ['6']);
    assert.match(await bar.innerText(), /Role\s*is\s*Admin/);
    assert.match(new URL(page.url()).searchParams.get('filter'), /"role"/);
    await bar.getByRole('button', { name: 'Clear all filters' }).click();
    await page.locator('main [data-row-id="5"]').waitFor();
    await page.screenshot({ path: `${output}/members-1440.png` });
    console.log('Members: ordering, display properties and the Role filter passed');

    // Teams.
    await page.goto(`${origin}/alpha/teams`);
    await page.locator('main [data-row-id="OPS"]').waitFor();
    assert.deepEqual(await headers(), ['Name', 'Membership', 'Members']);
    assert.deepEqual(await rowIds(), ['MED', 'OPS']);
    assert.match(await page.locator('main [data-row-id="MED"]').innerText(), /Media\s*MED/);

    await page.getByRole('button', { name: 'Display options' }).click();
    await popover.waitFor();
    for (const name of ['Owners', 'Ad accounts', 'Created']) {
      await property(name).click();
      await settle();
    }
    assert.deepEqual(await headers(), ['Name', 'Membership', 'Owners', 'Ad accounts', 'Created', 'Members']);
    assert.match(await page.locator('main [data-row-id="MED"]').innerText(), /2 accounts[\s\S]*Sep 1/);
    await property('ID').click();
    assert.doesNotMatch(await page.locator('main [data-row-id="MED"]').innerText(), /MED/);
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Order by Created' }).click();
    await page.getByRole('button', { name: 'Order by Created' }).click();
    assert.deepEqual(await rowIds(), ['OPS', 'MED'], 'newest first');
    await settle();
    assert.deepEqual(views.teams.properties, { id: false, membership: true, owners: true, accounts: true, created: true, members: true });
    assert.equal(views.teams.ordering, 'created');
    assert.equal(views.teams.direction, 'desc');

    await page.keyboard.press('f');
    assert.deepEqual(
      (await menu.getByRole('option').allInnerTexts()).map((text) => text.split('\n')[0].trim()),
      ['Team name', 'Members', 'Owners', 'Private', 'Dates'],
    );
    await menu.getByRole('option', { name: 'Private' }).click();
    await page.getByRole('listbox', { name: 'Private values' }).getByRole('option', { name: /^Private/ }).click();
    await page.keyboard.press('Escape');
    await page.locator('main [data-row-id="MED"]').waitFor({ state: 'detached' });
    assert.deepEqual(await rowIds(), ['OPS']);
    await bar.getByRole('button', { name: 'Clear all filters' }).click();
    // Owners from a link.
    const link = encodeURIComponent(JSON.stringify([{ fieldId: 'owners', operator: 'is', values: ['6'] }]));
    await page.goto(`${origin}/alpha/teams?filter=${link}`);
    await page.locator('main [data-row-id="OPS"]').waitFor();
    assert.deepEqual(await rowIds(), ['OPS']);
    assert.match(await bar.innerText(), /Owners\s*is\s*Anna Admin/);
    await page.screenshot({ path: `${output}/teams-1440.png` });
    assert.deepEqual(errors, []);
    console.log('Teams: ordering, display properties and filters passed');

    // A team's Home, as Linear's: the star and the team menu after its name, a labelled "Add a member" on Members.
    await page.goto(`${origin}/alpha/team/MED/overview`);
    await page.locator('.team-overview').waitFor();
    await page.locator('main header').getByRole('button', { name: /favorites/i }).waitFor();
    await page.getByRole('button', { name: 'Team actions' }).click();
    assert.deepEqual((await page.getByRole('menuitem').allInnerTexts()).map((text) => text.trim()), ['Team settings', 'Open archive']);
    await page.getByRole('menuitem', { name: 'Open archive' }).click();
    await page.waitForURL(`${origin}/alpha/team/MED/rules/recently-deleted`);
    await page.goto(`${origin}/alpha/team/MED/members`);
    await page.getByRole('button', { name: 'Add a member' }).waitFor();
    assert.deepEqual(await headers(), ['Name', 'Email', 'Role']);
    console.log('Team Home: header actions and Members passed');
  } catch (error) {
    console.error(error);
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
