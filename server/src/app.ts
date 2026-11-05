import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { ServerHealth } from '@buyerly/shared';
import type { Authenticated } from './auth/plugin.ts';
import { Otp } from './auth/otp.ts';
import { turnstileVerifier, type VerifyTurnstile } from './auth/turnstile.ts';
import type { Config } from './config.ts';
import type { Database } from './database.ts';
import { resendSender, type SendEmail } from './email/send.ts';
import { ClientAddress } from './http/client-address.ts';
import { installErrorHandler } from './http/errors.ts';
import { RateLimiter } from './http/rate-limit.ts';
import { authRoutes } from './routes/auth.ts';
import { syncRoutes } from './routes/sync.ts';
import { uploadRoutes } from './routes/uploads.ts';

export type { Database } from './database.ts';

// What the server talks to outside the database. Tests replace them, as the
// Python tests patch send_otp_verification_email and verify_turnstile.
export interface Services {
  sendEmail: SendEmail;
  verifyTurnstile: VerifyTurnstile;
}

// What every route reaches through `app` (or `request.server`); see
// docs/ARCHITECTURE.md, "Сервер на TypeScript".
declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Database;
    services: Services;
    otp: Otp;
    clientAddress: ClientAddress;
    rateLimiter: RateLimiter;
  }
  interface FastifyRequest {
    // Set by the auth hooks (auth/plugin.ts) on routes that sign in.
    auth: Authenticated | null;
  }
}

export interface BuildOptions {
  services?: Partial<Services>;
  fastify?: FastifyServerOptions;
}

// The Python API still fronts the site and forwards the paths this server
// owns (SERVER_PATHS in core/config.py, api/server_proxy.py). Its health
// lives under /health/, a root that no workspace slug may take.
export const HEALTH_PREFIX = '/health/server';

const NO_DATABASE: Database = {
  ping: async () => { throw new Error('DATABASE_URL is not set'); },
  close: async () => {},
  transaction: async () => { throw new Error('DATABASE_URL is not set'); },
};

export function buildApp(config: Config, database: Database | null, options: BuildOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // The path only: query strings may carry OAuth codes and tokens.
      serializers: {
        req: (request) => ({ method: request.method, path: request.url.split('?', 1)[0] }),
      },
    },
    // Request bodies as pydantic reads them: an unknown field is refused, not
    // dropped, and a number is not a string. Every problem is reported.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: true, useDefaults: false } },
    // The Python API's cap on /api/ bodies (api/server.py): 1 MB.
    bodyLimit: 1024 * 1024,
    ...options.fastify,
  });

  app.decorate('config', config);
  app.decorate('db', database ?? NO_DATABASE);
  app.decorate('services', {
    sendEmail: options.services?.sendEmail ?? resendSender(config, app.log),
    verifyTurnstile: options.services?.verifyTurnstile ?? turnstileVerifier(config.turnstileSecretKey, app.log),
  });
  app.decorate('otp', new Otp(config.otpPepper));
  app.decorate('clientAddress', new ClientAddress(config));
  app.decorate('rateLimiter', new RateLimiter());
  app.decorateRequest('auth', null);

  void app.register(fastifyCookie);
  installErrorHandler(app);

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
      await app.db.ping();
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      reply.code(503);
      return { status: 'not_ready', version: config.version };
    }
    return { status: 'ready', version: config.version };
  });

  void app.register(authRoutes);
  void app.register(syncRoutes);
  void app.register(uploadRoutes);

  app.addHook('onClose', async () => {
    await database?.close();
  });

  return app;
}
