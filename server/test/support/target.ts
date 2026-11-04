import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { buildApp, type Services } from '../../src/app.ts';
import { readConfig, type Config } from '../../src/config.ts';
import { connectDatabase } from '../../src/database.ts';
import type { EmailMessage } from '../../src/email/send.ts';

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

export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  setCookies: string[];
  body: unknown;
}

export interface Target {
  kind: 'typescript' | 'python';
  send(request: HttpRequest): Promise<HttpResponse>;
  // The last email sent to the address, once it has been sent.
  lastEmail(to: string): Promise<EmailMessage>;
  close(): Promise<void>;
}

export interface InProcessTarget extends Target {
  kind: 'typescript';
  app: FastifyInstance;
  services: Services;
  config: Config;
}

function encode(body: unknown): string | undefined {
  return body === undefined ? undefined : JSON.stringify(body);
}

// This server, in-process. `services` may be swapped by a test; the mailer
// records every message by default and Turnstile says yes.
export async function typescriptTarget(env: Record<string, string> = {}): Promise<InProcessTarget> {
  const outbox: EmailMessage[] = [];
  const config = readConfig({
    LOG_LEVEL: 'silent',
    OTP_PEPPER: TEST_OTP_PEPPER,
    // app.inject connects from 127.0.0.1: like a proxy, it may forward the
    // browser's address, so each test browser has its own.
    TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
    WEBAPP_URL: 'https://buyerly.test',
    ...env,
  });
  const services: Services = {
    sendEmail: async (message) => {
      outbox.push(message);
      return true;
    },
    verifyTurnstile: async () => true,
  };
  // Indirect, so a test may replace a service after the app is built.
  const app = buildApp(config, connectDatabase(DATABASE_URL), {
    services: {
      sendEmail: (message) => services.sendEmail(message),
      verifyTurnstile: (token, ip) => services.verifyTurnstile(token, ip),
    },
  });
  await app.ready();
  return {
    kind: 'typescript',
    app,
    services,
    config,
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
      return {
        status: response.statusCode,
        headers,
        setCookies: cookies === undefined ? [] : Array.isArray(cookies) ? cookies : [cookies],
        body: response.body ? (JSON.parse(response.body) as unknown) : null,
      };
    },
    async lastEmail(to) {
      const message = outbox.findLast((item) => item.to === to);
      if (!message) throw new Error(`No email was sent to ${to}`);
      return message;
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

function parsed(raw: string): unknown {
  try {
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return raw;
  }
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
        body: encode(request.body),
        redirect: 'manual',
      });
      const raw = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') headers[name] = value;
      });
      return { status: response.status, headers, setCookies: response.headers.getSetCookie(), body: parsed(raw) };
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
