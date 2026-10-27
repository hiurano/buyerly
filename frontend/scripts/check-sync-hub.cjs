// The sync hub's protocol (#498), run on the production hub and tab link with a
// synthetic socket, server and SharedWorker: the workspace's tabs share one
// bootstrap and one socket, each gets every change, writes go through the hub
// and are shown to the other tabs, a closed tab's unsent writes go to another
// tab, the last tab out closes the socket, sign-out stops it, a tab silent too
// long is let go, and a tab whose worker died opens another and joins again.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
const stubs = new Map();
function load(file) {
  if (stubs.has(file)) return stubs.get(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const requireSource = name => name.startsWith('.') || name.startsWith('@/')
    ? load(path.resolve(name.startsWith('@/') ? root : path.dirname(file), name.replace(/^@\//, '') + '.ts'))
    : require(name);
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}

const { SyncHost, PEER_TIMEOUT_MS, ADOPT_DELAY_MS } = load(path.join(root, 'models/syncHub.ts'));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A server: bootstrap and GraphQL answered by the check, every socket kept. */
function environment() {
  const env = { requests: [], sockets: [], time: 1_000 };
  class FakeSocket {
    constructor(url) {
      this.url = new URL(url);
      this.closed = null;
      env.sockets.push(this);
    }
    close(code) { this.closed = code; }
    send() {}
    message(data) { this.onmessage({ data: JSON.stringify(data) }); }
    drop(code) { this.onclose({ code }); }
  }
  env.hub = {
    origin: 'https://buyerly.test',
    WebSocket: FakeSocket,
    openDatabase: async () => null,
    now: () => env.time,
    fetch: (url, init) => new Promise((resolve, reject) => {
      env.requests.push({ url, init, reply: (body, status = 200) => resolve({ status, json: async () => body }), fail: reject });
    }),
  };
  env.take = (url) => {
    const index = env.requests.findIndex((request) => request.url === url);
    assert.notEqual(index, -1, `${url} was requested`);
    return env.requests.splice(index, 1)[0];
  };
  return env;
}

/** A tab: what the hub sent it, and how it talks to the host. */
function tab(host, id) {
  const heard = [];
  const peer = { post: (message) => heard.push(message) };
  return {
    id,
    heard,
    of: (type) => heard.filter((message) => message.type === type),
    last: (type) => heard.filter((message) => message.type === type).at(-1),
    say: (message) => host.receive(peer, { tab: id, ...message }),
    join: (scope = 'olga:7:alpha', pending = []) => host.receive(peer, {
      type: 'join', tab: id, scope, slug: scope.split(':')[2], account: 100,
      headers: { 'x-buyerly-account': '100', 'x-workspace-slug': scope.split(':')[2] }, pending,
    }),
  };
}

const models = { User: [{ id: 1, full_name: 'Olga Owner' }, { id: 2, full_name: 'Bob Buyer' }], WorkspaceMember: [{ id: 11, user_id: 1 }] };
const write = (id, state = 'queued') => ({ id, state, label: 'Rename', mutation: 'mutation { teamUpdate { success } }', changes: [] });

async function main() {
  // Two tabs of a workspace: one bootstrap, one socket, both held.
  let env = environment();
  let host = new SyncHost(env.hub);
  const a = tab(host, 'a');
  const b = tab(host, 'b');
  a.join();
  await tick();
  b.join();
  await tick();
  const bootstrap = env.take('/api/sync/bootstrap');
  assert.equal(bootstrap.init.headers.get('X-Buyerly-Account'), '100', 'bootstrap is read as the tab\'s account');
  bootstrap.reply({ last_sync_id: 100, sync_groups: ['workspace:7', 'member:11'], models });
  await tick();
  await tick();
  assert.equal(env.requests.length, 0, 'one bootstrap for both tabs');
  assert.equal(env.sockets.length, 1, 'one socket for both tabs');
  assert.equal(env.sockets[0].url.href, 'wss://buyerly.test/api/sync/ws?since=100&workspace=alpha&account=100');
  for (const t of [a, b]) {
    assert.equal(t.last('hold').lastSyncId, 100);
    assert.deepEqual(t.last('hold').models.User.map((row) => row.full_name), ['Olga Owner', 'Bob Buyer']);
    assert.deepEqual(t.last('status'), { type: 'status', status: 'connecting', live: false, booting: false });
  }
  env.sockets[0].message({ type: 'caught_up', last_sync_id: 100 });
  assert.deepEqual(a.last('status'), { type: 'status', status: 'synced', live: true, booting: false });
  assert.deepEqual(b.last('status'), a.last('status'));

  // A change pushed once reaches every tab; one already held is not sent again.
  const change = { sync_id: 101, model: 'User', model_id: '2', action: 'update', data: { full_name: 'Bob Builder' } };
  env.sockets[0].message({ type: 'delta', actions: [change], last_sync_id: 101 });
  env.sockets[0].message({ type: 'delta', actions: [change], last_sync_id: 101 });
  assert.deepEqual(a.of('delta'), [{ type: 'delta', actions: [change], lastSyncId: 101 }]);
  assert.deepEqual(b.of('delta'), a.of('delta'));
  // A tab joining later is sent the models as they are now.
  const c = tab(host, 'c');
  c.join();
  assert.equal(c.last('hold').lastSyncId, 101);
  assert.equal(c.last('hold').models.User.find((row) => row.id === 2).full_name, 'Bob Builder');
  assert.equal(c.last('status').status, 'synced');
  c.say({ type: 'leave' });

  // A tab's write is shown to the other tab, and sent through the hub; the answer goes to it alone.
  a.say({ type: 'pending', transactions: [write('w1')] });
  assert.deepEqual(b.last('peers').transactions.map((item) => item.id), ['w1']);
  assert.deepEqual(a.last('peers').transactions, [], 'a tab is not shown its own writes');
  a.say({ type: 'request', id: 1, request: { path: '/api/graphql', method: 'POST', headers: { 'x-csrf-token': 'csrf' }, body: '{"query":"mutation"}' } });
  const graphql = env.take('/api/graphql');
  assert.equal(graphql.init.method, 'POST');
  assert.equal(graphql.init.body, '{"query":"mutation"}');
  assert.equal(graphql.init.headers.get('X-CSRF-Token'), 'csrf', 'the tab\'s CSRF token goes with it');
  graphql.reply({ data: { teamUpdate: { success: true, lastSyncId: 102 } } });
  await tick();
  await tick();
  assert.deepEqual(a.last('response'), { type: 'response', id: 1, response: { status: 200, body: { data: { teamUpdate: { success: true, lastSyncId: 102 } } } } });
  assert.equal(b.of('response').length, 0);
  // The network failing is told as such: the queue tries again.
  b.say({ type: 'request', id: 7, request: { path: '/api/graphql', method: 'POST', headers: {}, body: '{}' } });
  env.take('/api/graphql').fail(new TypeError('Failed to fetch'));
  await tick();
  assert.deepEqual(b.last('response'), { type: 'response', id: 7, response: { error: 'Failed to fetch' } });

  // A tab closing with an unsent write hands it to another tab, which sends it.
  env.time += ADOPT_DELAY_MS;
  a.say({ type: 'pending', transactions: [write('w1', 'confirmed'), write('w2')] });
  a.say({ type: 'leave' });
  assert.deepEqual(b.last('adopt').transactions.map((item) => item.id), ['w2'], 'only the unconfirmed write is handed on');
  assert.equal(env.sockets[0].closed, null, 'the socket stays open while a tab has the workspace');
  // A tab silent too long (it crashed) is let go; once it speaks again it joins again.
  const d = tab(host, 'd');
  d.join();
  env.time += PEER_TIMEOUT_MS / 2;
  b.say({ type: 'ping' });
  assert.equal(b.last('pong').type, 'pong');
  env.time += PEER_TIMEOUT_MS / 2 + 1;
  host.sweep();
  d.say({ type: 'ping' });
  assert.equal(d.last('unknown').type, 'unknown');
  d.say({ type: 'request', id: 3, request: { path: '/api/graphql', method: 'POST', headers: {}, body: '{}' } });
  assert.deepEqual(d.last('response').response, { error: 'The sync hub restarted.' });
  // The last tab out closes the socket, and the hub is let go.
  b.say({ type: 'leave' });
  assert.equal(env.sockets[0].closed, 1000);
  assert.deepEqual(host.scopes, []);

  // A dropped socket opens again from the last sync id; 4410 reads bootstrap again; 4401 stops.
  env = environment();
  host = new SyncHost(env.hub);
  const e = tab(host, 'e');
  e.join();
  await tick();
  env.take('/api/sync/bootstrap').reply({ last_sync_id: 5, sync_groups: [], models });
  await tick();
  await tick();
  env.sockets[0].message({ type: 'delta', actions: [{ ...change, sync_id: 6 }], last_sync_id: 6 });
  env.sockets[0].drop(1006);
  assert.equal(e.last('status').status, 'offline');
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(env.sockets.length, 2);
  assert.equal(env.sockets[1].url.searchParams.get('since'), '6');
  env.sockets[1].drop(4410);
  assert.deepEqual(e.last('status'), { type: 'status', status: 'connecting', live: false, booting: true }, 'the pages wait for the new bootstrap');
  env.take('/api/sync/bootstrap').reply({ last_sync_id: 9, sync_groups: [], models });
  await tick();
  await tick();
  assert.equal(e.last('hold').lastSyncId, 9);
  assert.equal(e.last('status').booting, false);
  env.sockets[2].drop(4401);
  assert.equal(e.last('status').status, 'off');

  // A tab opening another workspace leaves the first: alone in it, its socket closes.
  env = environment();
  host = new SyncHost(env.hub);
  const f = tab(host, 'f');
  f.join('olga:7:alpha');
  await tick();
  env.take('/api/sync/bootstrap').reply({ last_sync_id: 1, sync_groups: [], models });
  await tick();
  await tick();
  f.join('olga:8:beta');
  assert.equal(env.sockets[0].closed, 1000);
  assert.deepEqual(host.scopes, ['olga:8:beta']);
  // Signing out stops the account's hubs, and only its own.
  const g = tab(host, 'g');
  g.join('anna:9:gamma');
  await tick();
  for (const request of env.requests.splice(0)) request.reply({ last_sync_id: 1, sync_groups: [], models });
  await tick();
  await tick();
  host.wipe({ type: 'wipe', username: 'olga' });
  assert.deepEqual(f.last('status'), { type: 'status', status: 'off', live: false, booting: false });
  assert.equal(env.sockets.find((socket) => socket.url.searchParams.get('workspace') === 'beta').closed, 1000);
  assert.equal(env.sockets.find((socket) => socket.url.searchParams.get('workspace') === 'gamma').closed, null);
  assert.deepEqual(host.scopes, ['anna:9:gamma']);

  await checkLink();
  console.log('Sync hub: one bootstrap and socket per workspace, changes to every tab, writes through the hub and shown to the other tabs, '
    + 'closed tabs\' writes handed on, last tab out closes, sign-out stops, silent tabs let go, a dead worker replaced');
}

/** The tab's link: a worker that stops answering pings is replaced, and the tab joins the new one. */
async function checkLink() {
  const intervals = [];
  global.setInterval = (run) => { intervals.push(run); return intervals.length; };
  global.clearInterval = () => {};
  const workers = [];
  global.SharedWorker = function SharedWorker() {};
  stubs.set(path.join(root, 'models/syncSharedWorker.ts'), {
    openSharedWorker(name) {
      const worker = { name, posted: [], answering: true, port: {} };
      worker.port.postMessage = (message) => {
        worker.posted.push(message);
        if (message.type === 'ping' && worker.answering) queueMicrotask(() => worker.port.onmessage({ data: { type: 'pong' } }));
      };
      worker.port.start = () => {};
      worker.port.close = () => { worker.closed = true; };
      workers.push(worker);
      return worker;
    },
  });
  const { HubLink, PING_MS } = load(path.join(root, 'models/syncTransport.ts'));
  assert.ok(PING_MS <= 15_000);
  const heard = [];
  let restarts = 0;
  const link = new HubLink('olga:7:alpha', (message) => heard.push(message), () => {
    restarts += 1;
    link.post({ type: 'join', tab: 't', scope: 'olga:7:alpha', slug: 'alpha', account: null, headers: {}, pending: [] });
  });
  link.post({ type: 'join', tab: 't', scope: 'olga:7:alpha', slug: 'alpha', account: null, headers: {}, pending: [] });
  await tick();
  assert.equal(link.shared, true);
  assert.equal(workers.length, 1);
  assert.match(workers[0].name, /^buyerly-sync:buyerly_[0-9a-f]{8}$/, 'one worker per workspace, its name not the username');
  assert.equal(workers[0].posted[0].type, 'join', 'what was posted before the worker loaded is sent once it has');
  workers[0].port.onmessage({ data: { type: 'status', status: 'synced', live: true, booting: false } });
  assert.equal(heard.at(-1).status, 'synced');
  const ping = intervals[0];
  ping();
  await tick();
  ping();
  await tick();
  assert.equal(workers.length, 1, 'a worker that answers is kept');
  workers[0].answering = false;
  ping();
  ping();
  await tick();
  assert.equal(workers.length, 2, 'a worker that stopped answering is replaced');
  assert.equal(workers[0].closed, true);
  assert.equal(restarts, 1);
  assert.deepEqual(workers[1].posted.map((message) => message.type), ['join'], 'the tab joins the new worker');
  // The old worker's late messages are not heard.
  const before = heard.length;
  workers[0].port.onmessage({ data: { type: 'pong' } });
  workers[0].port.onmessage({ data: { type: 'delta', actions: [], lastSyncId: 1 } });
  assert.equal(heard.length, before);
  link.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
