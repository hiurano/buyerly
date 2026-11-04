import type { FastifyBaseLogger } from 'fastify';

// Cloudflare Turnstile on sign-up, as on Linear's /signup (services/turnstile.py).
// The browser solves the widget and sends its token; the server confirms it
// with Cloudflare's siteverify. Without TURNSTILE_SECRET_KEY (local
// development, tests) the check is off.

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type VerifyTurnstile = (token: string | null | undefined, remoteIp?: string) => Promise<boolean>;

export function turnstileVerifier(secret: string, log: FastifyBaseLogger, fetcher: typeof fetch = fetch): VerifyTurnstile {
  return async (token, remoteIp) => {
    if (!secret) return true;
    if (!token) return false;
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);
    let result: unknown;
    try {
      const response = await fetcher(SITEVERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result = await response.json();
    } catch (error) {
      // Fails closed: no answer is not a yes.
      log.warn({ err: error }, 'Turnstile siteverify failed');
      return false;
    }
    const answer = (result ?? {}) as { success?: unknown; 'error-codes'?: unknown };
    if (answer.success !== true) {
      log.info({ errorCodes: answer['error-codes'] }, 'Turnstile rejected a token');
      return false;
    }
    return true;
  };
}
