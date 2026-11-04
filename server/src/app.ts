import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { ServerHealth } from '@buyerly/shared';
import type { Config } from './config.ts';

// The one question the server asks the database for now. Stage 2 of #611
// replaces it with TypeORM's data source.
export interface Database {
  ping(): Promise<void>;
  close(): Promise<void>;
}

// The Python API still fronts the site and forwards the paths this server
// owns (SERVER_PATHS in core/config.py, api/server_proxy.py). Its health
// lives under /health/, a root that no workspace slug may take.
export const HEALTH_PREFIX = '/health/server';

export function buildApp(config: Config, database: Database | null, options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // The path only: query strings may carry OAuth codes and tokens.
      serializers: {
        req: (request) => ({ method: request.method, path: request.url.split('?', 1)[0] }),
      },
    },
    ...options,
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // Fastify's own 404 logs and returns the whole URL, query string included.
  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return { detail: 'Not Found' };
  });

  // Compose probes these every few seconds: log only failures.
  const quiet = { logLevel: 'warn' } as const;

  app.get(`${HEALTH_PREFIX}/live`, quiet, async (): Promise<ServerHealth> => ({
    status: 'alive',
    version: config.version,
  }));

  app.get(`${HEALTH_PREFIX}/ready`, quiet, async (request, reply): Promise<ServerHealth> => {
    try {
      if (!database) throw new Error('DATABASE_URL is not set');
      await database.ping();
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      reply.code(503);
      return { status: 'not_ready', version: config.version };
    }
    return { status: 'ready', version: config.version };
  });

  app.addHook('onClose', async () => {
    await database?.close();
  });

  return app;
}
