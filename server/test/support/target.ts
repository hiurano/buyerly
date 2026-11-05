import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { buildApp, type BuildOptions, type Services } from '../../src/app.ts';
import { DEFAULT_UPLOADS_ROOT, readConfig, type Config } from '../../src/config.ts';
import { connectDatabase } from '../../src/database.ts';
import type { EmailMessage } from '../../src/email/send.ts';
import { telegramBot, type TelegramBot } from '../../src/notifications/telegram.ts';

// The server a contract test talks to over HTTP (#611 stage 3).
//
// By default that is this server, built in-process on the Alembic-migrated
// database in SCHEMA_DATABASE_URL and driven with app.inject. With
// CONTRACT_TARGET=python the same tests run against a running Python API
// (PYTHON_API_URL) on the same database, which proves both answer alike;
// tests that need to replace a service (Turnstile, a failing mailer) run
// in-process only. See docs/DEVELOPMENT.md, "Контрактные тесты сервера".

export const DATABASE_URL = process.env.SCHEMA_DATABASE_URL ?? '';
if (!DATABASE_URL && process.env.CI) throw new Error('SCHEMA_DATABASE_URL must be set in CI');

// Both servers hash codes with it; the Python API must run with the same one.
export const TEST_OTP_PEPPER = 'contract-test-otp-pepper';

// Desktop notifications' VAPID key, also the Python API's in CI, and the
// public key both servers derive from it.
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
  method: 'GET' | 'POST' | 'DELETE';
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
  kind: 'typescript' | 'python';
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

// fetch takes bytes as a Uint8Array over an ArrayBuffer, not a Buffer.
function bytesOrText(body: string | Buffer | undefined): string | Uint8Array<ArrayBuffer> | undefined {
  return Buffer.isBuffer(body) ? new Uint8Array(body) : body;
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
    // Client API documents with fields not moved yet go to the Python API when one runs (CI).
    API_URL: process.env.PYTHON_API_URL ?? '',
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

// The Python API's log record of an email it would have sent: without
// RESEND_API_KEY and with DEV_EMAIL_LOG=true, core/email.py logs "To: …"
// and then the text, back to back.
const RECORD_START = /\n(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} \[)/;

async function emailFromLog(path: string, to: string): Promise<EmailMessage | null> {
  const records = (await readFile(path, 'utf8')).split(RECORD_START);
  let found: EmailMessage | null = null;
  for (let index = 0; index < records.length - 1; index += 1) {
    const header = /\[DEV EMAIL\] To: (\S+) \| Subject: (.*) \| \(No RESEND_API_KEY configured\)/.exec(records[index]);
    if (!header || header[1] !== to) continue;
    const body = /\[DEV EMAIL\] ([\s\S]*)$/.exec(records[index + 1]);
    if (body) found = { to, subject: header[2], html: '', text: body[1].trimEnd() };
  }
  return found;
}

export function pythonTarget(): Target {
  const base = (process.env.PYTHON_API_URL ?? '').replace(/\/+$/, '');
  const log = process.env.PYTHON_API_LOG ?? '';
  if (!base || !log) throw new Error('PYTHON_API_URL and PYTHON_API_LOG must be set');
  return {
    kind: 'python',
    async send(request) {
      const response = await fetch(`${base}${request.path}`, {
        method: request.method,
        headers: request.headers,
        body: bytesOrText(encode(request.body)),
        redirect: 'manual',
      });
      const raw = Buffer.from(await response.arrayBuffer());
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') headers[name] = value;
      });
      return { status: response.status, headers, setCookies: response.headers.getSetCookie(), body: parsed(raw.toString('utf8')), raw };
    },
    async lastEmail(to) {
      // The log is written as the request finishes; give it a moment.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const message = await emailFromLog(log, to);
        if (message) return message;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`No email to ${to} in ${log}`);
    },
    // The API in CI runs from the repository, so it keeps them in uploads/.
    uploadsRoot: process.env.PYTHON_UPLOADS_DIR ?? DEFAULT_UPLOADS_ROOT,
    socketUrl: async (path) => `${base.replace(/^http/, 'ws')}${path}`,
    close: async () => {},
  };
}

export const CONTRACT_TARGET = process.env.CONTRACT_TARGET === 'python' ? 'python' : 'typescript';

// The target the contract tests run against in this run.
export async function contractTarget(): Promise<Target> {
  return CONTRACT_TARGET === 'python' ? pythonTarget() : typescriptTarget();
}

// The code and link token of a login (or verification) email.
export function codeFrom(message: EmailMessage): { code: string; linkToken: string | null } {
  const code = /\n([A-Z]{10})\n\nThe link and code/.exec(message.text ?? '')?.[1];
  if (!code) throw new Error(`No code in the email to ${message.to}`);
  const linkToken = /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text ?? '')?.[1] ?? null;
  return { code, linkToken };
}
