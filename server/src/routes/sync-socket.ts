import type { IncomingMessage } from 'node:http';
import fastifyWebsocket from '@fastify/websocket';
import { SYNC_CLOSE } from '@buyerly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { currentUser } from '../auth/plugin.ts';
import { ACCOUNT_HEADER_NAME } from '../auth/sessions.ts';
import { HttpError } from '../http/errors.ts';
import { DEFAULT_SYNC_TUNING, SyncHub, type SyncTuning } from '../sync/hub.ts';
import { Closed, SocketSession } from '../sync/socket.ts';
import { userWorkspaceMember } from '../workspaces/access.ts';

// WS /api/sync/ws?since=<id>&workspace=<slug>&account=<user id>: the changes
// after that id in the member's sync groups, then each new one as it commits
// (api/routers/sync.py sync_socket, sync/socket.ts).
//
// A browser socket cannot send headers, so the account and workspace come in
// the query. Another site's page is refused before the upgrade (HTTP 403);
// every other refusal is a close code after it, which a browser can read:
// 4401 not signed in, 4403 no access or taken out of the workspace, 4404 no
// workspace, 4410 bootstrap again (`since` missing or older than the log).

declare module 'fastify' {
  interface FastifyInstance {
    syncHub: SyncHub;
  }
}

// What the upgrade request settled before the socket opened.
interface Handshake {
  refusal: { code: number; reason: string } | null;
}
const handshakes = new WeakMap<FastifyRequest, Handshake>();
// Set-Cookie of a session the sign-in check renewed, for the 101 response.
const upgradeCookies = new WeakMap<IncomingMessage, string[]>();

function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

// Browsers send cookies with any page's socket, so only the app's own pages may open one.
function originAllowed(request: FastifyRequest): boolean {
  const origin = header(request, 'origin').replace(/\/+$/, '');
  if (!origin) return true;
  const { config } = request.server;
  const allowed = new Set(config.corsOrigins.split(',').map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean));
  if (config.webappUrl) allowed.add(config.webappUrl.replace(/\/+$/, ''));
  if (allowed.has(origin)) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  // The page's own host; behind the Python API, the host the browser asked for.
  const hosts = [header(request, 'host')];
  if (request.server.clientAddress.viaTrustedProxy(request)) hosts.push(header(request, 'x-forwarded-host'));
  return hosts.includes(host);
}

function queryParameter(request: FastifyRequest, name: string): string | undefined {
  const value = (request.query as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[value.length - 1] : value;
}

// The session check of every request, on the upgrade request. Its refusals
// close the socket once it is open; a renewed session's cookies go out with the 101.
async function socketHandshake(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!originAllowed(request)) {
    reply.code(403);
    await reply.send({ detail: 'Forbidden' });
    return;
  }
  const account = queryParameter(request, 'account');
  const workspace = queryParameter(request, 'workspace');
  delete request.headers[ACCOUNT_HEADER_NAME];
  delete request.headers['x-workspace-slug'];
  if (account) request.headers[ACCOUNT_HEADER_NAME] = account;
  if (workspace !== undefined) request.headers['x-workspace-slug'] = workspace;

  const cookies: string[] = [];
  const { server } = request;
  reply.setCookie = ((name: string, value: string, options?: Parameters<FastifyReply['setCookie']>[2]) => {
    // The session cookies' options are plain: secure is a boolean, nothing is signed.
    cookies.push(server.serializeCookie(name, value, { sameSite: 'lax', ...options } as Parameters<typeof server.serializeCookie>[2]));
    return reply;
  });
  const handshake: Handshake = { refusal: null };
  handshakes.set(request, handshake);
  try {
    await currentUser(request, reply);
    upgradeCookies.set(request.raw, cookies);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    handshake.refusal = {
      code: error.statusCode === 401 ? SYNC_CLOSE.unauthorized : SYNC_CLOSE.forbidden,
      reason: error.detail.slice(0, 120),
    };
  }
}

export interface SyncSocketOptions {
  tuning?: Partial<SyncTuning>;
}

export const syncSocketRoutes = fp(async (app: FastifyInstance, options: SyncSocketOptions) => {
  // Frames of the sync stream are small; a client sends only pings.
  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });
  app.websocketServer.on('headers', (headers: string[], request: IncomingMessage) => {
    for (const cookie of upgradeCookies.get(request) ?? []) headers.push(`Set-Cookie: ${cookie}`);
  });
  app.decorate('syncHub', new SyncHub(app.db, { ...DEFAULT_SYNC_TUNING, ...options.tuning }, app.log));
  app.addHook('preClose', async () => {
    await app.syncHub.stop();
    for (const client of app.websocketServer.clients) client.close(1001, 'server stopping');
  });

  app.get('/api/sync/ws', { websocket: true, preValidation: [socketHandshake] }, async (socket, request) => {
    const close = (code: number, reason: string) => {
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) socket.close(code, reason);
    };
    const refusal = handshakes.get(request)?.refusal;
    if (refusal) return close(refusal.code, refusal.reason);
    const since = queryParameter(request, 'since') ?? '';
    if (!/^\d+$/.test(since)) return close(SYNC_CLOSE.bootstrap, 'since');
    const { user, webSessionId } = request.auth!;
    try {
      const found = await app.db.transaction((tx) => userWorkspaceMember(tx, user));
      if (!found) return close(SYNC_CLOSE.notFound, 'workspace');
      await new SocketSession(socket, app.db, app.syncHub, user, found.member, webSessionId).run(Number(since));
    } catch (error) {
      if (error instanceof Closed) {
        if (error.code) close(error.code, error.reason);
        return;
      }
      request.log.error({ err: error }, 'Sync socket failed');
      close(1011, '');
    }
  });
});
