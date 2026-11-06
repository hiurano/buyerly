import { createHash } from 'node:crypto';
import type { GraphQLContext } from './context.ts';
import { RouteError } from './errors.ts';

// A field's share of a REST route's rate limit (core/rate_limit.py
// rate_limit_dep): the Python bridge runs the route's dependencies, so a
// field moved here keeps the route's limit on the client address, refused
// before anything else is checked.
// `identity` names the account the field acts on (the route's identityFields):
// it gets its own counter, so rotating addresses does not help.
export function limitField(context: GraphQLContext, scope: string, limit: number, windowSeconds = 60, identity = ''): void {
  const keys = [`${scope}:ip:${context.app.clientAddress.ip(context.http)}`];
  const account = identity.trim().toLowerCase();
  if (account) keys.push(`${scope}:identity:${createHash('sha256').update(account).digest('hex')}`);
  let retryAfter = 0;
  for (const key of keys) {
    const [allowed, wait] = context.app.rateLimiter.allow(key, limit, windowSeconds);
    if (!allowed) retryAfter = Math.max(retryAfter, wait);
  }
  if (retryAfter) {
    throw new RouteError(429, `Too many requests. Please try again in ${retryAfter} s.`, { 'Retry-After': String(retryAfter) });
  }
}
