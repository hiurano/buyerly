import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { MetaTokenError, MetaTokenKeyring, resolveAccountAccessToken, rotateStoredMetaTokens } from '../../src/meta/tokens.ts';

// Stored Meta tokens are shared by both servers while they run side by side
// (#611): a token either one encrypts must decrypt on the other, rotation
// must give tokens Python reads, and the failures must say the same.
// tokens_parity.py runs core/meta_tokens.py; Python runs in CI.

const REPO = join(import.meta.dirname, '../../..');
const PYTHON = process.env.PYTHON ?? 'python3';
const K1 = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
const K2 = 'b2xkLWtleS1mb3ItdGVzdHMtMzItYnl0ZXMtbG9uZyE=';
const K3 = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=';

interface Op { op: 'encrypt' | 'decrypt' | 'rotate'; key: string; token: string }
type Answer = { ok: string } | { fail: string };

function python(ops: Op[]): Answer[] | null {
  const run = spawnSync(PYTHON, [join(import.meta.dirname, 'tokens_parity.py')], {
    cwd: REPO,
    input: JSON.stringify(ops),
    env: { ...process.env, PYTHONPATH: REPO },
  });
  if (run.error || run.status !== 0) {
    if (process.env.CI) throw new Error(`tokens_parity.py failed: ${run.stderr?.toString() ?? run.error?.message}`);
    return null;
  }
  return JSON.parse(run.stdout.toString()) as Answer[];
}

function port({ op, key, token }: Op): Answer {
  try {
    const keyring = new MetaTokenKeyring(key);
    return { ok: op === 'encrypt' ? keyring.encrypt(token) : op === 'decrypt' ? keyring.decrypt(token) : keyring.rotate(token) };
  } catch (error) {
    if (!(error instanceof MetaTokenError)) throw error;
    return { fail: error.message };
  }
}

const timestampOf = (token: string): bigint => Buffer.from(token, 'base64url').readBigUInt64BE(1);

describe('Meta tokens at rest, shared with Python', () => {
  it('decrypt and rotate across the two servers', () => {
    const secret = 'EAAB-ünïcode-token';
    const tsToken = new MetaTokenKeyring(K1).encrypt(`  ${secret} `);
    const old = new MetaTokenKeyring(K1).encrypt('old-token', new Date('2026-01-01T00:00:00Z'));
    const fromPython = python([
      { op: 'encrypt', key: K1, token: secret },
      { op: 'decrypt', key: K1, token: tsToken },
      { op: 'decrypt', key: `${K2}, ${K1}`, token: tsToken },
      { op: 'rotate', key: `${K2},${K1}`, token: tsToken },
    ]);
    if (!fromPython) return;
    const [encrypted, decrypted, decryptedOlder, rotated] = fromPython as Array<{ ok: string }>;
    expect(decrypted).toEqual({ ok: secret });
    expect(decryptedOlder).toEqual({ ok: secret });
    expect(new MetaTokenKeyring(K1).decrypt(encrypted.ok)).toBe(secret);
    expect(new MetaTokenKeyring(K2).decrypt(rotated.ok)).toBe(secret);
    expect(timestampOf(rotated.ok)).toBe(timestampOf(tsToken));

    // The port's rotation keeps the token's time and Python reads it with the new key alone.
    const tsRotated = new MetaTokenKeyring(`${K2},${K1}`).rotate(old);
    expect(timestampOf(tsRotated)).toBe(timestampOf(old));
    expect(python([{ op: 'decrypt', key: K2, token: tsRotated }])).toEqual([{ ok: 'old-token' }]);
  });

  it('fail as Python does', () => {
    const k1Token = new MetaTokenKeyring(K1).encrypt('t');
    const ops: Op[] = [
      { op: 'encrypt', key: '', token: 't' },
      { op: 'encrypt', key: ' , ', token: 't' },
      { op: 'encrypt', key: 'short', token: 't' },
      { op: 'encrypt', key: `${K1},not-a-key`, token: 't' },
      { op: 'encrypt', key: 'Kkkk€', token: 't' },
      { op: 'encrypt', key: K1, token: '   ' },
      { op: 'decrypt', key: K3, token: k1Token },
      { op: 'decrypt', key: K1, token: 'garbage' },
      { op: 'decrypt', key: K1, token: '' },
      { op: 'decrypt', key: K1, token: 'gAAAAAé' },
      { op: 'decrypt', key: K1, token: `${k1Token.slice(0, -4)}AAA=` },
      { op: 'rotate', key: K1, token: ' ' },
      { op: 'rotate', key: K3, token: k1Token },
      { op: 'decrypt', key: `${K3},${K1}`, token: k1Token },
    ];
    const expected = python(ops);
    if (!expected) return;
    expect(ops.map(port)).toEqual(expected);
  });
});

