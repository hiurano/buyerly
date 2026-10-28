// One sync connection for all tabs, as Linear's SharedWorker (#498): the real
// App in two tabs of one workspace, its sync hub in the SharedWorker.
//
// - Two tabs hold one bootstrap and one WebSocket between them.
// - A change the server pushes shows in both tabs, with no request.
// - A write made in one tab shows in the other before the server answered,
//   goes to the server through the worker, and stays once its delta is in.
// - The socket stays open while one tab has the workspace, and closes with the last.
//
// A SharedWorker's requests don't pass Playwright's routes, so the sync engine's
// endpoints are served here by the dev server itself: /api/sync/bootstrap,
// /api/graphql's writes and the /api/sync/ws socket. The page's own reads are
// routed as in the other checks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockGraphqlAsRest } from './graphql-mock.mjs';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const root = fileURLToPath(new URL('../frontend/', import.meta.url));
process.chdir(root);
const output = join(tmpdir(), 'buyerly-shared-sync');
await mkdir(output, { recursive: true });

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
  User: [user(1, 'olga', 'Olga Owner')],
  WorkspaceMember: [{ id: 11, workspace_id: 7, user_id: 1, role: 'owner', joined_at: '2026-09-01T10:00:00' }],
  Team: [{
    id: 3, workspace_id: 7, name: 'Growth', key: 'GRO', description: '', created_by_user_id: 1,
    created_at: '2026-09-01T10:00:00', updated_at: '2026-09-01T10:00:00', retired_at: null, deleted_at: null, private: false,
  }],
  TeamMember: [{ id: 31, team_id: 3, member_id: 11, joined_at: '2026-09-01T10:00:00', is_owner: true }],
  TeamAccount: [],
  TeamDocument: [{
    id: 5, team_id: 3, title: 'Launch plan', content: 'Week one', created_by_user_id: 1, updated_by_user_id: 1,
    created_at: '2026-10-01T10:00:00', updated_at: '2026-10-02T10:00:00',
  }],
  Account: [], Rule: [], Label: [], RuleLabel: [], InboxEvent: [], InboxNotificationState: [], Favorite: [], ViewSetting: [],
  WorkspaceViewDefault: [], AccountNotificationSetting: [],
};
const syncGroups = ['workspace:7', 'workspace:7:members', 'team:3', 'member:11'];

/** The sync engine's side of the server, as api/sync_stream.py and the client API answer. */
const engine = {
  bootstraps: 0,
  /** Every socket opened: `since`, and whether it is still open. */
  sockets: [],
  log: [],
  lastSyncId: 100,
  /** The writes the worker sent, as GraphQL documents. */
  writes: [],
  /** While set, writes wait for it. */
  gate: null,
};

/** A WebSocket text frame from the server (unmasked). */
function frame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  const head = length < 126 ? Buffer.from([0x81, length])
    : length < 65536 ? Buffer.from([0x81, 126, length >> 8, length & 255])
      : Buffer.concat([Buffer.from([0x81, 127]), (() => { const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(length)); return size; })()]);
  return Buffer.concat([head, payload]);
}

function push(actions) {
  engine.log.push(...actions);
  engine.lastSyncId = Math.max(engine.lastSyncId, ...actions.map((action) => action.sync_id));
  const message = frame(JSON.stringify({ type: 'delta', actions, last_sync_id: engine.lastSyncId }));
  for (const socket of engine.sockets) if (socket.open) socket.raw.write(message);
}

