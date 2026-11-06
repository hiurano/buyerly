import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';

// Meta access tokens at rest, as core/meta_tokens.py keeps them: Fernet
// (cryptography's MultiFernet) under META_TOKEN_ENCRYPTION_KEY, a primary
// URL-safe base64 key followed by optional decrypt-only keys, so a key is
// rotated by prepending a new one and re-encrypting (rotateStoredMetaTokens).
// Both servers read and write the same rows; server/test/meta/tokens.test.ts
// proves each decrypts the other's tokens (#611, stage 4).

// A missing or unusable Meta authorization, safe to show (MetaTokenError).
export class MetaTokenError extends Error {
  override name = 'MetaTokenError';
}

const VERSION = 0x80;

// str.encode("ascii") succeeds.
const isAscii = (text: string): boolean => [...text].every((char) => char.charCodeAt(0) < 0x80);

interface FernetKey {
  signing: Buffer;
  encryption: Buffer;
}

// base64.urlsafe_b64decode: "-_" or "+/", padding required, characters
// outside the alphabet skipped (binascii's non-strict decoding).
function urlsafeDecode(text: string): Buffer | null {
  const cleaned = text.replace(/[^A-Za-z0-9+/\-_=]/g, '');
  const body = cleaned.replace(/=+$/, '');
  if (cleaned.length % 4 !== 0 || body.includes('=') || body.length % 4 === 1) return null;
  return Buffer.from(body.replace(/\+/g, '-').replace(/\//g, '_'), 'base64url');
}

// base64.urlsafe_b64encode, padded.
const urlsafeEncode = (bytes: Buffer): string => bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

export class MetaTokenKeyring {
  private readonly keys: FernetKey[];

  // The setting as it is: "primary[,older,…]".
  constructor(setting: string) {
    const raw = setting.trim();
    if (!raw) throw new MetaTokenError('META_TOKEN_ENCRYPTION_KEY is not configured');
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) throw new MetaTokenError('META_TOKEN_ENCRYPTION_KEY is invalid');
    this.keys = parts.map((part) => {
      // Fernet(key) refuses anything but 32 bytes of URL-safe base64 (and non-ASCII, at .encode("ascii")).
      const bytes = isAscii(part) ? urlsafeDecode(part) : null;
      if (!bytes || bytes.length !== 32) throw new MetaTokenError('META_TOKEN_ENCRYPTION_KEY is invalid');
      return { signing: bytes.subarray(0, 16), encryption: bytes.subarray(16) };
    });
  }

  private static seal(key: FernetKey, plaintext: Buffer, timestamp: bigint, iv: Buffer): string {
    const cipher = createCipheriv('aes-128-cbc', key.encryption, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const header = Buffer.alloc(9);
    header[0] = VERSION;
    header.writeBigUInt64BE(timestamp, 1);
    const body = Buffer.concat([header, iv, ciphertext]);
    const mac = createHmac('sha256', key.signing).update(body).digest();
    return urlsafeEncode(Buffer.concat([body, mac]));
  }

  // The token's bytes and timestamp, unverified; null when it is no Fernet token.
  private static parse(token: string): { data: Buffer; timestamp: bigint } | null {
    if (!isAscii(token)) return null;
    const data = urlsafeDecode(token);
    if (!data || data.length < 9 || data[0] !== VERSION) return null;
    return { data, timestamp: data.readBigUInt64BE(1) };
  }

  private static open(key: FernetKey, data: Buffer): Buffer | null {
    if (data.length < 9 + 16 + 32) return null;
    const body = data.subarray(0, data.length - 32);
    const mac = createHmac('sha256', key.signing).update(body).digest();
    if (!timingSafeEqual(mac, data.subarray(data.length - 32))) return null;
    const ciphertext = body.subarray(25);
    if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) return null;
    try {
      const decipher = createDecipheriv('aes-128-cbc', key.encryption, body.subarray(9, 25));
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      return null;
    }
  }

  private decryptBytes(token: string): { plaintext: Buffer; timestamp: bigint } | null {
    const parsed = MetaTokenKeyring.parse(token);
    if (!parsed) return null;
    for (const key of this.keys) {
      const plaintext = MetaTokenKeyring.open(key, parsed.data);
      if (plaintext) return { plaintext, timestamp: parsed.timestamp };
    }
    return null;
  }

  // encrypt_meta_token
  encrypt(accessToken: string, now: Date = new Date()): string {
    const token = String(accessToken ?? '').trim();
    if (!token) throw new MetaTokenError('Meta access token is empty');
    return MetaTokenKeyring.seal(this.keys[0], Buffer.from(token, 'utf8'), BigInt(Math.floor(now.getTime() / 1000)), randomBytes(16));
  }

  // decrypt_meta_token
  decrypt(encryptedToken: string): string {
    const opened = this.decryptBytes(String(encryptedToken));
    const text = opened ? new TextDecoder('utf-8', { fatal: true }) : null;
    try {
      if (opened && text) return text.decode(opened.plaintext);
    } catch {
      // not UTF-8: UnicodeError in Python
    }
    throw new MetaTokenError('Stored Meta access token cannot be decrypted');
  }

  // rotate_meta_token: re-encrypted under the primary key, keeping the
  // token's own timestamp as MultiFernet.rotate does.
  rotate(encryptedToken: string): string {
    const token = String(encryptedToken ?? '').trim();
    if (!token) throw new MetaTokenError('Encrypted Meta token is empty');
    const opened = this.decryptBytes(token);
    if (!opened) throw new MetaTokenError('Stored Meta access token cannot be rotated');
    return MetaTokenKeyring.seal(this.keys[0], opened.plaintext, opened.timestamp, randomBytes(16));
  }
}

export interface RotationStats {
  connections_rotated: number;
  accounts_rotated: number;
}

// rotate_stored_meta_tokens: every stored token (OAuth connections and
// manual imports) re-encrypted with the primary key, in one transaction. A
// token that cannot be decrypted fails the whole run, as in Python. Each
// row is written only if its token is still the one read, so a token the
// other server replaced meanwhile is kept.
export async function rotateStoredMetaTokens(tx: EntityManager, keyring: MetaTokenKeyring): Promise<RotationStats> {
  const stats: RotationStats = { connections_rotated: 0, accounts_rotated: 0 };
  const connections = await rows<{ id: number; token: string }>(
    tx,
    `SELECT id, access_token_encrypted AS token FROM meta_connections
     WHERE access_token_encrypted IS NOT NULL AND access_token_encrypted != '' ORDER BY id`,
  );
  for (const { id, token } of connections) {
    const rotated = keyring.rotate(token);
    if (rotated === token) continue;
    const updated = await rows(
      tx,
      `UPDATE meta_connections SET access_token_encrypted = $1, updated_at = now()
       WHERE id = $2 AND access_token_encrypted = $3 RETURNING id`,
      [rotated, id, token],
    );
    stats.connections_rotated += updated.length;
  }
  const accounts = await rows<{ id: number; token: string }>(
    tx,
    `SELECT id, access_token_encrypted AS token FROM accounts
     WHERE access_token_encrypted IS NOT NULL AND access_token_encrypted != '' ORDER BY id`,
  );
  for (const { id, token } of accounts) {
    const rotated = keyring.rotate(token);
    if (rotated === token) continue;
    const updated = await rows(
      tx,
      `UPDATE accounts SET access_token_encrypted = $1 WHERE id = $2 AND access_token_encrypted = $3 RETURNING id`,
      [rotated, id, token],
    );
    stats.accounts_rotated += updated.length;
  }
  return stats;
}

export interface TokenAccount {
  metaConnectionId: number | null;
  workspaceId: number | null;
  ownerUserId: number | null;
  accessTokenEncrypted: string | null;
  // The deprecated plaintext column, read for rows not migrated yet.
  accessToken: string | null;
}

export interface TokenConnection {
  status: string;
  workspaceId: number | null;
  ownerUserId: number | null;
  accessTokenEncrypted: string;
}

// resolve_account_access_token: the account's OAuth connection token, its
// encrypted manual token, or the legacy plaintext one.
export async function resolveAccountAccessToken(
  account: TokenAccount,
  keyring: MetaTokenKeyring,
  loadConnection: (id: number) => Promise<TokenConnection | null>,
): Promise<string> {
  if (account.metaConnectionId) {
    const connection = await loadConnection(account.metaConnectionId);
    if (!connection) throw new MetaTokenError('Meta connection was not found');
    if (connection.status !== 'active') throw new MetaTokenError('Meta connection requires reconnection');
    if (account.workspaceId !== null && connection.workspaceId !== null && connection.workspaceId !== account.workspaceId) {
      throw new MetaTokenError('Meta connection workspace mismatch');
    }
    if (account.workspaceId === null && account.ownerUserId !== null && connection.ownerUserId !== account.ownerUserId) {
      throw new MetaTokenError('Meta connection ownership mismatch');
    }
    return keyring.decrypt(connection.accessTokenEncrypted);
  }
  const encrypted = (account.accessTokenEncrypted ?? '').trim();
  if (encrypted) return keyring.decrypt(encrypted);
  // Rows the production migration has not reached; new writes never fill it.
  const legacy = (account.accessToken ?? '').trim();
  if (legacy) {
    if (legacy.startsWith('gAAAAA')) {
      try {
        return keyring.decrypt(legacy);
      } catch (error) {
        if (!(error instanceof MetaTokenError)) throw error;
      }
    }
    return legacy;
  }
  throw new MetaTokenError('Meta authorization is missing');
}
