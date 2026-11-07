import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authorization, main, parseListing, S3Client, signingKey, type Transport, uriEncode } from '../../src/scripts/offsite-sync.ts';

// Off-site backup copies (src/scripts/offsite-sync.ts, #611 stage 5). Ported
// from the OffsiteDownloadTests/OffsiteErrorTests of tests/test_backup_env.py;
// the shell side (what backup_db.sh and the restore scripts pass to
// scripts/offsite_sync.sh) stays there. The storage is a transport the test
// answers.

const ENV = { S3_ENDPOINT_URL: 'https://r2.example.test', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' };

interface Stored { body: Buffer; lastModified: string }

function listingXml(items: Array<[string, Stored]>, extra = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>b</Name>${extra}${items
    .map(([key, item]) => `<Contents><Key>${key.replace(/&/g, '&amp;')}</Key><LastModified>${item.lastModified}</LastModified><Size>${item.body.length}</Size></Contents>`)
    .join('')}</ListBucketResult>`;
}

/** A bucket in memory: PUT, GET, DELETE and ListObjectsV2 (prefix only). */
function fakeBucket(objects: Record<string, Stored>) {
  const calls: Array<{ method: string; url: string; headers: Record<string, string> }> = [];
  const transport: Transport = async (url, init) => {
    calls.push({ method: init.method, url, headers: init.headers });
    const parsed = new URL(url);
    const key = decodeURIComponent(parsed.pathname.replace(/^\/b\/?/, ''));
    if (init.method === 'GET' && !key) {
      const prefix = parsed.searchParams.get('prefix') ?? '';
      const items = Object.entries(objects).filter(([k]) => k.startsWith(prefix));
      return { status: 200, body: Buffer.from(listingXml(items)) };
    }
    if (init.method === 'GET') return objects[key] ? { status: 200, body: objects[key].body } : { status: 404, body: Buffer.from('<Error><Code>NoSuchKey</Code></Error>') };
    if (init.method === 'PUT') {
      objects[key] = { body: init.body!, lastModified: '2026-11-07T03:00:00.000Z' };
      return { status: 200, body: Buffer.alloc(0) };
    }
    if (init.method === 'DELETE') {
      delete objects[key];
      return { status: 204, body: Buffer.alloc(0) };
    }
    return { status: 405, body: Buffer.alloc(0) };
  };
  return { transport, calls, objects };
}

let tmp: string;
let out: string[];
let err: string[];
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'offsite-'));
  out = [];
  err = [];
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const run = (transport: Transport, ...args: string[]) =>
  main(args, { env: ENV, transport, out: (l) => out.push(l), err: (l) => err.push(l), now: () => new Date('2026-11-07T12:00:00Z') });

describe('AWS Signature Version 4', () => {
  // The worked example of the AWS docs ("Examples of the complete Signature
  // Version 4 signing process", GET object with a Range header).
  it('signs the AWS example request as AWS does', () => {
    const header = authorization({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      canonicalUri: '/test.txt',
      query: {},
      headers: {
        host: 'examplebucket.s3.amazonaws.com',
        range: 'bytes=0-9',
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'x-amz-date': '20130524T000000Z',
      },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      amzDate: '20130524T000000Z',
    });
    expect(header).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
      + 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, '
      + 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('signs the AWS example listing with its query string', () => {
    const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const header = authorization({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      canonicalUri: '/',
      query: { 'max-keys': '2', prefix: 'J' },
      headers: { host: 'examplebucket.s3.amazonaws.com', 'x-amz-content-sha256': empty, 'x-amz-date': '20130524T000000Z' },
      payloadHash: empty,
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      amzDate: '20130524T000000Z',
    });
    expect(header).toContain('Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  });

  it('derives the signing key of the AWS docs', () => {
    expect(signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', 'us-east-1', 'iam').toString('hex'))
      .toBe('f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
  });

  it('encodes what SigV4 wants encoded', () => {
    expect(uriEncode("a b+c!*'()~", false)).toBe('a%20b%2Bc%21%2A%27%28%29~');
    expect(uriEncode('dir/file name', true)).toBe('dir/file%20name');
  });
});

describe('the listing', () => {
  it('reads keys with entities and the continuation token', () => {
    const page = parseListing(listingXml([['a&b', { body: Buffer.from('xy'), lastModified: 'T' }]], '<IsTruncated>true</IsTruncated><NextContinuationToken>tok</NextContinuationToken>'));
    expect(page).toEqual({ objects: [{ key: 'a&b', lastModified: 'T', size: 2 }], next: 'tok' });
  });

  it('follows continuation pages', async () => {
    const pages = [
      listingXml([['k1', { body: Buffer.from('1'), lastModified: '2026-01-01T00:00:00Z' }]], '<IsTruncated>true</IsTruncated><NextContinuationToken>p2</NextContinuationToken>'),
      listingXml([['k2', { body: Buffer.from('2'), lastModified: '2026-01-02T00:00:00Z' }]]),
    ];
    const urls: string[] = [];
    const client = new S3Client({ ...{ endpointUrl: 'https://r2.example.test', bucket: 'b', accessKey: 'a', secretKey: 's' }, transport: async (url) => {
      urls.push(url);
      return { status: 200, body: Buffer.from(pages.shift()!) };
    } });
    expect((await client.listObjects()).map((o) => o.key)).toEqual(['k2', 'k1']);
    expect(urls[1]).toContain('continuation-token=p2');
  });
});

describe('--download-latest', () => {
  const objects = (): Record<string, Stored> => ({
    'buyerly_postgres_20260930_030000.sql.gz': { body: Buffer.from('\x1f\x8bnewest', 'latin1'), lastModified: '2026-09-30T00:00:00Z' },
    'buyerly_postgres_20260929_030000.sql.gz.enc': { body: Buffer.from('Salted__older'), lastModified: '2026-09-29T00:00:00Z' },
    'buyerly_postgres_notes.txt': { body: Buffer.from('not a backup'), lastModified: '2026-10-01T00:00:00Z' },
    'buyerly_uploads_20260929_030000.tar.gz.enc': { body: Buffer.from('Salted__uploads'), lastModified: '2026-10-02T00:00:00Z' },
  });

  it('keeps the newest backup under its own name with --dest-dir', async () => {
    expect(await run(fakeBucket(objects()).transport, '--download-latest', '--dest-dir', tmp)).toBe(0);
    expect(readdirSync(tmp)).toEqual(['buyerly_postgres_20260930_030000.sql.gz']);
    expect(readFileSync(path.join(tmp, 'buyerly_postgres_20260930_030000.sql.gz'), 'latin1')).toBe('\x1f\x8bnewest');
  });

  it('downloads the newest uploads archive with --kind uploads', async () => {
    expect(await run(fakeBucket(objects()).transport, '--kind', 'uploads', '--download-latest', '--dest-dir', tmp)).toBe(0);
    expect(readdirSync(tmp)).toEqual(['buyerly_uploads_20260929_030000.tar.gz.enc']);
  });

  it('refuses a --dest with another format suffix', async () => {
    const dest = path.join(tmp, 'latest_offsite_restore.sql.gz.enc');
    expect(await run(fakeBucket(objects()).transport, '--download-latest', '--dest', dest)).toBe(1);
    expect(err.join('\n')).toContain('is .sql.gz');
    expect(readdirSync(tmp)).toEqual([]);
  });
});

describe('storage errors', () => {
  const denied: Transport = async () => ({ status: 403, body: Buffer.from('<Error><Code>AccessDenied</Code></Error>') });

  it('fail a listing with the HTTP status, never as "no backups"', async () => {
    for (const args of [['--download-latest', '--dest-dir', tmp], ['--list']]) {
      err = [];
      expect(await run(denied, ...args)).toBe(1);
      expect(err.join('\n')).toContain('HTTP 403');
      expect(err.join('\n')).not.toContain('No remote backups found');
    }
  });

  it('only skip pruning', async () => {
    const client = new S3Client({ endpointUrl: 'https://r2.example.test', bucket: 'b', accessKey: 'a', secretKey: 's', transport: denied, err: (l) => err.push(l) });
    expect(await client.pruneOldBackups()).toBe(0);
    expect(err.join('\n')).toContain('Skipping prune');
  });

  it('report an unreachable storage as an error', async () => {
    const down: Transport = async () => { throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }); };
    expect(await run(down, '--list')).toBe(1);
    expect(err.join('\n')).toContain('[ERROR] fetch failed: connect ECONNREFUSED');
  });
});

describe('upload, prune and list', () => {
  const day = (n: number): Stored => ({ body: Buffer.from(`d${n}`), lastModified: new Date(Date.parse('2026-11-07T12:00:00Z') - n * 86_400_000).toISOString() });

  it('uploads, then prunes backups past retention while keeping the newest ones', async () => {
    const stored: Record<string, Stored> = { 'buyerly_uploads_20200101_000000.tar.gz': day(400) };
    for (let n = 1; n <= 10; n += 1) stored[`buyerly_postgres_202611${String(n).padStart(2, '0')}_030000.sql.gz`] = day(n * 10);
    const bucket = fakeBucket(stored);
    const file = path.join(tmp, 'buyerly_postgres_20261107_030000.sql.gz.enc');
    writeFileSync(file, 'Salted__new');

    expect(await run(bucket.transport, '--upload', file, '--prune', '--retention-days', '45', '--min-keep', '3')).toBe(0);

    const put = bucket.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('https://r2.example.test/b/buyerly_postgres_20261107_030000.sql.gz.enc');
    expect(put.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=a\/20261107\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(bucket.objects['buyerly_postgres_20261107_030000.sql.gz.enc'].body.toString()).toBe('Salted__new');
    // 11 postgres copies: the newest 3 stay whatever their age; of the rest,
    // those older than 45 days (50..100) go. The uploads archive is another kind.
    expect(Object.keys(bucket.objects).sort()).toEqual([
      'buyerly_postgres_20261101_030000.sql.gz',
      'buyerly_postgres_20261102_030000.sql.gz',
      'buyerly_postgres_20261103_030000.sql.gz',
      'buyerly_postgres_20261104_030000.sql.gz',
      'buyerly_postgres_20261107_030000.sql.gz.enc',
      'buyerly_uploads_20200101_000000.tar.gz',
    ]);
    expect(out).toContain('[INFO] Pruning complete: deleted 6 expired backup(s).');
  });

  it('keeps everything at or below the safety threshold', async () => {
    const bucket = fakeBucket({ buyerly_postgres_20200101_000000: day(900) });
    expect(await run(bucket.transport, '--prune')).toBe(0);
    expect(Object.keys(bucket.objects)).toHaveLength(1);
  });

  it('lists in the format deploy.sh greps', async () => {
    const bucket = fakeBucket({ 'buyerly_postgres_20261106_030000.sql.gz.enc': { body: Buffer.alloc(1024 * 1024), lastModified: '2026-11-06T03:00:00.000Z' } });
    expect(await run(bucket.transport, '--list')).toBe(0);
    expect(out).toEqual([
      '=== Remote Backups in s3://b (1 items) ===',
      '  buyerly_postgres_20261106_030000.sql.gz.enc       1.00 MB   2026-11-06T03:00:00.000Z',
    ]);
  });

  it('skips quietly when S3 is not configured', async () => {
    expect(await main(['--list'], { env: {}, out: (l) => out.push(l) })).toBe(0);
    expect(out[0]).toContain('Skipping off-site synchronization');
  });
});
