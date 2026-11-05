import { createECDH, createPrivateKey, type KeyObject } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';

// The VAPID key desktop notifications are signed with (core/web_push.py),
// as far as the client API needs it: whether there is one, and the
// applicationServerKey the page subscribes with. Sending is the worker's.

// base64.urlsafe_b64decode after padding, as Python reads it: either
// alphabet, characters outside it skipped; a lone extra character fails.
export function b64urlDecode(value: string): Buffer {
  const clean = value.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  if (clean.length % 4 === 1) throw new Error('Invalid base64-encoded string');
  return Buffer.from(clean, 'base64');
}

export function b64urlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function publicPoint(key: KeyObject): Buffer | null {
  const jwk = key.export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) return null;
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
}

function derKey(raw: Buffer): KeyObject {
  // `openssl ecparam -genkey -outform DER` writes SEC1; PKCS#8 is the other form Python accepts.
  try {
    return createPrivateKey({ key: raw, format: 'der', type: 'sec1' });
  } catch {
    return createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' });
  }
}

// The uncompressed P-256 public point of VAPID_PRIVATE_KEY, base64url; null
// when there is no key or it is not a P-256 private key.
export function vapidPublicKey(value: string, log?: FastifyBaseLogger): string | null {
  if (!value) return null;
  let point: Buffer | null;
  try {
    if (value.startsWith('-----BEGIN')) {
      point = publicPoint(createPrivateKey(value.replace(/\\n/g, '\n')));
    } else {
      const raw = b64urlDecode(value.replace(/\+/g, '-').replace(/\//g, '_'));
      if (raw.length === 32) {
        const ecdh = createECDH('prime256v1');
        ecdh.setPrivateKey(raw);
        point = ecdh.getPublicKey();
      } else {
        point = publicPoint(derKey(raw));
      }
    }
  } catch {
    point = null;
  }
  if (!point) log?.error('VAPID_PRIVATE_KEY is not a P-256 private key; desktop notifications are off');
  return point ? b64urlEncode(point) : null;
}