/** Serves the endpoints a SharedWorker reaches, ahead of the dev server's proxy. */
function syncEngine() {
  const json = (res, body, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  return {
    name: 'buyerly-check-sync-engine',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path === '/api/sync/bootstrap') {
          engine.bootstraps += 1;
          return json(res, { last_sync_id: engine.lastSyncId, sync_groups: syncGroups, models });
        }
        if (path === '/api/graphql' && req.method === 'POST') {
          let body = '';
          for await (const chunk of req) body += chunk;
          const { query, variables } = JSON.parse(body);
          if (!/^\s*mutation\b/.test(query)) return next();
          engine.writes.push({ query, variables, csrf: req.headers['x-csrf-token'] });
          if (engine.gate) await engine.gate.promise;
          const name = variables?.input?.name ?? Object.values(variables ?? {}).find((value) => value?.name)?.name;
          const syncId = engine.lastSyncId + 1;
          json(res, { data: { teamUpdate: { success: true, lastSyncId: syncId } } });
          // The server's own delta for it follows over the socket.
          setTimeout(() => push([{ sync_id: syncId, model: 'Team', model_id: '3', action: 'update', data: { name, updated_at: '2026-10-27T10:00:00' } }]), 50);
          return undefined;
        }
        return next();
      });
      server.httpServer.on('upgrade', (req, raw) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/api/sync/ws') return;
        const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        const socket = { since: Number(url.searchParams.get('since')), open: true, raw };
        engine.sockets.push(socket);
        const close = () => { socket.open = false; };
        raw.on('close', close);
        raw.on('error', close);
        raw.on('data', (data) => {
          // The client's close frame: answered, and the connection ends.
          if ((data[0] & 0x0f) === 0x8) {
            raw.end(Buffer.from([0x88, 0]));
            close();
          }
        });
        const missed = engine.log.filter((action) => action.sync_id > socket.since);
        if (missed.length > 0) raw.write(frame(JSON.stringify({ type: 'delta', actions: missed, last_sync_id: engine.lastSyncId })));
        raw.write(frame(JSON.stringify({ type: 'caught_up', last_sync_id: Math.max(socket.since, engine.lastSyncId) })));
      });
    },
  };
}

