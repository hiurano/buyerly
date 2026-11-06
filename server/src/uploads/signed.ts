import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed upload links (decision 55: `fileUpload` hands one out, the browser
// PUTs the file's bytes to it, as Linear's uploads go to signed storage URLs).
// The token is the grant itself: who uploads, for what, and until when,
// signed with the OTP pepper both servers share (api/client_api, services/
// signed_uploads.py signs and checks the same way), so either server may
// take the bytes.

export type UploadPurpose = 'avatar' | 'workspace_logo';
export const UPLOAD_PURPOSES: UploadPurpose[] = ['avatar', 'workspace_logo'];
export const SIGNED_UPLOAD_PREFIX = '/uploads/signed/';
const LIFETIME_SECONDS = 10 * 60;

export interface UploadGrant {
  // The user it was given to, what for, the file's name and type, and when it ends (Unix seconds).
  u: number;
  p: UploadPurpose;
  n: string;
  t: string;
  e: number;
}

function signature(pepper: string, payload: string): string {
  return createHmac('sha256', pepper).update(`file-upload:${payload}`).digest('hex');
}

export function signUpload(pepper: string, grant: Omit<UploadGrant, 'e'>, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...grant, e: Math.floor(now / 1000) + LIFETIME_SECONDS })).toString('base64url');
  return `${payload}.${signature(pepper, payload)}`;
}

// The grant a token carries, or null when it is forged, malformed or over.
export function verifyUpload(pepper: string, token: string, now = Date.now()): UploadGrant | null {
  const [payload = '', signed = '', ...rest] = token.split('.');
  if (!payload || rest.length) return null;
  const expected = Buffer.from(signature(pepper, payload));
  const given = Buffer.from(signed);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let grant: UploadGrant;
  try {
    grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadGrant;
  } catch {
    return null;
  }
  if (!Number.isInteger(grant.u) || !UPLOAD_PURPOSES.includes(grant.p) || typeof grant.e !== 'number') return null;
  if (grant.e * 1000 < now) return null;
  return grant;
}
