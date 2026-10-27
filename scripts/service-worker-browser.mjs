// The service worker (#499) on two real builds, served as api/server.py serves
// them: /sw.js uncached, /assets immutable, the app's addresses as index.html.
//
// - The first visit installs the worker, which caches every file of the build.
// - A reload, and a new tab after every tab closed, load HTML, JS, CSS and fonts
//   from the worker: not one of them reaches the server.
// - Offline, the app still opens and draws Members from the local database (#496).
// - A deploy (build B replaces build A on the server) installs in the
//   background; both open tabs then show "New version available", the old tab
//   still loads build A's chunks, and Reload loads build B whole, from the cache.
// - SERVICE_WORKER=off's kill switch drops the worker and its caches: the next
//   load comes from the network.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockSync } from './sync-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const root = fileURLToPath(new URL('../frontend/', import.meta.url));
process.chdir(root);
const output = join(tmpdir(), 'buyerly-service-worker');
await mkdir(output, { recursive: true });

// Two deploys of the same source: the release is baked into the bundle, so every chunk that reads it differs.
const builds = {};
for (const release of ['release-a', 'release-b']) {
  const outDir = join(output, release);
  await rm(outDir, { recursive: true, force: true });
  process.env.APP_VERSION = release;
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const index = readFileSync(join(outDir, 'index.html'), 'utf8');
  const worker = readFileSync(join(outDir, 'sw.js'), 'utf8');
  builds[release] = {
    dir: outDir,
    entry: index.match(/src="(\/assets\/index-[\w-]+\.js)"/)[1],
    files: JSON.parse(worker.match(/const BUILD = (\{.*?\});\n/)[1]).files,
  };
}
const A = builds['release-a'];
const B = builds['release-b'];
assert.notEqual(A.entry, B.entry, 'the two releases are two builds');

