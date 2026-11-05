import { BlockList, isIPv4, isIPv6 } from 'node:net';
import type { FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';

// The browser's address and place, as core/rate_limit.py reads them.
//
// Forwarding headers count only from proxies we trust (TRUSTED_PROXY_CIDRS),
// and Cloudflare's headers (CF-Connecting-IP, the visitor location) only when
// Cloudflare itself made the connection: from its published edge networks, or
// from our Cloudflare Tunnel's local address. While the Python API forwards
// this server's paths (api/server_proxy.py), it appends its own peer, the
// tunnel, to X-Forwarded-For; the server's Compose service trusts the Docker
// network, so the chain is followed one hop further than the API does.

// https://www.cloudflare.com/ips/ (checked 2026-10-07); used while CLOUDFLARE_IP_CIDRS is empty.
export const CLOUDFLARE_PUBLISHED_CIDRS =
  '173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,' +
  '141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,' +
  '197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,' +
  '104.24.0.0/14,172.64.0.0/13,131.0.72.0/22,' +
  '2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,' +
  '2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32';

type Family = 'ipv4' | 'ipv6';

function family(ip: string): Family {
  return isIPv4(ip) ? 'ipv4' : 'ipv6';
}

// ::ffff:a.b.c.d is the IPv4 address it carries.
function unmapped(ipv6: string): string {
  const canonical = new URL(`http://[${ipv6}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

// One address in its canonical spelling, or null; "[v6]" and "v4:port" too.
export function normalizeIp(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith('[') && value.includes(']')) value = value.slice(1, value.indexOf(']'));
  if (isIPv4(value)) return value;
  if (isIPv6(value)) return unmapped(value);
  if (value.split(':').length === 2 && value.includes('.')) {
    const host = value.slice(0, value.lastIndexOf(':'));
    if (isIPv4(host)) return host;
  }
  return null;
}

const networkCache = new Map<string, BlockList>();

// A comma-separated list of networks; a bad entry is skipped, as in Python.
export function networks(raw: string): BlockList {
  const cached = networkCache.get(raw);
  if (cached) return cached;
  const list = new BlockList();
  for (const item of raw.split(',')) {
    const value = item.trim();
    if (!value) continue;
    const [address = '', prefixText] = value.split('/', 2);
    const ip = normalizeIp(address);
    if (ip === null || address.includes('[')) continue;
    const kind = family(ip);
    const max = kind === 'ipv4' ? 32 : 128;
    const prefix = prefixText === undefined ? max : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max || (prefixText !== undefined && !/^\d+$/.test(prefixText))) continue;
    list.addSubnet(ip, prefix, kind);
  }
  networkCache.set(raw, list);
  return list;
}

function inNetworks(ip: string, raw: string): boolean {
  return networks(raw).check(ip, family(ip));
}

export class ClientAddress {
  constructor(private readonly config: Pick<Config, 'trustedProxyCidrs' | 'cloudflareIpCidrs' | 'cloudflareTunnelCidrs'>) {}

  private trustedProxy(ip: string): boolean {
    return inNetworks(ip, this.config.trustedProxyCidrs);
  }

  private fromCloudflare(ip: string): boolean {
    const configured = this.config.cloudflareIpCidrs.trim();
    if (configured.toLowerCase() === 'off') return false;
    return inNetworks(ip, configured || CLOUDFLARE_PUBLISHED_CIDRS);
  }

  private fromTunnel(ip: string): boolean {
    const configured = this.config.cloudflareTunnelCidrs.trim();
    if (!configured || this.config.cloudflareIpCidrs.trim().toLowerCase() === 'off') return false;
    return inNetworks(ip, configured);
  }

  // Whether the request came straight from one of our proxies (the Python
  // API while it forwards), which may then speak for the browser in
  // X-Forwarded-* headers.
  viaTrustedProxy(request: FastifyRequest): boolean {
    const peer = normalizeIp(request.socket.remoteAddress ?? '');
    return peer !== null && this.trustedProxy(peer);
  }

  // The address that connected to our own proxies, and whether it is our
  // Cloudflare Tunnel. A trusted proxy's own address is never taken for the
  // tunnel, so the tunnel networks may overlap TRUSTED_PROXY_CIDRS.
  private edge(request: FastifyRequest): [string, boolean] {
    const peer = normalizeIp(request.socket.remoteAddress ?? '');
    if (peer === null) return ['unknown', false];
    if (!this.trustedProxy(peer)) return [peer, this.fromTunnel(peer)];

    const forwarded = header(request, 'x-forwarded-for');
    if (forwarded) {
      const chain = forwarded.split(',').map(normalizeIp);
      if (chain.some((item) => item === null)) return [peer, false];
      let current = peer;
      for (const hop of chain.reverse()) {
        if (!this.trustedProxy(current)) break;
        current = hop!;
        if (this.fromTunnel(current)) return [current, true];
      }
      return [current, false];
    }

    const realIp = normalizeIp(header(request, 'x-real-ip'));
    if (realIp) return [realIp, this.fromTunnel(realIp)];
    return [peer, false];
  }

  private viaCloudflare(request: FastifyRequest): boolean {
    const [edgeIp, viaTunnel] = this.edge(request);
    return viaTunnel || (edgeIp !== 'unknown' && this.fromCloudflare(edgeIp));
  }

  // The browser's address, or "unknown".
  ip(request: FastifyRequest): string {
    const [edgeIp, viaTunnel] = this.edge(request);
    if (viaTunnel || (edgeIp !== 'unknown' && this.fromCloudflare(edgeIp))) {
      const visitor = normalizeIp(header(request, 'cf-connecting-ip'));
      if (visitor) return visitor;
    }
    return edgeIp;
  }

  // "Helsinki, 18, FI" from Cloudflare's visitor location headers, as Linear
  // shows it; empty when the request did not come through Cloudflare.
  location(request: FastifyRequest): string {
    if (!this.viaCloudflare(request)) return '';
    const city = locationPart(header(request, 'cf-ipcity'), 80);
    const region = locationPart(header(request, 'cf-region-code'), 10);
    let country = locationPart(header(request, 'cf-ipcountry'), 2).toUpperCase();
    if (UNKNOWN_COUNTRIES.has(country) || !/^\p{L}+$/u.test(country)) country = '';
    return [city, region, country].filter(Boolean).join(', ');
  }
}

const UNKNOWN_COUNTRIES = new Set(['XX', 'T1']);

function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value.join(', ') : (value ?? '');
}

// Python's urllib.parse.unquote: runs of %XX as UTF-8, bad bytes replaced,
// anything else left as it is.
function unquote(value: string): string {
  return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => Buffer.from(run.replace(/%/g, ''), 'hex').toString('utf8'));
}

// Not printable in Python's sense (str.isprintable), or a comma.
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs},]/u;

function locationPart(raw: string, maxLength: number): string {
  let value = raw.trim();
  if (!value) return '';
  // Node reads headers as latin-1; Cloudflare sends city names as UTF-8 bytes.
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(value, 'latin1'));
  } catch {
    // Not UTF-8: keep it as read.
  }
  if (value.includes('%')) value = unquote(value);
  value = Array.from(value).filter((char) => char === ' ' || !UNPRINTABLE.test(char)).join('').trim();
  return Array.from(value).slice(0, maxLength).join('');
}
