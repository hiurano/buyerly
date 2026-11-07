// The sync hub's protocol (#498), run on the production hub and tab link with a
// synthetic socket, server and SharedWorker: the workspace's tabs share one
// bootstrap and one socket, each gets every change, writes go through the hub
// and are shown to the other tabs, a closed tab's unsent writes go to another
// tab, the last tab out closes the socket, sign-out stops it, a tab silent too
// long is let go, and a tab whose worker died opens another and joins again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncHost, PEER_TIMEOUT_MS, ADOPT_DELAY_MS } from './syncHub';
import { HubLink, PING_MS } from './syncTransport';

// The tab link opens its worker through this; the check hands it synthetic ones.
const workers = vi.hoisted(() => [] as FakeWorker[]);
interface FakeWorker {
  name: string;
  posted: { type: string }[];
  answering: boolean;
  closed?: boolean;
  port: { postMessage: (message: { type: string }) => void; start: () => void; close: () => void; onmessage: (event: { data: unknown }) => void };
}
vi.mock('./syncSharedWorker', () => ({
  openSharedWorker(name: string) {
    const worker: FakeWorker = { name, posted: [], answering: true, port: {} as FakeWorker['port'] };
    worker.port.postMessage = (message) => {
      worker.posted.push(message);
      if (message.type === 'ping' && worker.answering) queueMicrotask(() => worker.port.onmessage({ data: { type: 'pong' } }));
    };
    worker.port.start = () => {};
    worker.port.close = () => { worker.closed = true; };
    workers.push(worker);
    return worker;
  },
}));

type HubEnv = ConstructorParameters<typeof SyncHost>[0];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A server: bootstrap and GraphQL answered by the check, every socket kept. */
function environment() {
  interface Request { url: string; init: RequestInit & { headers: Headers }; reply: (body: unknown, status?: number) => void; fail: (error: Error) => void }
  const env = { requests: [] as Request[], sockets: [] as FakeSocket[], time: 1_000, hub: undefined as unknown as HubEnv, take: undefined as unknown as (url: string) => Request };
  class FakeSocket {
    url: URL;
    closed: number | null = null;
    onmessage!: (event: { data: string }) => void;
    onclose!: (event: { code: number }) => void;
    constructor(url: string) {
      this.url = new URL(url);
      env.sockets.push(this);
    }
    close(code: number) { this.closed = code; }
    send() {}
    message(data: unknown) { this.onmessage({ data: JSON.stringify(data) }); }
    drop(code: number) { this.onclose({ code }); }
  }
  env.hub = {
    origin: 'https://buyerly.test',
    WebSocket: FakeSocket,
    openDatabase: async () => null,
    now: () => env.time,
    fetch: (url: string, init: RequestInit & { headers: Headers }) => new Promise((resolve, reject) => {
      env.requests.push({ url, init, reply: (body, status = 200) => resolve({ status, json: async () => body }), fail: reject });
    }),
  } as unknown as HubEnv;
  env.take = (url) => {
    const index = env.requests.findIndex((request) => request.url === url);
    expect(index, `${url} was requested`).not.toBe(-1);
    return env.requests.splice(index, 1)[0];
  };
  return env;
}

/** A tab: what the hub sent it, and how it talks to the host. */
function tab(host: SyncHost, id: string) {
  const heard: { type: string; [key: string]: any }[] = [];
  const peer = { post: (message: never) => heard.push(message) };
  return {
    id,
    heard,
    of: (type: string) => heard.filter((message) => message.type === type),
    last: (type: string) => heard.filter((message) => message.type === type).slice(-1)[0],
    say: (message: Record<string, unknown>) => host.receive(peer, { tab: id, ...message } as never),
    join: (scope = 'olga:7:alpha', pending: unknown[] = [], rejoin = false) => host.receive(peer, {
      type: 'join', tab: id, scope, slug: scope.split(':')[2], account: 100,
      headers: { 'x-buyerly-account': '100', 'x-workspace-slug': scope.split(':')[2] }, pending, rejoin,
    } as never),
  };
}

const models = { User: [{ id: 1, full_name: 'Olga Owner' }, { id: 2, full_name: 'Bob Buyer' }], WorkspaceMember: [{ id: 11, user_id: 1 }] };
const write = (id: string, state = 'queued') => ({ id, state, label: 'Rename', mutation: 'mutation { teamUpdate { success } }', changes: [] });

afterEach(() => {
  vi.unstubAllGlobals();
  workers.length = 0;
});