// The server: one build at a time, as a deploy replaces frontend/dist.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let deployed = A;
let killSwitch = false;
/** Every file the server sent, by path. */
const served = [];
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://server').pathname;
  const send = (file, cache) => {
    served.push(path);
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
    response.end(readFileSync(file));
  };
  if (path === '/sw.js') return send(join(deployed.dir, killSwitch ? 'sw-off.js' : 'sw.js'), 'no-cache, no-store');
  const file = join(deployed.dir, path);
  if (path !== '/' && existsSync(file) && statSync(file).isFile()) {
    return send(file, path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  }
  if (extname(path) || path.startsWith('/api/')) {
    served.push(`404 ${path}`);
    response.writeHead(404);
    return response.end();
  }
  return send(join(deployed.dir, 'index.html'), 'no-cache, no-store, must-revalidate');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
/** What the server sent of the app itself: HTML, JS, CSS and fonts (not the worker script, which browsers always ask for). */
const appFiles = (paths) => paths.filter((path) => path !== '/sw.js' && !/\.(svg|png|ico)$/.test(path));

const workspace = {
  id: 7, slug: 'alpha', name: 'Alpha', role: 'owner', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', is_active: true,
};
const me = {
  id: 1, username: 'olga', full_name: 'Olga Owner', first_name: 'Olga', last_name: 'Owner',
  email: 'olga@example.test', email_verified: true, unconfirmed_email: null, avatar_url: '',
  onboarding_completed: true, onboarding_step: 'completed', active_workspace: workspace, workspaces: [workspace],
};
const user = (id, username, full_name) => ({
  id, username, full_name, first_name: full_name.split(' ')[0], last_name: full_name.split(' ')[1], title: '',
  email: `${username}@example.test`, avatar_url: '', created_at: '2026-09-01T10:00:00',
});
const models = {
  Workspace: [{ id: 7, name: 'Alpha', slug: 'alpha', badge_text: 'A', badge_color: '#5E6AD2', logo_url: '', owner_user_id: 1 }],
  User: [user(1, 'olga', 'Olga Owner'), user(2, 'bob', 'Bob Buyer')],
  WorkspaceMember: [
    { id: 11, workspace_id: 7, user_id: 1, role: 'owner', joined_at: '2026-09-01T10:00:00' },
    { id: 12, workspace_id: 7, user_id: 2, role: 'member', joined_at: '2026-09-02T10:00:00' },
  ],
  Team: [], TeamMember: [], TeamAccount: [], TeamDocument: [], Account: [], Rule: [], Label: [], RuleLabel: [],
  InboxEvent: [], InboxNotificationState: [], Favorite: [], ViewSetting: [], WorkspaceViewDefault: [], AccountNotificationSetting: [],
};
const syncGroups = ['workspace:7', 'workspace:7:members', 'member:11'];

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const errors = [];
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: deployed === A ? 'release-a' : 'release-b' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
    }
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
    if (path === '/api/workspaces/7/invites') return route.fulfill({ json: [] });
    if (path === '/api/accounts' || path === '/api/meta/connections') return route.fulfill({ json: [] });
    if (path === '/api/analytics/hierarchy/accounts') {
      return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts: [], missing: [] } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    errors.push(`Unexpected API request: GET ${path}`);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });

  /** A tab on the synthetic API; `responses` are the app's own files it loaded, and from where. */
  const openTab = async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (error) => errors.push(error.message));
    const responses = [];
    page.on('response', (response) => {
      const type = response.request().resourceType();
      if (!['document', 'script', 'stylesheet', 'font'].includes(type)) return;
      if (!response.url().startsWith(origin)) return;
      responses.push({ type, path: new URL(response.url()).pathname, worker: response.fromServiceWorker() });
    });
    await mockSync(page, { models, lastSyncId: 100, syncGroups });
    return { page, responses };
  };
  const members = (page) => page.locator('main').getByText('Bob Buyer', { exact: true }).waitFor();
  const entryOf = (page) => page.evaluate(() => new URL(document.querySelector('script[type="module"][src*="/assets/index-"]').src).pathname);
  const appCaches = (page) => page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('buyerly-app-')));

  // The first visit comes from the network; the worker then caches the build and takes the tab.
  let tab = await openTab();
  await tab.page.goto(`${origin}/alpha/members`, { timeout: 120_000 });
  await members(tab.page);
  await tab.page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  const firstCache = await tab.page.evaluate(async () => {
    const [name] = (await caches.keys()).filter((key) => key.startsWith('buyerly-app-'));
    return { name, files: (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname) };
  });
  assert.match(firstCache.name, /^buyerly-app-release-a-/);
  assert.deepEqual(firstCache.files.sort(), [...A.files].sort(), 'the worker caches every file of the build');
  assert.ok(A.files.filter((file) => file.endsWith('.js')).length > 50, 'route and feature chunks, not one bundle');
  // The page's own chunks prefetch while idle (#494); let them finish before counting.
  await tab.page.waitForTimeout(2_000);

  // A reload: not one file of the app from the network.
  served.length = 0;
  tab.responses.length = 0;
  await tab.page.reload();
  await members(tab.page);
  await tab.page.waitForTimeout(2_000);
  assert.deepEqual(appFiles(served), [], 'a reload asks the server for no HTML, JS, CSS or font');
  const reloaded = tab.responses.filter(({ worker }) => worker).length;
  assert.ok(reloaded > 10, `the reload loaded its files from the worker (${reloaded})`);
  assert.deepEqual(tab.responses.filter(({ worker }) => !worker), [], 'every file of the reload came from the worker');

  // Every tab closed, then a new one, as a browser restart: the same.
  await tab.page.close();
  served.length = 0;
  tab = await openTab();
  await tab.page.goto(`${origin}/alpha/members`);
  await members(tab.page);
  await tab.page.waitForTimeout(2_000);
  assert.deepEqual(appFiles(served), [], 'a new tab asks the server for no HTML, JS, CSS or font');
  assert.deepEqual(tab.responses.filter(({ worker }) => !worker), []);
  const fromWorker = tab.responses.length;
  console.log(`Cold start: ${fromWorker} files (${[...new Set(tab.responses.map(({ type }) => type))].join(', ')}) from the service worker, 0 from the network`);
  await tab.page.screenshot({ path: `${output}/cold-start.png` });

  // Offline: the app opens from the worker and draws Members from the local database.
  await context.setOffline(true);
  const offline = await openTab();
  await offline.page.goto(`${origin}/alpha/members`);
  await members(offline.page);
  // The profile stays: /api/me failing offline is not a sign-out.
  await offline.page.waitForTimeout(2_000);
  assert.equal(new URL(offline.page.url()).pathname, '/alpha/members');
  await members(offline.page);
  await offline.page.screenshot({ path: `${output}/offline.png` });
  await offline.page.close();
  await context.setOffline(false);

  // A deploy: build B replaces build A on the server, with two tabs open on A.
  const second = await openTab();
  await second.page.goto(`${origin}/alpha/members`);
  await members(second.page);
  assert.equal(await entryOf(tab.page), A.entry);
  deployed = B;
  served.length = 0;
  // The tab coming back into view asks the worker for a new build, which installs in the background.
  await tab.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  for (const { page } of [tab, second]) await page.getByText('New version available', { exact: true }).waitFor({ timeout: 30_000 });
  // Chunks that did not change keep their names, and the HTTP cache already holds them.
  assert.deepEqual(appFiles(served).filter((path) => !B.files.includes(path)), [], 'only the new build is fetched');
  assert.ok(served.includes(B.entry) && served.includes('/index.html'), 'the new build is fetched in the background');
  await tab.page.screenshot({ path: `${output}/new-version.png` });
  // The old tab still runs build A: its chunks come from A's cache, which the server no longer has.
  const oldChunk = A.files.find((file) => file.endsWith('.js') && !B.files.includes(file));
  assert.equal(await tab.page.evaluate((path) => fetch(path).then((response) => response.status), oldChunk), 200);

  // Reload: the new worker takes over and the tab loads build B, all from its cache.
  served.length = 0;
  tab.responses.length = 0;
  await Promise.all([
    tab.page.waitForEvent('load'),
    tab.page.getByRole('button', { name: 'Reload', exact: true }).click(),
  ]);
  await members(tab.page);
  assert.equal(await entryOf(tab.page), B.entry, 'Reload loads the new build');
  await tab.page.waitForTimeout(2_000);
  assert.deepEqual(appFiles(served), [], 'the new build loads from the cache');
  const loaded = tab.responses.map(({ path }) => path);
  assert.deepEqual(loaded.filter((path) => path.startsWith('/assets/') && !B.files.includes(path)), [], 'nothing of build A in the new page');
  assert.equal(await tab.page.getByText('New version available', { exact: true }).count(), 0);
  // The other tab stays on A until its own Reload; A's cache stays for it.
  assert.equal((await appCaches(tab.page)).length, 2, 'the previous build is kept while a tab may still run it');
  await Promise.all([
    second.page.waitForEvent('load'),
    second.page.getByRole('button', { name: 'Reload', exact: true }).click(),
  ]);
  await members(second.page);
  assert.equal(await entryOf(second.page), B.entry);
  await second.page.close();

  // The kill switch: the next update check finds sw-off.js, which deletes the caches and unregisters.
  killSwitch = true;
  await tab.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const gone = async () => tab.page.evaluate(async () => (await caches.keys()).length === 0 && (await navigator.serviceWorker.getRegistrations()).length === 0);
  for (const deadline = Date.now() + 30_000; !(await gone());) {
    assert.ok(Date.now() < deadline, 'the kill switch removes the worker and its caches');
    await tab.page.waitForTimeout(200);
  }
  served.length = 0;
  await tab.page.reload();
  await members(tab.page);
  assert.ok(appFiles(served).includes('/index.html') || appFiles(served).includes('/alpha/members'), 'with the worker gone, the page comes from the network');

  assert.deepEqual(errors, []);
  console.log('Service worker: caches the whole build, reloads and new tabs load nothing from the network, opens offline from the local database, a deploy installs in the background and Reload loads it whole, the kill switch removes it');
} catch (error) {
  for (const page of browser?.contexts()[0]?.pages() ?? []) {
    await page.screenshot({ path: `${output}/failure-${Date.now()}.png`, fullPage: true }).catch(() => {});
  }
  console.error(served.slice(-20));
  throw error;
} finally {
  await browser?.close();
  server.close();
}
