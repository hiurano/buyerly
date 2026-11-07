import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const SHA = 'a'.repeat(40);
const SCRIPT = path.resolve('src/scripts/post-deploy-smoke.ts');

// The smoke talks to the API over HTTP and to Docker over its unix socket
// (inspect, exec). Both are faked here; the checks, the result file and the
// stdout line are those of the Python script it replaced.
const servers: http.Server[] = [];
afterEach(() => { for (const s of servers.splice(0)) s.close(); });

function listen(server: http.Server, target: number | string): Promise<void> {
  servers.push(server);
  return new Promise((resolve) => server.listen(target as never, resolve));
}

function frame(text: string): Buffer {
  const data = Buffer.from(text + '\n');
  const header = Buffer.alloc(8);
  header[0] = 1;
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

async function start(options: { image?: string; workerTs?: object; internalOk?: boolean; ready?: string }) {
  const api = http.createServer((req, res) => {
    const url = req.url ?? '';
    const json = (code: number, body: object) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url === '/health/live') return json(200, { status: 'alive', version: SHA });
    if (url === '/health/ready') return json(200, { status: options.ready ?? 'ready', version: SHA });
    if (url === '/health/server/ready') return json(200, { status: 'ready', version: SHA });
    return json(401, { detail: 'no' });
  });
  await listen(api, 0);
  const dir = await mkdtemp(path.join(tmpdir(), 'smoke-'));
  const socket = path.join(dir, 'docker.sock');
  const execs = new Map<string, string[]>();
  const docker = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = req.url ?? '';
      const body = (chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}) as { Cmd?: string[] };
      const send = (code: number, payload: Buffer | object) => {
        res.writeHead(code);
        res.end(Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
      };
      let m = /^\/containers\/([^/]+)\/json$/.exec(url);
      if (m) return send(200, { Config: { Image: options.image ?? `buyerly-app:${SHA}` } });
      m = /^\/containers\/([^/]+)\/exec$/.exec(url);
      if (m) { const id = `${m[1]}#${execs.size}`; execs.set(id, body.Cmd ?? []); return send(201, { Id: id }); }
      m = /^\/exec\/(.+)\/start$/.exec(decodeURIComponent(url));
      if (m) {
        const [container] = m[1].split('#');
        const cmd = (execs.get(m[1]) ?? []).join(' ');
        if (container === 'buyerly-worker') return send(200, frame(JSON.stringify(options.workerTs ?? { status: 'ok', jobs: { sync: { outcome: 'ok' } } })));
        if (cmd.includes('smoke-checks.js') && !cmd.includes('--metrics')) return send(200, frame(JSON.stringify({ ok: options.internalOk ?? true, checks: [{ name: 'database_migrations', ok: options.internalOk ?? true }] })));
        return send(200, frame(''));
      }
      m = /^\/exec\/(.+)\/json$/.exec(decodeURIComponent(url));
      if (m) return send(200, { ExitCode: 0 });
      send(404, {});
    });
  });
  await listen(docker, socket);
  return { port: (api.address() as { port: number }).port, socket, dir };
}

async function smoke(env: Awaited<ReturnType<typeof start>>, sha = SHA) {
  const resultDir = path.join(env.dir, 'out');
  const result = await run('node', ['--experimental-strip-types', SCRIPT], {
    env: { PATH: process.env.PATH, EXPECTED_SHA: sha, SMOKE_BASE_URL: `http://127.0.0.1:${env.port}`, DOCKER_SOCKET: env.socket, SMOKE_RESULT_DIR: resultDir },
  }).then((r) => ({ code: 0, ...r }), (e: { code: number; stdout: string }) => ({ code: e.code, stdout: e.stdout, stderr: '' }));
  return { ...result, resultDir };
}

describe('post-deploy smoke', () => {
  it('reports every check and persists a 600 result', async () => {
    const env = await start({});
    const out = await smoke(env);
    expect(out.code).toBe(0);
    const result = JSON.parse(await readFile(path.join(out.resultDir, `post-deploy-${SHA}.json`), 'utf8')) as {
      checks: { name: string; details: object }[];
    };
    expect(result.checks.map((c) => c.name)).toEqual([
      'health_live', 'health_ready', 'authentication_boundary', 'runtime_versions',
      'worker_health', 'database_meta_isolation_summary', 'reliability_metrics',
    ]);
    expect(result).toMatchObject({ schema_version: 1, mode: 'read-only', meta_budget_mutations: 0, ok: true, release_sha: SHA });
    expect(Object.keys(result.checks[2].details)).toEqual([
      '/api/graphql', '/api/meta/oauth/config', '/api/sync/bootstrap', '/api/sync/delta?since=0',
    ].sort()); // sorted like json.dumps(sort_keys=True)
    expect((await stat(path.join(out.resultDir, `post-deploy-${SHA}.json`))).mode & 0o777).toBe(0o600);
    expect(JSON.parse(out.stdout.trim().split('\n').at(-1) ?? '')).toEqual({
      failed_checks: [], ok: true, release_sha: SHA, result_path: path.join(out.resultDir, `post-deploy-${SHA}.json`), worker_jobs: { sync: 'ok' },
    });
  });

  it('fails with the messages and exit code 1', async () => {
    const env = await start({ image: 'buyerly-app:old', workerTs: { status: 'ok', jobs: { sync: { outcome: 'error' } } }, internalOk: false, ready: 'starting' });
    const out = await smoke(env);
    expect(out.code).toBe(1);
    expect(out.stdout).toContain('[ERROR] Smoke check health_ready failed: /health/ready returned an unexpected health response');
    expect(out.stdout).toContain('[ERROR] Smoke check runtime_versions failed: buyerly-api does not use the expected release');
    expect(out.stdout).toContain('[ERROR] Smoke check worker_health failed: worker is not healthy: sync');
    expect(out.stdout).toContain('[ERROR] Smoke check database_meta_isolation_summary failed: internal contracts failed: database_migrations');
  });

  it('refuses a short SHA', async () => {
    const env = await start({});
    const out = await smoke(env, 'abc');
    expect(out.code).toBe(1);
    expect(out.stdout).toContain('[ERROR] EXPECTED_SHA must be a full lowercase git SHA.');
  });
});
