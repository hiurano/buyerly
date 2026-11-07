import { mkdtempSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { buildApp, type BuildOptions, type Services } from '../../src/app.ts';
import { readConfig, type Config } from '../../src/config.ts';
import { connectDatabase } from '../../src/database.ts';
import type { EmailMessage } from '../../src/email/send.ts';
import { telegramBot, type TelegramBot } from '../../src/notifications/telegram.ts';

// The server a contract test talks to over HTTP (#611 stage 3).
//
// By default that is this server, built in-process on the Alembic-migrated
// database in SCHEMA_DATABASE_URL and driven with app.inject. With
// tests that need to replace a service (Turnstile, a failing mailer) use
// the in-process target. See docs/DEVELOPMENT.md, "Контрактные тесты сервера".

export const DATABASE_URL = process.env.SCHEMA_DATABASE_URL ?? '';
if (!DATABASE_URL && process.env.CI) throw new Error('SCHEMA_DATABASE_URL must be set in CI');

// The pepper codes are hashed with in tests.
export const TEST_OTP_PEPPER = 'contract-test-otp-pepper';

// Desktop notifications' VAPID key and the public key derived from it.
export const TEST_VAPID_PRIVATE_KEY = 'Jktq3k5UFfBTLFB_MT7QCFPhMZvJyZiQvLJvTJ-D51Y';
export const TEST_VAPID_PUBLIC_KEY = 'BFrmRoMHs_Wd-vXXwwbJ_piZPV0inXK4_K-Xvsj4lFldcRWw0xNPfBliqNqPRyogU1sr_gW7aeXSjOG5Ywd6W-M';

// The bot in-process tests talk to instead of Telegram: set up only with
// TELEGRAM_BOT_TOKEN, as the real one, and keeping what it would send.
export interface FakeTelegram extends TelegramBot {
  sent: { chatId: number; text: string }[];
}

export function fakeTelegram(token: string): FakeTelegram {
  const real = telegramBot(token, { info: () => {}, error: () => {} } as unknown as FastifyBaseLogger);
  const sent: { chatId: number; text: string }[] = [];
  return {
    configured: real.configured,
    webhookSecret: () => real.webhookSecret(),
    username: async () => (token ? 'buyerly_test_bot' : null),
    sendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
      return { ok: true, error: '' };
    },
    sent,
  };
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  // JSON, or bytes sent as they are (a multipart form).
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  setCookies: string[];
  // JSON when the answer parses as JSON, otherwise its text.
  body: unknown;
  raw: Buffer;
}

export interface Target {
  kind: 'typescript';
  send(request: HttpRequest): Promise<HttpResponse>;
  // The last email sent to the address, once it has been sent.
  lastEmail(to: string): Promise<EmailMessage>;
  // Where the server keeps uploaded images.
  uploadsRoot: string;
  // A ws:// URL of the path on a listening server, for WebSocket tests.
  socketUrl(path: string): Promise<string>;
  close(): Promise<void>;
}

export interface InProcessTarget extends Target {
  kind: 'typescript';
  app: FastifyInstance;
  services: Services;
  config: Config;
  telegram: FakeTelegram;
}

function encode(body: unknown): string | Buffer | undefined {
  if (body === undefined || Buffer.isBuffer(body)) return body;
  return JSON.stringify(body);
}

function parsed(raw: string): unknown {
  try {
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return raw;
  }
}

// This server, in-process. `services` may be swapped by a test; the mailer
// records every message by default and Turnstile says yes.
export async function typescriptTarget(env: Record<string, string> = {}, build: Pick<BuildOptions, 'sync'> = {}): Promise<InProcessTarget> {
  const outbox: EmailMessage[] = [];
  const config = readConfig({
    LOG_LEVEL: 'silent',
    OTP_PEPPER: TEST_OTP_PEPPER,
    // app.inject connects from 127.0.0.1: like a proxy, it may forward the
    // browser's address, so each test browser has its own.
    TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
    WEBAPP_URL: 'https://buyerly.test',
    VAPID_PRIVATE_KEY: TEST_VAPID_PRIVATE_KEY,
    SERVER_UPLOADS_DIR: mkdtempSync(join(tmpdir(), 'buyerly-uploads-')),
    API_URL: '',
    ...env,
  });
  const telegram = fakeTelegram(config.telegramBotToken);
  const services: Services = {
    sendEmail: async (message) => {
      outbox.push(message);
      return true;
    },
    verifyTurnstile: async () => true,
    telegram,
    // No Meta from tests unless one answers for it (test/meta).
    metaFetch: (async () => {
      throw new TypeError('fetch failed', { cause: new Error('Meta is not reachable from tests') });
    }),
  };
  // Indirect, so a test may replace a service after the app is built.
  const app = buildApp(config, connectDatabase(DATABASE_URL), {
    services: {
      sendEmail: (message) => services.sendEmail(message),
      verifyTurnstile: (token, ip) => services.verifyTurnstile(token, ip),
      telegram,
    },
    ...build,
  });
  await app.ready();
  return {
    kind: 'typescript',
    app,
    services,
    config,
    telegram,
    async send(request) {
      const response = await app.inject({
        method: request.method,
        url: request.path,
        headers: request.headers,
        payload: encode(request.body),
      });
      const cookies = response.headers['set-cookie'];
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined && name !== 'set-cookie') headers[name] = String(value);
      }
      // As fetch and browsers do: the body unzipped, Content-Encoding kept.
      const raw = headers['content-encoding'] === 'gzip' ? gunzipSync(response.rawPayload).toString() : response.body;
      return {
        status: response.statusCode,
        headers,
        setCookies: cookies === undefined ? [] : Array.isArray(cookies) ? cookies : [cookies],
        body: parsed(raw),
        raw: response.rawPayload,
      };
    },
    async lastEmail(to) {
      const message = outbox.findLast((item) => item.to === to);
      if (!message) throw new Error(`No email was sent to ${to}`);
      return message;
    },
    uploadsRoot: config.uploadsRoot,
    async socketUrl(path) {
      // Listening only once a test needs a socket: app.inject needs no port.
      if (!app.server.listening) await app.listen({ port: 0, host: '127.0.0.1' });
      return `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}${path}`;
    },
    close: () => app.close(),
  };
}

// The target the contract tests run against in this run.
export async function contractTarget(): Promise<Target> {
  return typescriptTarget();
}

// Meta as the tests answer it (test/support/meta-recorder.ts): the server's
// Meta client sends to it, with this app secret and token key.
export const META_RECORDER_PORT = 18094;
export const META_TEST_ENV = {
  META_GRAPH_BASE_URL: `http://127.0.0.1:${META_RECORDER_PORT}`,
  META_APP_SECRET: 'contract-meta-secret',
  META_TOKEN_ENCRYPTION_KEY: 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=',
};

export async function metaContractTarget(): Promise<Target> {
  return typescriptTarget(META_TEST_ENV);
}

// The code and link token of a login (or verification) email.
export function codeFrom(message: EmailMessage): { code: string; linkToken: string | null } {
  const code = /\n([A-Z]{10})\n\nThe link and code/.exec(message.text ?? '')?.[1];
  if (!code) throw new Error(`No code in the email to ${message.to}`);
  const linkToken = /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text ?? '')?.[1] ?? null;
  return { code, linkToken };
}
