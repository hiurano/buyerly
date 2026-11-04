import { createHash } from 'node:crypto';
import type { FastifyRequest, preValidationAsyncHookHandler } from 'fastify';
import { HttpError } from './errors.ts';

// Sliding-window limits kept in this process's memory, as the Python API's
// core/rate_limit.py does. Production runs one server process, so every
// request shares the counters; a restart only gives a client a fresh window.
// The counters are not shared with the Python API: an area's limits move
// with the area.
export class RateLimiter {
  private readonly records = new Map<string, number[]>();
  private lastCleanup = Date.now();

  constructor(private readonly cleanupIntervalMs = 300_000) {}

  // Whether one more request fits, and if not, in how many seconds it would.
  allow(key: string, limit: number, windowSeconds: number, now = Date.now()): [boolean, number] {
    if (limit < 1 || windowSeconds < 1) throw new Error('limit and windowSeconds must be positive');
    if (now - this.lastCleanup > this.cleanupIntervalMs) this.cleanup(now);
    const windowStart = now - windowSeconds * 1000;
    const stamps = (this.records.get(key) ?? []).filter((stamp) => stamp > windowStart);
    this.records.set(key, stamps);
    if (stamps.length < limit) {
      stamps.push(now);
      return [true, 0];
    }
    return [false, Math.max(1, Math.ceil((stamps[0] + windowSeconds * 1000 - now) / 1000))];
  }

  // Drop keys untouched for ten minutes.
  private cleanup(now: number): void {
    for (const [key, stamps] of this.records) {
      if (stamps.length === 0 || stamps[stamps.length - 1] < now - 600_000) this.records.delete(key);
    }
    this.lastCleanup = now;
  }
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds?: number;
  // Names the counter; routes with the same scope share it.
  scope: string;
  // Body fields that name the account a request acts on (the first one set);
  // that account gets its own counter, so rotating addresses does not help.
  identityFields?: string[];
}

function identity(request: FastifyRequest, fields: string[]): string {
  const type = (request.headers['content-type'] ?? '').split(';', 1)[0].trim();
  if (!fields.length || type !== 'application/json') return '';
  const body = request.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return '';
  for (const field of fields) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  }
  return '';
}

// A route hook (preValidation, so a flood is refused before the body is
// checked, as FastAPI's dependency is). Limits the client address and, when
// the body names one, the account, each on its own counter.
export function rateLimit(options: RateLimitOptions): preValidationAsyncHookHandler {
  const windowSeconds = options.windowSeconds ?? 60;
  return async function limited(request) {
    const keys = [`${options.scope}:ip:${request.server.clientAddress.ip(request)}`];
    const account = identity(request, options.identityFields ?? []);
    if (account) keys.push(`${options.scope}:identity:${createHash('sha256').update(account).digest('hex')}`);
    let retryAfter = 0;
    for (const key of keys) {
      const [allowed, wait] = request.server.rateLimiter.allow(key, options.limit, windowSeconds);
      if (!allowed) retryAfter = Math.max(retryAfter, wait);
    }
    if (retryAfter) {
      throw new HttpError(429, `Too many requests. Please try again in ${retryAfter} s.`, {
        'Retry-After': String(retryAfter),
      });
    }
  };
}