const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, plugins: [syncEngine()] });
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addCookies([{ name: 'buyerly_csrf', value: 'csrf-test', url: origin }]);
  const errors = [];
  /** The pages' own reads; the synced lists must not be among them. */
  const reads = [];
  await context.route('**/health/live', (route) => route.fulfill({ json: { status: 'alive', version: 'local' } }));
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    reads.push(`${request.method()} ${path}`);
    if (path === '/api/me') return route.fulfill({ json: me });
    if (path === '/api/auth/accounts') return route.fulfill({ json: [] });
    if (path === '/api/accounts') return route.fulfill({ json: [] });
    if (path === '/api/presets') return route.fulfill({ json: [] });
    if (path === '/api/meta/connections') return route.fulfill({ json: [] });
    if (path === '/api/workspaces/7/invites') return route.fulfill({ json: [] });
    if (path === '/api/analytics/hierarchy/accounts') {
      return route.fulfill({ json: { period: url.searchParams.get('period'), source: 'analytics_fact_store', accounts: [], missing: [] } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { items: [], has_more: false, unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/unread-count') return route.fulfill({ json: { unread_count: 0, priority_unread_count: 0 } });
    if (path === '/api/inbox/display') return route.fulfill({ json: {} });
    if (path === '/api/view-settings') return route.fulfill({ json: { views: {} } });
    if (path === '/api/favorites') return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith('/count')) return route.fulfill({ json: { count: 0 } });
    errors.push(`Unexpected request from a page: ${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  /** A tab of the workspace, its reads through the page's GraphQL as REST. */
  const open = async (name) => {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
    await mockGraphqlAsRest(page);
    await page.goto(`${origin}/alpha/team/GRO/documents`);
    await page.locator('main').getByText('Launch plan').first().waitFor();
    await page.locator('html[data-sync="synced"]').waitFor({ state: 'attached' });
    return page;
  };
  const shared = (page) => page.evaluate(async () => (await import('/src/models/sync.ts')).sync.isShared());
  const pending = (page) => page.evaluate(async () => (await import('/src/models/transactions.ts')).transactions.pending.length);
  const openSockets = () => engine.sockets.filter((socket) => socket.open).length;
  const until = async (check, message) => {
    for (let tries = 0; tries < 200 && !check(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(check(), message);
  };

  let first;
  let second;
  try {
    // Two tabs: one bootstrap, one socket.
    first = await open('first');
    second = await open('second');
    assert.equal(await shared(first), true, 'the first tab syncs through the SharedWorker');
    assert.equal(await shared(second), true, 'the second tab syncs through the SharedWorker');
    assert.equal(engine.bootstraps, 1, 'one bootstrap for both tabs');
    assert.equal(engine.sockets.length, 1, 'one socket for both tabs');
    assert.equal(openSockets(), 1);

    // A change the server pushes shows in both, and neither reads anything for it.
    let before = reads.length;
    push([{ sync_id: 101, model: 'TeamDocument', model_id: '5', action: 'update', data: { title: 'Launch plan v2', updated_at: '2026-10-21T10:00:00' } }]);
    await first.locator('main').getByText('Launch plan v2').first().waitFor();
    await second.locator('main').getByText('Launch plan v2').first().waitFor();
    await first.waitForTimeout(300);
    assert.deepEqual(reads.slice(before), [], 'a delta reads nothing from the server');

    // A write in the first tab: in the second before the server answered, sent once, through the worker.
    let release = () => {};
    engine.gate = { promise: new Promise((resolve) => { release = resolve; }) };
    before = reads.length;
    await first.evaluate(async () => {
      const { updateTeam } = await import('/src/lib/teams.ts');
      void updateTeam(7, 3, { name: 'Growth Lab' });
    });
    await first.getByText('Growth Lab', { exact: true }).first().waitFor();
    await second.getByText('Growth Lab', { exact: true }).first().waitFor();
    await until(() => engine.writes.length === 1, 'the write reached the server');
    assert.equal(await first.locator('html').getAttribute('data-unsent-writes'), '1', 'the server has not answered yet');
    assert.match(engine.writes[0].query, /teamUpdate/);
    assert.equal(engine.writes[0].csrf, 'csrf-test', 'sent with the tab\'s CSRF token');
    release();
    engine.gate = null;
    await first.locator('html[data-unsent-writes="0"]').waitFor({ state: 'attached' });
    // Its delta lands in both, and the overlays come off with nothing drawn twice.
    for (const page of [first, second]) {
      await page.waitForFunction(async () => (await import('/src/models/transactions.ts')).transactions.pending.length === 0);
      await page.waitForFunction(async () => (await import('/src/models/sync.ts')).sync.lastSyncId >= 102);
      await page.getByText('Growth Lab', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('Growth', { exact: true }).count(), 0);
    }
    assert.equal(await pending(second), 0);
    assert.equal(engine.writes.length, 1, 'sent once');
    assert.deepEqual(reads.slice(before).filter((read) => !read.startsWith('GET ')), [], 'no write left from a page itself');
    await second.screenshot({ path: `${output}/second-tab.png` });

    // The first tab closes: the second keeps the socket, and gets what comes.
    await first.close({ runBeforeUnload: true });
    first = null;
    push([{ sync_id: 103, model: 'TeamDocument', model_id: '5', action: 'update', data: { title: 'Launch plan v3', updated_at: '2026-10-22T10:00:00' } }]);
    await second.locator('main').getByText('Launch plan v3').first().waitFor();
    assert.equal(engine.sockets.length, 1);
    assert.equal(openSockets(), 1, 'the socket stays open for the tab left');
    // The last tab closes: so does the socket.
    await second.close({ runBeforeUnload: true });
    second = null;
    await until(() => openSockets() === 0, 'the socket closed with the last tab');

    assert.deepEqual(errors, []);
    console.log('Shared sync: two tabs hold one bootstrap and one socket, both see pushed changes and each other\'s writes at once, the socket closes with the last tab');
  } catch (error) {
    await (second ?? first)?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error(errors, engine.writes.map((write) => write.query));
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