// A transaction that answers the rotation's statements from an in-memory table.
function fakeTransaction(tables: Record<'meta_connections' | 'accounts', Map<number, string>>, replacedMeanwhile = new Set<number>()): EntityManager {
  const query = async (sql: string, parameters: unknown[] = []) => {
    const table = sql.includes('meta_connections') ? tables.meta_connections : tables.accounts;
    if (sql.trimStart().startsWith('SELECT')) {
      return { records: [...table].filter(([, token]) => token).map(([id, token]) => ({ id, token })) };
    }
    const [rotated, id, token] = parameters as [string, number, string];
    if (replacedMeanwhile.has(id) || table.get(id) !== token) return { records: [] };
    table.set(id, rotated);
    return { records: [{ id }] };
  };
  return {
    queryRunner: { query },
  } as unknown as EntityManager;
}

describe('rotating the stored tokens', () => {
  it('re-encrypts every token with the primary key and keeps one the other server replaced', async () => {
    const old = new MetaTokenKeyring(K1);
    const tables = {
      meta_connections: new Map([[1, old.encrypt('c1')], [2, old.encrypt('c2')], [3, '']]),
      accounts: new Map([[10, old.encrypt('a10')]]),
    };
    const replaced = tables.meta_connections.get(2)!;
    const stats = await rotateStoredMetaTokens(fakeTransaction(tables, new Set([2])), new MetaTokenKeyring(`${K2},${K1}`));
    expect(stats).toEqual({ connections_rotated: 1, accounts_rotated: 1 });
    const fresh = new MetaTokenKeyring(K2);
    expect(fresh.decrypt(tables.meta_connections.get(1)!)).toBe('c1');
    expect(fresh.decrypt(tables.accounts.get(10)!)).toBe('a10');
    expect(tables.meta_connections.get(2)).toBe(replaced);
  });

  it('stops on a token no key opens', async () => {
    const tables = { meta_connections: new Map([[1, new MetaTokenKeyring(K3).encrypt('x')]]), accounts: new Map<number, string>() };
    await expect(rotateStoredMetaTokens(fakeTransaction(tables), new MetaTokenKeyring(K1))).rejects.toThrow('Stored Meta access token cannot be rotated');
  });
});

describe('resolving an account token', () => {
  const keyring = new MetaTokenKeyring(K1);
  const connection = { status: 'active', workspaceId: 5, ownerUserId: 7, accessTokenEncrypted: keyring.encrypt('oauth-token') };
  const account = { metaConnectionId: null, workspaceId: 5, ownerUserId: 7, accessTokenEncrypted: null, accessToken: null };

  it('reads the connection, the manual token or the legacy one', async () => {
    const load = async () => connection;
    expect(await resolveAccountAccessToken({ ...account, metaConnectionId: 1 }, keyring, load)).toBe('oauth-token');
    expect(await resolveAccountAccessToken({ ...account, accessTokenEncrypted: keyring.encrypt('manual') }, keyring, load)).toBe('manual');
    expect(await resolveAccountAccessToken({ ...account, accessToken: keyring.encrypt('legacy-encrypted') }, keyring, load)).toBe('legacy-encrypted');
    expect(await resolveAccountAccessToken({ ...account, accessToken: 'gAAAAA-not-really' }, keyring, load)).toBe('gAAAAA-not-really');
    expect(await resolveAccountAccessToken({ ...account, accessToken: ' plain ' }, keyring, load)).toBe('plain');
  });

  it('refuses a connection that does not fit', async () => {
    const resolve = (overrides: object, found: object | null = connection) =>
      resolveAccountAccessToken({ ...account, metaConnectionId: 1, ...overrides }, keyring, async () => found as typeof connection | null);
    await expect(resolve({}, null)).rejects.toThrow('Meta connection was not found');
    await expect(resolve({}, { ...connection, status: 'needs_reconnect' })).rejects.toThrow('Meta connection requires reconnection');
    await expect(resolve({ workspaceId: 6 })).rejects.toThrow('Meta connection workspace mismatch');
    await expect(resolve({ workspaceId: null, ownerUserId: 8 })).rejects.toThrow('Meta connection ownership mismatch');
    await expect(resolveAccountAccessToken(account, keyring, async () => null)).rejects.toThrow('Meta authorization is missing');
  });
});
