import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { ClientAddress, normalizeIp } from '../src/http/client-address.ts';
import { RateLimiter } from '../src/http/rate-limit.ts';

// tests/test_rate_limit.py, TestRateLimiterCore.

function request(peer: string, headers: Record<string, string> = {}): FastifyRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return { socket: { remoteAddress: peer }, headers: lower } as unknown as FastifyRequest;
}

function address(settings: { trusted?: string; cloudflare?: string; tunnel?: string }): ClientAddress {
  return new ClientAddress({
    trustedProxyCidrs: settings.trusted ?? '',
    cloudflareIpCidrs: settings.cloudflare ?? '',
    cloudflareTunnelCidrs: settings.tunnel ?? '',
  });
}

// What Starlette (and Node) read from a header holding UTF-8 bytes.
const utf8AsLatin1 = (value: string) => Buffer.from(value, 'utf8').toString('latin1');

const CLOUDFLARE_HEADERS = {
  'CF-Connecting-IP': '203.0.113.8',
  'cf-ipcity': 'Helsinki',
  'cf-region-code': '18',
  'cf-ipcountry': 'FI',
};

describe('rate limiter', () => {
  it('allows a sliding window of requests', () => {
    const limiter = new RateLimiter(60_000);
    const now = Date.now();
    for (let index = 0; index < 3; index += 1) expect(limiter.allow('user_test', 3, 1, now)).toEqual([true, 0]);
    const [allowed, retryAfter] = limiter.allow('user_test', 3, 1, now);
    expect(allowed).toBe(false);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(limiter.allow('user_test', 3, 1, now + 1001)).toEqual([true, 0]);
  });

  it('forgets keys untouched for ten minutes', () => {
    const limiter = new RateLimiter(60_000);
    const now = Date.now();
    limiter.allow('old_key', 5, 60, now - 700_000);
    limiter.allow('recent_key', 5, 60, now);
    const internals = limiter as unknown as { records: Map<string, number[]>; cleanup(now: number): void };
    internals.cleanup(now);
    const records = internals.records;
    expect(records.has('old_key')).toBe(false);
    expect(records.has('recent_key')).toBe(true);
  });
});

