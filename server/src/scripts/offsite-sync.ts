import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Off-site backup copies in S3-compatible storage (Cloudflare R2, AWS S3,
// Backblaze B2, MinIO), signed with AWS Signature Version 4 by hand so the
// script needs nothing but Node (#611 stage 5; port of scripts/offsite_sync.py
// with the same flags, output and exit codes). scripts/offsite_sync.sh runs it
// for backup_db.sh inside the image and for the host's restore and deploy
// scripts.

// Names backup_db.sh publishes, per kind: the database dump and the uploads
// archive. The suffix is the archive format the restore scripts decode by, so
// a download keeps it instead of renaming the file.
export const BACKUP_KINDS = {
  postgres: { prefix: 'buyerly_postgres_', pattern: /^buyerly_postgres_\d{8}_\d{6}(\.sql\.gz(\.enc)?)$/ },
  uploads: { prefix: 'buyerly_uploads_', pattern: /^buyerly_uploads_\d{8}_\d{6}(\.tar\.gz(\.enc)?)$/ },
} as const;
export type BackupKind = keyof typeof BACKUP_KINDS;

/** The storage answered with an error, as opposed to an empty result. */
export class S3Error extends Error {}

export interface RemoteObject {
  key: string;
  lastModified: string;
  size: number;
}

export interface S3Response {
  status: number;
  body: Buffer;
}

export type Transport = (url: string, init: { method: string; headers: Record<string, string>; body?: Buffer }) => Promise<S3Response>;

const fetchTransport: Transport = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body ? new Uint8Array(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
};

const sha256Hex = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, message: string): Buffer => createHmac('sha256', key).update(message, 'utf8').digest();

/** RFC 3986 encoding as SigV4 wants it: everything but unreserved characters (and `/` in paths). */
export function uriEncode(value: string, keepSlash = false): string {
  return Array.from(Buffer.from(value, 'utf8'))
    .map((byte) => {
      const char = String.fromCharCode(byte);
      if (/[A-Za-z0-9\-._~]/.test(char) || (keepSlash && char === '/')) return char;
      return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

export function signingKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service), 'aws4_request');
}

export interface SignInput {
  method: string;
  host: string;
  canonicalUri: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
  accessKey: string;
  secretKey: string;
  region: string;
  amzDate: string;
  service?: string;
}

/** The Authorization header for one request (AWS Signature Version 4). */
export function authorization(input: SignInput): string {
  const service = input.service ?? 's3';
  const dateStamp = input.amzDate.slice(0, 8);
  const canonicalQuery = Object.entries(input.query)
    .map(([k, v]) => [uriEncode(k), uriEncode(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const headers = Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  const names = Object.keys(headers).sort();
  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    canonicalQuery,
    names.map((name) => `${name}:${headers[name]}\n`).join(''),
    names.join(';'),
    input.payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(input.secretKey, dateStamp, input.region, service)).update(stringToSign, 'utf8').digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const xmlText = (value: string): string =>
  value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity: string) =>
    entity.startsWith('#x') ? String.fromCodePoint(parseInt(entity.slice(2), 16))
      : entity.startsWith('#') ? String.fromCodePoint(parseInt(entity.slice(1), 10))
        : XML_ENTITIES[entity]);
const tag = (xml: string, name: string): string | undefined => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? xmlText(match[1]) : undefined;
};

/** Objects and the continuation token of one ListObjectsV2 page. */
export function parseListing(xml: string): { objects: RemoteObject[]; next?: string } {
  if (!/<ListBucketResult[\s>]/.test(xml)) throw new S3Error('Failed to parse S3 XML response: no ListBucketResult');
  const objects: RemoteObject[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = tag(match[1], 'Key');
    if (!key) continue;
    objects.push({ key, lastModified: tag(match[1], 'LastModified') ?? '', size: Number(tag(match[1], 'Size') ?? '0') || 0 });
  }
  const truncated = tag(xml, 'IsTruncated') === 'true';
  return { objects, next: truncated ? tag(xml, 'NextContinuationToken') : undefined };
}

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2);

