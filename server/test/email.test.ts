import { readFileSync } from 'node:fs';
import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { SITEVERIFY_URL, turnstileVerifier } from '../src/auth/turnstile.ts';
import { loginCodeEmailHtml, otpVerificationEmail } from '../src/email/login-email.ts';
import { RESEND_API_URL, resendSender } from '../src/email/send.ts';

// tests/test_turnstile.py, tests/test_open_signup.py (TestEmailDelivery) and
// tests/test_dev_sign_in.py (TestDevEmailLog).

function logger() {
  const lines: string[] = [];
  const record = (first: unknown, second?: unknown) => {
    lines.push(typeof first === 'string' ? first : typeof second === 'string' ? second : '');
  };
  const log = { info: record, warn: record, error: record } as unknown as FastifyBaseLogger;
  return { log, lines };
}

function fetchAnswering(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    return answer();
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('turnstile', () => {
  const { log } = logger();

  it('is off without a secret', async () => {
    expect(await turnstileVerifier('', log)(null)).toBe(true);
  });

  it('fails a missing token without asking Cloudflare', async () => {
    const { fetcher, calls } = fetchAnswering(() => Response.json({ success: true }));
    const verify = turnstileVerifier('test-turnstile-secret', log, fetcher);
    expect(await verify(null)).toBe(false);
    expect(await verify('')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("follows Cloudflare's answer", async () => {
    for (const [answer, expected] of [
      [{ success: true }, true],
      [{ success: false, 'error-codes': ['invalid-input-response'] }, false],
      [{}, false],
    ] as const) {
      const { fetcher, calls } = fetchAnswering(() => Response.json(answer));
      expect(await turnstileVerifier('test-turnstile-secret', log, fetcher)('cf-token', '203.0.113.7')).toBe(expected);
      expect(calls[0].url).toBe(SITEVERIFY_URL);
      expect(Object.fromEntries(new URLSearchParams(calls[0].init.body as URLSearchParams))).toEqual({
        secret: 'test-turnstile-secret',
        response: 'cf-token',
        remoteip: '203.0.113.7',
      });
    }
  });

  it('fails closed on errors', async () => {
    for (const answer of [
      () => { throw new TypeError('down'); },
      () => Response.json({ success: true }, { status: 500 }),
      () => new Response('not json'),
    ]) {
      const { fetcher } = fetchAnswering(answer);
      expect(await turnstileVerifier('test-turnstile-secret', log, fetcher)('cf-token', 'unknown')).toBe(false);
    }
  });
});

describe('email', () => {
  const settings = { emailFrom: 'Buyerly <team@buyerly.app>', devEmailLog: false };

  it('sends through Resend with a cleaned key and its own user agent', async () => {
    const { log } = logger();
    const { fetcher, calls } = fetchAnswering(() => Response.json({ id: 'msg_123' }));
    const send = resendSender({ ...settings, resendApiKey: '  "re_clean_secret_key_123" \r\n' }, log, fetcher);
    expect(await send({ to: '  user@example.com  ', subject: 'Test Subject', html: '<p>Hello</p>', text: 'Hello' })).toBe(true);
    expect(calls[0].url).toBe(RESEND_API_URL);
    expect(calls[0].init.headers).toEqual({
      Authorization: 'Bearer re_clean_secret_key_123',
      'Content-Type': 'application/json',
      'User-Agent': 'buyerly/1.0',
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      from: 'Buyerly <team@buyerly.app>',
      to: ['user@example.com'],
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it('reports a refusal from Resend', async () => {
    const { log } = logger();
    const { fetcher } = fetchAnswering(() => Response.json({ message: 'Forbidden' }, { status: 403 }));
    const send = resendSender({ ...settings, resendApiKey: 're_some_key' }, log, fetcher);
    expect(await send({ to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' })).toBe(false);
  });

  it('logs instead of sending without a key, and refuses an empty recipient', async () => {
    const { log } = logger();
    const send = resendSender({ ...settings, resendApiKey: '' }, log);
    expect(await send({ to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' })).toBe(true);
    expect(await send({ to: '   ', subject: 'Test', html: '<p>Test</p>' })).toBe(false);
  });

  it('puts the code in the log only on the local stack', async () => {
    for (const devEmailLog of [false, true]) {
      const { log, lines } = logger();
      const send = resendSender({ ...settings, resendApiKey: '', devEmailLog }, log);
      const message = otpVerificationEmail('dev@buyerly.localhost', 'KQZMRTWPDA', 'http://localhost:5173/auth/email/verify?token=t');
      expect(await send(message)).toBe(true);
      expect(lines.join('\n').includes('KQZMRTWPDA')).toBe(devEmailLog);
    }
  });

  it('renders the login email exactly as the Python API does', () => {
    // Fixtures rendered by core/email.py's _login_code_email_html.
    const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
    expect(loginCodeEmailHtml('KQZMRTWPDA', "https://buyerly.app/auth/email/verify?token=a&b=<'\">")).toBe(fixture('login-email.html'));
    expect(loginCodeEmailHtml('KQZMRTWPDA', null)).toBe(fixture('verification-email.html'));
  });

  it('writes the subjects and text of core/email.py', () => {
    const login = otpVerificationEmail('a@b.c', 'KQZMRTWPDA', 'https://x/auth/email/verify?token=t');
    expect(login.subject).toBe('Login for Buyerly');
    expect(login.text).toBe(
      'To log in to Buyerly, follow this link https://x/auth/email/verify?token=t\n' +
        "If you can't click on the link, you can also copy the verification code into your browser:\n" +
        'KQZMRTWPDA\n\nThe link and code are valid for 5 minutes and can be used only once.',
    );
    const change = otpVerificationEmail('a@b.c', 'KQZMRTWPDA');
    expect(change.subject).toBe('Your Buyerly verification code is KQZMRTWPDA');
    expect(change.text).toBe('Your Buyerly verification code:\nKQZMRTWPDA\n\nThe link and code are valid for 5 minutes and can be used only once.');
  });
});
