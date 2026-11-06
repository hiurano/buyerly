import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign, type KeyObject } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';

// Web Push with VAPID (RFC 8291, 8292; core/web_push.py): the key desktop
// notifications are signed with, the applicationServerKey the page
// subscribes with, and sending one notification, which the worker does.

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

export interface VapidKey {
  key: KeyObject;
  // The uncompressed P-256 public point.
  publicPoint: Buffer;
}

// VAPID_PRIVATE_KEY as Python reads it: PEM, a raw 32-byte scalar in
// base64url, or DER; null when there is none or it is not a P-256 key.
export function vapidKey(value: string, log?: FastifyBaseLogger): VapidKey | null {
  if (!value) return null;
  let found: VapidKey | null;
  try {
    if (value.startsWith('-----BEGIN')) {
      const key = createPrivateKey(value.replace(/\\n/g, '\n'));
      const point = publicPoint(key);
      found = point ? { key, publicPoint: point } : null;
    } else {
      const raw = b64urlDecode(value.replace(/\+/g, '-').replace(/\//g, '_'));
      if (raw.length === 32) {
        const ecdh = createECDH('prime256v1');
        ecdh.setPrivateKey(raw);
        const point = ecdh.getPublicKey();
        const key = createPrivateKey({
          key: { kty: 'EC', crv: 'P-256', d: raw.toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
          format: 'jwk',
        });
        found = { key, publicPoint: point };
      } else {
        const key = derKey(raw);
        const point = publicPoint(key);
        found = point ? { key, publicPoint: point } : null;
      }
    }
  } catch {
    found = null;
  }
  if (!found) log?.error('VAPID_PRIVATE_KEY is not a P-256 private key; desktop notifications are off');
  return found;
}

// The uncompressed P-256 public point of VAPID_PRIVATE_KEY, base64url; null
// when there is no key or it is not a P-256 private key.
export function vapidPublicKey(value: string, log?: FastifyBaseLogger): string | null {
  const found = vapidKey(value, log);
  return found ? b64urlEncode(found.publicPoint) : null;
}

// A notification older than this is no news: the push service drops it.
export const TTL_SECONDS = 24 * 60 * 60;
const RECORD_SIZE = 4096;
const TIMEOUT_MS = 10_000;

const hmac = (key: Buffer, data: Buffer): Buffer => createHmac('sha256', key).update(data).digest();

export interface EncryptOptions {
  salt?: Buffer;
  // The sender's ephemeral private key (32 bytes); tests fix it.
  senderPrivateKey?: Buffer;
}

// The aes128gcm body for one subscription (RFC 8291), in a single record.
export function encryptPush(plaintext: Buffer, p256dh: string, auth: string, options: EncryptOptions = {}): Buffer {
  const receiverPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  const sender = createECDH('prime256v1');
  if (options.senderPrivateKey) sender.setPrivateKey(options.senderPrivateKey);
  else sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const salt = options.salt ?? randomBytes(16);
  // Throws for a receiver key that is not a P-256 point.
  const shared = sender.computeSecret(receiverPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, senderPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  if (plaintext.length + 1 + 16 > RECORD_SIZE) throw new Error('Push message is too long');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(5);
  header.writeUInt32BE(RECORD_SIZE, 0);
  header.writeUInt8(senderPublic.length, 4);
  return Buffer.concat([salt, header, senderPublic, ciphertext]);
}

// `vapid t=<JWT>, k=<public key>` (RFC 8292) for the endpoint's push service.
export function vapidAuthorization(endpoint: string, vapid: VapidKey, subject: string, now: Date = new Date()): string {
  const url = new URL(endpoint);
  const claims = { aud: `${url.protocol}//${url.host}`, exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60, sub: subject };
  const signingInput = [{ typ: 'JWT', alg: 'ES256' }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  const signature = sign('sha256', Buffer.from(signingInput), { key: vapid.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${signingInput}.${signature.toString('base64url')}, k=${b64urlEncode(vapid.publicPoint)}`;
}

export interface PushSendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

// The subscription expired or was unsubscribed: forget it.
export const pushGone = (result: PushSendResult): boolean => result.status === 404 || result.status === 410;

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendPush = (subscription: PushSubscriptionKeys, message: Record<string, unknown>) => Promise<PushSendResult>;

// Posts one notification to the subscription's push service.
export function pushSender(vapid: VapidKey, subject: string, fetcher: typeof fetch = fetch): SendPush {
  return async ({ endpoint, p256dh, auth }, message) => {
    let body: Buffer;
    try {
      body = encryptPush(Buffer.from(JSON.stringify(message)), p256dh, auth);
    } catch (error) {
      // The browser handed us keys that are not a P-256 point: nothing will ever arrive.
      return { ok: false, status: 410, error: `bad keys: ${(error as Error).message}` };
    }
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: 'POST',
        body: new Uint8Array(body),
        headers: {
          Authorization: vapidAuthorization(endpoint, vapid, subject),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(TTL_SECONDS),
          Urgency: 'normal',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, status: null, error: (error as Error).name };
    }
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status, error: null };
    return { ok: false, status: response.status, error: (await response.text()).slice(0, 200) };
  };
}