export interface S3ClientOptions {
  endpointUrl: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  transport?: Transport;
  now?: () => Date;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

export class S3Client {
  readonly bucket: string;
  private readonly origin: string;
  private readonly host: string;
  private readonly region: string;
  private readonly transport: Transport;
  private readonly now: () => Date;
  private readonly out: (line: string) => void;
  private readonly err: (line: string) => void;

  constructor(private readonly options: S3ClientOptions) {
    const url = new URL(options.endpointUrl.replace(/\/+$/, ''));
    this.origin = `${url.protocol}//${url.host}`;
    this.host = url.host;
    this.bucket = options.bucket.replace(/^\/+|\/+$/g, '');
    this.region = options.region || 'auto';
    this.transport = options.transport ?? fetchTransport;
    this.now = options.now ?? (() => new Date());
    this.out = options.out ?? ((line) => console.log(line));
    this.err = options.err ?? ((line) => console.error(line));
  }

  async request(method: string, key = '', query: Record<string, string> = {}, body?: Buffer, extra: Record<string, string> = {}): Promise<S3Response> {
    const amzDate = this.now().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
    const canonicalUri = `/${this.bucket}${key ? `/${uriEncode(key.replace(/^\/+/, ''), true)}` : ''}`;
    const headers: Record<string, string> = { host: this.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
    for (const [k, v] of Object.entries(extra)) headers[k.toLowerCase()] = v;
    const auth = authorization({
      method, host: this.host, canonicalUri, query, headers, payloadHash,
      accessKey: this.options.accessKey, secretKey: this.options.secretKey, region: this.region, amzDate,
    });
    const search = Object.entries(query).map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');
    const { host: _host, ...sent } = headers; // fetch sends Host from the URL itself
    return this.transport(`${this.origin}${canonicalUri}${search ? `?${search}` : ''}`, {
      method,
      headers: { ...sent, Authorization: auth, 'User-Agent': 'Buyerly-Backup-Sync/1.0' },
      body: method === 'PUT' || method === 'POST' ? body : undefined,
    });
  }

  async uploadFile(localPath: string, remoteKey?: string): Promise<boolean> {
    let content: Buffer;
    try {
      if (!statSync(localPath).isFile()) throw new Error('not a file');
      content = readFileSync(localPath);
    } catch {
      this.err(`[ERROR] Local backup file not found: ${localPath}`);
      return false;
    }
    const key = remoteKey ?? path.basename(localPath);
    this.out(`[INFO] Uploading ${path.basename(localPath)} (${mb(content.length)} MB) to s3://${this.bucket}/${key}...`);
    const response = await this.request('PUT', key, {}, content, { 'content-type': 'application/octet-stream' });
    if ([200, 201, 204].includes(response.status)) {
      this.out(`[SUCCESS] Successfully uploaded to s3://${this.bucket}/${key}`);
      return true;
    }
    this.err(`[ERROR] S3 upload failed with HTTP ${response.status}: ${response.body.toString('utf8')}`);
    return false;
  }

  async downloadFile(remoteKey: string, destination: string): Promise<boolean> {
    this.out(`[INFO] Downloading s3://${this.bucket}/${remoteKey} to ${destination}...`);
    const response = await this.request('GET', remoteKey);
    if (response.status !== 200) {
      this.err(`[ERROR] S3 download failed with HTTP ${response.status}: ${response.body.toString('utf8')}`);
      return false;
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    // Written under a temporary name first, so an interrupted write never
    // leaves a partial file under the real backup name.
    const partial = path.join(path.dirname(destination), `.partial_${path.basename(destination)}`);
    writeFileSync(partial, response.body);
    renameSync(partial, destination);
    this.out(`[SUCCESS] Downloaded s3://${this.bucket}/${remoteKey} (${mb(response.body.length)} MB)`);
    return true;
  }

  /** Every object under the prefix, newest first. */
  async listObjects(prefix = ''): Promise<RemoteObject[]> {
    const objects: RemoteObject[] = [];
    let token: string | undefined;
    do {
      const query: Record<string, string> = { 'list-type': '2' };
      if (prefix) query.prefix = prefix;
      if (token) query['continuation-token'] = token;
      const response = await this.request('GET', '', query);
      if (response.status !== 200) {
        // An empty list here would read as "no backups" when the real cause
        // is a wrong key, a missing bucket or an outage.
        throw new S3Error(`S3 list failed with HTTP ${response.status}: ${response.body.toString('utf8')}`);
      }
      const page = parseListing(response.body.toString('utf8'));
      objects.push(...page.objects);
      token = page.next;
    } while (token);
    const order = (item: RemoteObject): string => item.lastModified || item.key;
    return objects.sort((a, b) => (order(a) < order(b) ? 1 : order(a) > order(b) ? -1 : 0));
  }

  async deleteObject(remoteKey: string): Promise<boolean> {
    this.out(`[INFO] Deleting remote object s3://${this.bucket}/${remoteKey}...`);
    const response = await this.request('DELETE', remoteKey);
    if (response.status === 200 || response.status === 204) {
      this.out(`[SUCCESS] Deleted s3://${this.bucket}/${remoteKey}`);
      return true;
    }
    this.err(`[ERROR] S3 delete failed with HTTP ${response.status}: ${response.body.toString('utf8')}`);
    return false;
  }

  /** Deletes backups of one kind older than retentionDays, keeping the newest minKeep of them. */
  async pruneOldBackups(retentionDays = 60, minKeep = 7, kind: BackupKind = 'postgres'): Promise<number> {
    let objects: RemoteObject[];
    try {
      objects = await this.listObjects(BACKUP_KINDS[kind].prefix);
    } catch (error) {
      if (!(error instanceof S3Error)) throw error;
      this.err(`[WARNING] Skipping prune: ${error.message}`);
      return 0;
    }
    if (objects.length === 0) {
      this.out('[INFO] No remote backups found to prune.');
      return 0;
    }
    if (objects.length <= minKeep) {
      this.out(`[INFO] Total remote backups (${objects.length}) <= safety threshold (${minKeep}). Skipping prune.`);
      return 0;
    }
    const now = this.now().getTime();
    let deleted = 0;
    for (const item of objects.slice(minKeep)) {
      if (!item.lastModified) continue;
      const modified = Date.parse(item.lastModified);
      if (Number.isNaN(modified)) {
        this.err(`[WARNING] Could not parse date for ${item.key}: ${item.lastModified}`);
        continue;
      }
      const ageDays = (now - modified) / 86_400_000;
      if (ageDays > retentionDays) {
        this.out(`[INFO] Backup ${item.key} is ${ageDays.toFixed(1)} days old (retention: ${retentionDays}d). Pruning...`);
        if (await this.deleteObject(item.key)) deleted += 1;
      }
    }
    this.out(`[INFO] Pruning complete: deleted ${deleted} expired backup(s).`);
    return deleted;
  }
}

const USAGE = `usage: offsite-sync [--upload FILE] [--download KEY --dest PATH] [--download-latest [--dest PATH | --dest-dir DIR]]
                    [--list] [--prune] [--retention-days N] [--min-keep N] [--kind {postgres,uploads}]

Buyerly Off-site S3 Backup Synchronizer. S3_ENDPOINT_URL, S3_BUCKET, S3_ACCESS_KEY_ID,
S3_SECRET_ACCESS_KEY and S3_REGION (default auto) come from the environment.`;

export interface MainOptions {
  env?: NodeJS.ProcessEnv;
  transport?: Transport;
  now?: () => Date;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => console.log(line));
  const err = options.err ?? ((line: string) => console.error(line));
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        upload: { type: 'string' },
        download: { type: 'string' },
        'download-latest': { type: 'boolean' },
        dest: { type: 'string' },
        'dest-dir': { type: 'string' },
        list: { type: 'boolean' },
        prune: { type: 'boolean' },
        'retention-days': { type: 'string', default: '60' },
        'min-keep': { type: 'string', default: '7' },
        kind: { type: 'string', default: 'postgres' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    err(`${USAGE}\n[ERROR] ${(error as Error).message}`);
    return 2;
  }
  const retentionDays = Number(values['retention-days']);
  const minKeep = Number(values['min-keep']);
  if (!(values.kind in BACKUP_KINDS) || !Number.isInteger(retentionDays) || !Number.isInteger(minKeep)) {
    err(`${USAGE}\n[ERROR] --kind is postgres or uploads; --retention-days and --min-keep are whole numbers`);
    return 2;
  }
  if (values.help) {
    out(USAGE);
    return 0;
  }
  const kind = values.kind as BackupKind;

  const env = options.env ?? process.env;
  const setting = (name: string): string => (env[name] ?? '').trim();
  const [endpointUrl, bucket, accessKey, secretKey] = ['S3_ENDPOINT_URL', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].map(setting);
  if (!(endpointUrl && bucket && accessKey && secretKey)) {
    out('[WARNING] S3 credentials not fully configured (S3_ENDPOINT_URL, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). Skipping off-site synchronization.');
    return 0;
  }
  const client = new S3Client({
    endpointUrl, bucket, accessKey, secretKey, region: setting('S3_REGION') || 'auto',
    transport: options.transport, now: options.now, out, err,
  });

  try {
    if (values.upload) {
      const uploaded = await client.uploadFile(values.upload);
      if (uploaded && values.prune) await client.pruneOldBackups(retentionDays, minKeep, kind);
      return uploaded ? 0 : 1;
    }
    if (values.list) {
      const items = await client.listObjects();
      out(`=== Remote Backups in s3://${client.bucket} (${items.length} items) ===`);
      for (const item of items) out(`  ${item.key.padEnd(45)} ${mb(item.size).padStart(8)} MB   ${item.lastModified}`);
      return 0;
    }
    if (values['download-latest']) {
      const { prefix, pattern } = BACKUP_KINDS[kind];
      const items = (await client.listObjects(prefix)).filter((item) => pattern.test(item.key));
      if (items.length === 0) {
        err('[ERROR] No remote backups found to download.');
        return 1;
      }
      const latest = items[0].key;
      let dest: string;
      if (values['dest-dir']) {
        dest = path.join(values['dest-dir'], latest);
      } else {
        dest = values.dest ?? latest;
        // The suffix is the format: saving an .enc object as .sql.gz (or the
        // reverse) sends restore down the wrong decode path.
        const remoteFormat = pattern.exec(latest)![1];
        if (!path.basename(dest).endsWith(remoteFormat)) {
          err(`[ERROR] Latest backup ${latest} is ${remoteFormat}; --dest ${dest} has a different suffix. Use --dest-dir to keep the remote name.`);
          return 1;
        }
      }
      return (await client.downloadFile(latest, dest)) ? 0 : 1;
    }
    if (values.download) {
      if (!values.dest) {
        err('[ERROR] --dest is required when using --download.');
        return 1;
      }
      return (await client.downloadFile(values.download, values.dest)) ? 0 : 1;
    }
    if (values.prune) {
      await client.pruneOldBackups(retentionDays, minKeep, kind);
      return 0;
    }
  } catch (error) {
    // Storage errors, refused connections and timeouts: never "no backups".
    const cause = (error as { cause?: { message?: string } }).cause?.message;
    err(`[ERROR] ${(error as Error).message}${cause ? `: ${cause}` : ''}`);
    return 1;
  }
  out(USAGE);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