describe('sync hub', () => {
  it('shares one bootstrap and socket per workspace, sends changes to every tab, and sends writes through the hub', async () => {
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
    expect(bootstrap.init.headers.get('X-Buyerly-Account'), 'bootstrap is read as the tab\'s account').toBe('100');
    bootstrap.reply({ last_sync_id: 100, sync_groups: ['workspace:7', 'member:11'], models });
    await tick();
    await tick();
    expect(env.requests.length, 'one bootstrap for both tabs').toBe(0);
    expect(env.sockets.length, 'one socket for both tabs').toBe(1);
    expect(env.sockets[0].url.href).toBe('wss://buyerly.test/api/sync/ws?since=100&workspace=alpha&account=100');
    for (const t of [a, b]) {
      expect(t.last('hold').lastSyncId).toBe(100);
      expect(t.last('hold').models.User.map((row: any) => row.full_name)).toStrictEqual(['Olga Owner', 'Bob Buyer']);
      expect(t.last('status')).toStrictEqual({ type: 'status', status: 'connecting', live: false, booting: false });
    }
    env.sockets[0].message({ type: 'caught_up', last_sync_id: 100 });
    expect(a.last('status')).toStrictEqual({ type: 'status', status: 'synced', live: true, booting: false });
    expect(b.last('status')).toStrictEqual(a.last('status'));

    // A change pushed once reaches every tab; one already held is not sent again.
    const change = { sync_id: 101, model: 'User', model_id: '2', action: 'update', data: { full_name: 'Bob Builder' } };
    env.sockets[0].message({ type: 'delta', actions: [change], last_sync_id: 101 });
    env.sockets[0].message({ type: 'delta', actions: [change], last_sync_id: 101 });
    expect(a.of('delta')).toStrictEqual([{ type: 'delta', actions: [change], lastSyncId: 101 }]);
    expect(b.of('delta')).toStrictEqual(a.of('delta'));
    // A tab joining later is sent the models as they are now.
    const c = tab(host, 'c');
    c.join();
    expect(c.last('hold').lastSyncId).toBe(101);
    expect(c.last('hold').models.User.find((row: any) => row.id === 2).full_name).toBe('Bob Builder');
    expect(c.last('status').status).toBe('synced');
    c.say({ type: 'leave' });

    // A tab's write is shown to the other tab, and sent through the hub; the answer goes to it alone.
    a.say({ type: 'pending', transactions: [write('w1')] });
    expect(b.last('peers').transactions.map((item: any) => item.id)).toStrictEqual(['w1']);
    expect(a.last('peers').transactions, 'a tab is not shown its own writes').toStrictEqual([]);
    a.say({ type: 'request', id: 1, request: { path: '/api/graphql', method: 'POST', headers: { 'x-csrf-token': 'csrf' }, body: '{"query":"mutation"}' } });
    const graphql = env.take('/api/graphql');
    expect(graphql.init.method).toBe('POST');
    expect(graphql.init.body).toBe('{"query":"mutation"}');
    expect(graphql.init.headers.get('X-CSRF-Token'), 'the tab\'s CSRF token goes with it').toBe('csrf');
    graphql.reply({ data: { teamUpdate: { success: true, lastSyncId: 102 } } });
    await tick();
    await tick();
    expect(a.last('response')).toStrictEqual({ type: 'response', id: 1, response: { status: 200, body: { data: { teamUpdate: { success: true, lastSyncId: 102 } } } } });
    expect(b.of('response').length).toBe(0);
    // The network failing is told as such: the queue tries again.
    b.say({ type: 'request', id: 7, request: { path: '/api/graphql', method: 'POST', headers: {}, body: '{}' } });
    env.take('/api/graphql').fail(new TypeError('Failed to fetch'));
    await tick();
    expect(b.last('response')).toStrictEqual({ type: 'response', id: 7, response: { error: 'Failed to fetch' } });

    // A tab closing with an unsent write hands it to another tab, which sends it.
    env.time += ADOPT_DELAY_MS;
    a.say({ type: 'pending', transactions: [write('w1', 'confirmed'), write('w2')] });
    a.say({ type: 'leave' });
    expect(b.last('adopt').transactions.map((item: any) => item.id), 'only the unconfirmed write is handed on').toStrictEqual(['w2']);
    expect(env.sockets[0].closed, 'the socket stays open while a tab has the workspace').toBe(null);
    // A tab silent too long (it crashed) is let go; once it speaks again it joins again.
    const d = tab(host, 'd');
    d.join();
    env.time += PEER_TIMEOUT_MS / 2;
    b.say({ type: 'ping' });
    expect(b.last('pong').type).toBe('pong');
    env.time += PEER_TIMEOUT_MS / 2 + 1;
    host.sweep();
    d.say({ type: 'ping' });
    expect(d.last('unknown').type).toBe('unknown');
    d.say({ type: 'request', id: 3, request: { path: '/api/graphql', method: 'POST', headers: {}, body: '{}' } });
    expect(d.last('response').response).toStrictEqual({ error: 'The sync hub restarted.' });
    // The last tab out closes the socket, and the hub is let go.
    b.say({ type: 'leave' });
    expect(env.sockets[0].closed).toBe(1000);
    expect(host.scopes).toStrictEqual([]);

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
    expect(e.last('status').status).toBe('offline');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(env.sockets.length).toBe(2);
    expect(env.sockets[1].url.searchParams.get('since')).toBe('6');
    env.sockets[1].drop(4410);
    expect(e.last('status'), 'the pages wait for the new bootstrap').toStrictEqual({ type: 'status', status: 'connecting', live: false, booting: true });
    env.take('/api/sync/bootstrap').reply({ last_sync_id: 9, sync_groups: [], models });
    await tick();
    await tick();
    expect(e.last('hold').lastSyncId).toBe(9);
    expect(e.last('status').booting).toBe(false);
    env.sockets[2].drop(4401);
    expect(e.last('status').status).toBe('off');

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
    expect(env.sockets[0].closed).toBe(1000);
    expect(host.scopes).toStrictEqual(['olga:8:beta']);
    // Signing out stops the account's hubs, and only its own.
    const g = tab(host, 'g');
    g.join('anna:9:gamma');
    await tick();
    for (const request of env.requests.splice(0)) request.reply({ last_sync_id: 1, sync_groups: [], models });
    await tick();
    await tick();
    host.wipe({ type: 'wipe', username: 'olga' });
    expect(f.last('status')).toStrictEqual({ type: 'status', status: 'off', live: false, booting: false });
    expect(env.sockets.find((socket) => socket.url.searchParams.get('workspace') === 'beta')!.closed).toBe(1000);
    expect(env.sockets.find((socket) => socket.url.searchParams.get('workspace') === 'gamma')!.closed).toBe(null);
    expect(host.scopes).toStrictEqual(['anna:9:gamma']);
  });

  // The tab's link: a worker that stops answering pings is replaced, and the tab joins the new one.
  it('replaces a worker that stops answering pings, and joins the new one', async () => {
    const intervals: (() => void)[] = [];
    vi.stubGlobal('setInterval', (run: () => void) => { intervals.push(run); return intervals.length; });
    vi.stubGlobal('clearInterval', () => {});
    vi.stubGlobal('SharedWorker', function SharedWorker() {});
    expect(PING_MS <= 15_000).toBeTruthy();
    const heard: Record<string, any>[] = [];
    let restarts = 0;
    const link = new HubLink('olga:7:alpha', (message) => heard.push(message), () => {
      restarts += 1;
      link.post({ type: 'join', tab: 't', scope: 'olga:7:alpha', slug: 'alpha', account: null, headers: {}, pending: [], rejoin: false });
    });
    link.post({ type: 'join', tab: 't', scope: 'olga:7:alpha', slug: 'alpha', account: null, headers: {}, pending: [], rejoin: false });
    await tick();
    expect(link.shared).toBe(true);
    expect(workers.length).toBe(1);
    expect(workers[0].name, 'one worker per workspace, its name not the username').toMatch(/^buyerly-sync:buyerly_[0-9a-f]{8}$/);
    expect(workers[0].posted[0].type, 'what was posted before the worker loaded is sent once it has').toBe('join');
    workers[0].port.onmessage({ data: { type: 'status', status: 'synced', live: true, booting: false } });
    expect(heard.slice(-1)[0].status).toBe('synced');
    const ping = intervals[0];
    ping();
    await tick();
    ping();
    await tick();
    expect(workers.length, 'a worker that answers is kept').toBe(1);
    workers[0].answering = false;
    ping();
    ping();
    await tick();
    expect(workers.length, 'a worker that stopped answering is replaced').toBe(2);
    expect(workers[0].closed).toBe(true);
    expect(restarts).toBe(1);
    expect(workers[1].posted.map((message) => message.type), 'the tab joins the new worker').toStrictEqual(['join']);
    // The old worker's late messages are not heard.
    const before = heard.length;
    workers[0].port.onmessage({ data: { type: 'pong' } });
    workers[0].port.onmessage({ data: { type: 'delta', actions: [], lastSyncId: 1 } });
    expect(heard.length).toBe(before);
    link.close();
  });
});