describe('client address', () => {
  it('normalizes addresses as Python ipaddress does', () => {
    expect(normalizeIp(' 203.0.113.8 ')).toBe('203.0.113.8');
    expect(normalizeIp('[2001:DB8::1]')).toBe('2001:db8::1');
    expect(normalizeIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
    expect(normalizeIp('203.0.113.8:443')).toBe('203.0.113.8');
    expect(normalizeIp('not-an-ip')).toBeNull();
  });

  it('takes forwarded headers only from a trusted direct peer', () => {
    const client = address({ trusted: '10.0.0.0/8' });
    expect(client.ip(request('198.51.100.10', { 'X-Forwarded-For': '203.0.113.8' }))).toBe('198.51.100.10');
    expect(client.ip(request('10.9.8.7', { 'X-Forwarded-For': '203.0.113.8, 10.1.2.3' }))).toBe('203.0.113.8');
    expect(client.ip(request('10.9.8.7', { 'X-Forwarded-For': 'not-an-ip' }))).toBe('10.9.8.7');
  });

  it('believes Cloudflare headers only from Cloudflare', () => {
    const client = address({ trusted: '10.0.0.0/8' });
    // Cloudflare (162.158.0.0/15) -> our nginx (10.9.8.7) -> server.
    const throughCloudflare = request('10.9.8.7', { ...CLOUDFLARE_HEADERS, 'X-Forwarded-For': '203.0.113.8, 162.158.1.2' });
    expect(client.ip(throughCloudflare)).toBe('203.0.113.8');
    expect(client.location(throughCloudflare)).toBe('Helsinki, 18, FI');

    const direct = request('198.51.100.10', CLOUDFLARE_HEADERS);
    expect(client.ip(direct)).toBe('198.51.100.10');
    expect(client.location(direct)).toBe('');

    const spoofed = request('10.9.8.7', { ...CLOUDFLARE_HEADERS, 'X-Forwarded-For': '162.158.1.2, 198.51.100.10' });
    expect(client.ip(spoofed)).toBe('198.51.100.10');
    expect(client.location(spoofed)).toBe('');

    const noVisitor = request('10.9.8.7', { 'X-Forwarded-For': '162.158.1.2' });
    expect(client.ip(noVisitor)).toBe('162.158.1.2');
    expect(client.location(noVisitor)).toBe('');

    const off = address({ trusted: '10.0.0.0/8', cloudflare: 'off' });
    expect(off.ip(throughCloudflare)).toBe('162.158.1.2');
    expect(off.location(throughCloudflare)).toBe('');
  });

  it('counts the Cloudflare Tunnel only from its local address', () => {
    const client = address({ trusted: '172.16.0.0/12', tunnel: '172.16.0.0/12' });
    const throughTunnel = request('172.18.0.3', { ...CLOUDFLARE_HEADERS, 'X-Forwarded-For': '203.0.113.8, 172.18.0.1' });
    expect(client.ip(throughTunnel)).toBe('203.0.113.8');
    expect(client.location(throughTunnel)).toBe('Helsinki, 18, FI');

    const tunnelOnly = request('172.18.0.3', { ...CLOUDFLARE_HEADERS, 'X-Forwarded-For': '172.18.0.1' });
    expect(client.ip(tunnelOnly)).toBe('203.0.113.8');
    expect(client.location(tunnelOnly)).toBe('Helsinki, 18, FI');

    expect(client.ip(request('172.18.0.3', { 'X-Forwarded-For': '172.18.0.1' }))).toBe('172.18.0.1');

    for (const forwarded of ['198.51.100.10', '172.18.0.1, 198.51.100.10', '162.158.1.2, 198.51.100.10']) {
      const direct = request('172.18.0.3', { ...CLOUDFLARE_HEADERS, 'X-Forwarded-For': forwarded });
      expect(client.ip(direct)).toBe('198.51.100.10');
      expect(client.location(direct)).toBe('');
    }

    const proxyItself = request('172.18.0.3', CLOUDFLARE_HEADERS);
    expect(client.ip(proxyItself)).toBe('172.18.0.3');
    expect(client.location(proxyItself)).toBe('');

    const publicPeer = request('198.51.100.10', CLOUDFLARE_HEADERS);
    expect(client.ip(publicPeer)).toBe('198.51.100.10');
    expect(client.location(publicPeer)).toBe('');

    const off = address({ trusted: '172.16.0.0/12', tunnel: '172.16.0.0/12', cloudflare: 'off' });
    expect(off.location(throughTunnel)).toBe('');
    expect(off.ip(tunnelOnly)).toBe('172.18.0.1');

    const noTunnel = address({ trusted: '172.16.0.0/12' });
    expect(noTunnel.location(throughTunnel)).toBe('');
    expect(noTunnel.ip(tunnelOnly)).toBe('172.18.0.1');

    const localTunnel = address({ tunnel: '127.0.0.1/32,::1/128' });
    const local = request('127.0.0.1', CLOUDFLARE_HEADERS);
    expect(localTunnel.ip(local)).toBe('203.0.113.8');
    expect(localTunnel.location(local)).toBe('Helsinki, 18, FI');
  });

  it('follows the Python API proxy one hop further to the tunnel', () => {
    // Production while both servers run: cloudflared (172.30.0.10) -> api
    // (172.30.0.5), which appends its peer to X-Forwarded-For -> server.
    const client = address({ trusted: '172.30.0.0/24', tunnel: '172.30.0.10/32' });
    const proxied = request('172.30.0.5', { ...CLOUDFLARE_HEADERS, 'X-Forwarded-For': '203.0.113.8, 172.30.0.10' });
    expect(client.ip(proxied)).toBe('203.0.113.8');
    expect(client.location(proxied)).toBe('Helsinki, 18, FI');
  });

  it('cleans the Cloudflare location', () => {
    const client = address({});
    expect(client.location(request('2606:4700::1', { 'cf-ipcity': utf8AsLatin1('Malmö'), 'cf-ipcountry': 'XX' }))).toBe('Malmö');
    expect(client.location(request('104.16.0.1', { 'cf-ipcountry': 'se' }))).toBe('SE');
    expect(
      client.location(request('104.16.0.1', { 'cf-ipcity': 'Washington, D.C.\x01', 'cf-region-code': 'DC', 'cf-ipcountry': 'US' })),
    ).toBe('Washington D.C., DC, US');
    expect(client.location(request('104.16.0.1', { 'cf-ipcity': 'S%C3%A3o Paulo' }))).toBe('São Paulo');
    expect(client.location(request('104.16.0.1'))).toBe('');
  });
});
