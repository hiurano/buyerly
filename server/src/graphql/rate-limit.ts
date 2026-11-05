import type { GraphQLContext } from './context.ts';
import { RouteError } from './errors.ts';

// A field's share of a REST route's rate limit (core/rate_limit.py
// rate_limit_dep): the Python bridge runs the route's dependencies, so a
// field moved here keeps the route's limit on the client address, refused
// before anything else is checked.
export function limitField(context: GraphQLContext, scope: string, limit: number, windowSeconds = 60): void {
  const key = `${scope}:ip:${context.app.clientAddress.ip(context.http)}`;
  const [allowed, retryAfter] = context.app.rateLimiter.allow(key, limit, windowSeconds);
  if (!allowed) {
    throw new RouteError(429, `Too many requests. Please try again in ${retryAfter} s.`, { 'Retry-After': String(retryAfter) });
  }
}
