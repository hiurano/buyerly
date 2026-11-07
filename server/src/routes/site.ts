import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { cycleStatus, CRITICAL_LAG_SECONDS, WARNING_LAG_SECONDS } from '../worker/watchdog.ts';
import { RESERVED_WORKSPACE_SLUGS } from '../workspaces/slugs.ts';

// The site itself (#611 stage 6, from api/server.py): the probes an uptime
// monitor and Compose call, and, with SERVE_STATIC, the built React app, the
// public pages and the service worker from frontend/dist. Whatever no route
// takes ends in the not-found handler below: a built file, then the React
// app for the addresses it routes itself.

// Root segments the React app routes itself (frontend/src/lib/routing.ts);
// every other reserved root belongs to the server.
const APP_ROOTS = new Set(['login', 'signup', 'auth', 'create-workspace', 'invite', 'connect']);

const PUBLIC_DOCUMENTS: Record<string, string> = {
  '/': 'landing.html',
  '/about': 'about.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
  '/data-deletion': 'data-deletion.html',
  '/changelog': 'changelog.html',
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const NO_STORE = {
  'cache-control': 'no-cache, no-store, must-revalidate',
  pragma: 'no-cache',
  expires: '0',
};
const SHORT_CACHE = { 'cache-control': 'public, max-age=300' };

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function sendFile(
  request: FastifyRequest,
  reply: FastifyReply,
  file: string,
  headers: Record<string, string>,
  contentType?: string,
): FastifyReply {
  reply.headers(headers);
  reply.type(contentType ?? CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  if (request.method === 'HEAD') return reply.send();
  return reply.send(createReadStream(file));
}

// Installed on the root instance (not registered as a plugin): Fastify takes
// one not-found handler per prefix, and this one is the root's.
export function installSite(app: FastifyInstance): void {
  const { config } = app;
  // Compose and the uptime monitor probe these every few seconds: log only failures.
  const quiet = { logLevel: 'warn' } as const;

  app.get('/health/live', quiet, async () => ({ status: 'alive', version: config.version }));

  app.get('/health/ready', quiet, async (request, reply) => {
    try {
      await app.db.ping();
    } catch (error) {
      request.log.error({ err: error }, 'Readiness dependency check failed');
      reply.code(503);
      return { status: 'not_ready', version: config.version };
    }
    return { status: 'ready', version: config.version };
  });

  // Freshness of the worker's actual work, for an external uptime monitor:
  // 503 once no monitoring cycle has finished for CRITICAL_LAG_SECONDS, even
  // if the worker process is alive (#199).
  app.get('/health/worker', quiet, async (request, reply) => {
    let payload: Record<string, unknown> | null;
    try {
      payload = await app.db.transaction(async (tx) => {
        const rows = await tx.query<{ payload: Record<string, unknown> | null }[]>(
          "SELECT payload FROM automation_runtime_states WHERE state_key = 'monitoring'",
        );
        return rows[0]?.payload ?? null;
      });
    } catch (error) {
      request.log.error({ err: error }, 'Worker freshness check failed');
      reply.code(503);
      return { status: 'unavailable' };
    }
    const cycle = cycleStatus(payload);
    if (cycle.status === 'critical') reply.code(503);
    return {
      status: cycle.status,
      lag_seconds: cycle.lag_seconds,
      warning_seconds: WARNING_LAG_SECONDS,
      critical_seconds: CRITICAL_LAG_SECONDS,
    };
  });

  // Fastify's own 404 logs and returns the whole URL, query string included.
  if (!config.serveStatic) {
    app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ detail: 'Not Found' }));
    return;
  }
  const root = path.resolve(config.frontendDir);
  const documentNotFound = (reply: FastifyReply) => reply.code(404).send({ detail: 'Document not found' });

  for (const [route, document] of Object.entries(PUBLIC_DOCUMENTS)) {
    app.get(route, async (request, reply) => {
      const file = path.join(root, document);
      if (!(await isFile(file))) return documentNotFound(reply);
      return sendFile(request, reply, file, SHORT_CACHE);
    });
  }

  // One page per release (#435), rendered with the others from frontend/site (#700).
  app.get<{ Params: { slug: string } }>('/changelog/:slug', async (request, reply) => {
    const { slug } = request.params;
    const file = path.join(root, 'changelog', `${slug}.html`);
    if (!/^[a-z0-9-]+$/.test(slug) || !(await isFile(file))) return documentNotFound(reply);
    return sendFile(request, reply, file, SHORT_CACHE);
  });

  // The service worker (#499, frontend/sw/). Browsers look for a new one at
  // every navigation; no cache in between may hold an old copy. SERVICE_WORKER
  // off serves the kill switch, which drops the worker and its caches.
  app.get('/sw.js', async (request, reply) => {
    const file = path.join(root, config.serviceWorker ? 'sw.js' : 'sw-off.js');
    if (!(await isFile(file))) return reply.code(404).send({ detail: 'Not found' });
    return sendFile(request, reply, file, { 'cache-control': 'no-cache, no-store' }, 'text/javascript; charset=utf-8');
  });

  // Built files, then the React app for its own addresses; API 404s stay as they are.
  app.setNotFoundHandler(async (request, reply) => {
    const notFound = () => reply.code(404).send({ detail: 'Not Found' });
    if (request.method !== 'GET' && request.method !== 'HEAD') return notFound();
    let relative: string;
    try {
      relative = decodeURIComponent(request.url.split('?', 1)[0]).replace(/^\/+/, '');
    } catch {
      return notFound();
    }
    if (relative.includes('\0')) return notFound();
    const candidate = path.resolve(root, relative);
    if (relative && candidate.startsWith(root + path.sep) && (await isFile(candidate))) {
      const headers = relative.startsWith('static/')
        ? NO_STORE
        : relative.startsWith('assets/') ? { 'cache-control': 'public, max-age=31536000, immutable' } : SHORT_CACHE;
      return sendFile(request, reply, candidate, headers);
    }
    const first = relative.split('/', 1)[0];
    if (!first || (RESERVED_WORKSPACE_SLUGS.has(first) && !APP_ROOTS.has(first))) return notFound();
    const index = path.join(root, 'index.html');
    if (!(await isFile(index))) return notFound();
    return sendFile(request, reply, index, NO_STORE);
  });
}
