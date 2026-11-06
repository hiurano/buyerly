import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

// Persist a secret-free, read-only production smoke result (#611 stage 5;
// port of scripts/post_deploy_smoke.py, same checks, same result file, same
// stdout and exit codes). It runs inside a throwaway container of the release
// image (scripts/run_post_deploy_smoke.sh) because the host has no Node:
//   --network host         → SMOKE_BASE_URL reaches 127.0.0.1:8080 of the host
//   /var/run/docker.sock   → DOCKER_SOCKET: docker inspect / exec of the services
//
//   EXPECTED_SHA=<40 hex> node server/dist/scripts/post-deploy-smoke.js

const EXPECTED_SHA = (process.env.EXPECTED_SHA ?? '').trim();
const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const APP_DIR = process.env.APP_DIR ?? '/opt/buyerly';
const RESULT_DIR = process.env.SMOKE_RESULT_DIR ?? path.join(APP_DIR, 'logs', 'smoke');
const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Check {
  name: string;
  ok: boolean;
  duration_ms: number;
  details?: Json;
  error?: string;
}

const utcNow = (): string => new Date().toISOString().replace('Z', '+00:00');

async function httpGet(urlPath: string): Promise<[number, Json]> {
  const response = await fetch(`${BASE_URL}${urlPath}`, {
    headers: { 'User-Agent': 'buyerly-read-only-smoke/1' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'follow',
  });
  const body = await response.text();
  try {
    const parsed: unknown = JSON.parse(body);
    return [response.status, parsed && typeof parsed === 'object' ? parsed : {}];
  } catch {
    if (response.ok) throw new Error('response is not JSON');
    return [response.status, {}];
  }
}

function dockerRequest(method: string, requestPath: string, body?: unknown): Promise<{ status: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const request = http.request(
      {
        socketPath: DOCKER_SOCKET,
        path: requestPath,
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
        timeout: 180_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, data: Buffer.concat(chunks) }));
      },
    );
    request.on('timeout', () => request.destroy(new Error('docker request timed out')));
    request.on('error', reject);
    request.end(payload);
  });
}

// The docker stream without a TTY: frames of [stream, 0, 0, 0, size (4 bytes BE)] + data.
function stdoutOf(stream: Buffer): string {
  const out: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= stream.length) {
    const size = stream.readUInt32BE(offset + 4);
    if (stream[offset] === 1) out.push(stream.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return Buffer.concat(out).toString('utf8').trim();
}

async function dockerInspectImage(container: string): Promise<string> {
  const { status, data } = await dockerRequest('GET', `/containers/${encodeURIComponent(container)}/json`);
  if (status !== 200) throw new Error(`runtime image inspection failed with status ${status}`);
  const inspected = JSON.parse(data.toString('utf8')) as { Config?: { Image?: string } };
  return inspected.Config?.Image ?? '';
}

async function dockerExec(name: string, container: string, cmd: string[]): Promise<string> {
  const created = await dockerRequest('POST', `/containers/${encodeURIComponent(container)}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: cmd,
  });
  if (created.status !== 201) throw new Error(`${name} failed with exit code 1`);
  const id = (JSON.parse(created.data.toString('utf8')) as Json).Id as string;
  const started = await dockerRequest('POST', `/exec/${id}/start`, { Detach: false, Tty: false });
  if (started.status !== 200) throw new Error(`${name} failed with exit code 1`);
  const inspected = await dockerRequest('GET', `/exec/${id}/json`);
  const code = (JSON.parse(inspected.data.toString('utf8')) as Json).ExitCode as number;
  if (code !== 0) throw new Error(`${name} failed with exit code ${code}`);
  return stdoutOf(started.data);
}

const lastLine = (output: string): string => output.split('\n').filter(Boolean).at(-1) ?? '';

async function record(checks: Check[], name: string, operation: () => Promise<Json>): Promise<void> {
  const started = performance.now();
  try {
    const details = await operation();
    checks.push({ name, ok: true, duration_ms: Math.round(performance.now() - started), details });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      duration_ms: Math.round(performance.now() - started),
      error: String((error as Error).message ?? error).slice(0, 240),
    });
  }
}

async function health(urlPath: string, expectedStatus: string): Promise<Json> {
  const [status, payload] = await httpGet(urlPath);
  if (status !== 200 || payload.status !== expectedStatus) {
    throw new Error(`${urlPath} returned an unexpected health response`);
  }
  if (payload.version !== EXPECTED_SHA) throw new Error(`${urlPath} does not report the expected release`);
  return { status: expectedStatus, version: EXPECTED_SHA };
}

async function authBoundary(): Promise<Json> {
  const protectedPaths = [
    // API -> TypeScript server -> back to the API for a GET (#611): the forwarding both ways.
    '/api/graphql',
    '/api/summary',
    '/api/meta/oauth/config',
    // Served by the TypeScript server through the API's forwarding (#611).
    '/api/me',
    '/api/auth/sessions',
    '/api/sync/bootstrap',
    '/api/sync/delta?since=0',
  ];
  const statuses: Json = {};
  for (const urlPath of protectedPaths) {
    const [status] = await httpGet(urlPath);
    statuses[urlPath] = status;
    if (status !== 401) throw new Error(`${urlPath} did not reject an unauthenticated request`);
  }
  return statuses;
}

async function runtimeVersions(): Promise<Json> {
  const expectedImage = `buyerly-app:${EXPECTED_SHA}`;
  const observed: Json = {};
  for (const container of ['buyerly-api', 'buyerly-worker', 'buyerly-worker-ts']) {
    const image = await dockerInspectImage(container);
    observed[container] = image;
    if (image !== expectedImage) throw new Error(`${container} does not use the expected release`);
  }
  return observed;
}

async function workerHeartbeat(): Promise<Json> {
  const output = await dockerExec('worker heartbeat', 'buyerly-worker', [
    'python',
    '-c',
    "import json,time; from pathlib import Path; " +
      "p=Path('/tmp/buyerly-worker-heartbeat'); " +
      "cycle=Path('/tmp/buyerly-worker-day-boundary-cycle-complete'); " +
      'age=time.time()-p.stat().st_mtime; ' +
      'assert age < 45 and cycle.is_file(); ' +
      "print(json.dumps({'heartbeat_age_seconds':round(age,3),'day_boundary_cycle':True}))",
  ]);
  return JSON.parse(lastLine(output)) as Json;
}

async function workerTsHealth(): Promise<Json> {
  // The TypeScript worker (#611 stage 4): healthy, and no owned job's last run failed.
  const output = await dockerExec('TypeScript worker health', 'buyerly-worker-ts', [
    'node',
    '-e',
    "fetch('http://127.0.0.1:8091/health/worker-ts').then(async (r) => { console.log(await r.text()); process.exit(r.ok ? 0 : 1); }, () => process.exit(1))",
  ]);
  const payload = JSON.parse(lastLine(output)) as Json;
  const failed = Object.entries((payload.jobs ?? {}) as Record<string, Json | null>)
    .filter(([, run]) => run && run.outcome === 'error')
    .map(([job]) => job);
  if (payload.status !== 'ok' || failed.length > 0) {
    throw new Error('TypeScript worker is not healthy: ' + (failed.length > 0 ? failed : [String(payload.status)]).join(', '));
  }
  return payload;
}

function workerTsOutcomes(checks: Check[]): Json {
  const item = checks.find((check) => check.name === 'worker_ts_health' && check.details);
  const jobs = (item?.details?.jobs ?? {}) as Record<string, Json | null>;
  return Object.fromEntries(Object.entries(jobs).map(([job, run]) => [job, run?.outcome ?? null]));
}

async function internalContracts(): Promise<Json> {
  const output = await dockerExec('in-container production contracts', 'buyerly-api', ['python', '-m', 'services.smoke_checks']);
  const payload = JSON.parse(lastLine(output)) as Json;
  if (!payload.ok) {
    const failed = ((payload.checks ?? []) as Json[]).filter((item) => !item.ok).map((item) => String(item.name));
    throw new Error('internal contracts failed: ' + failed.join(', '));
  }
  return payload;
}

async function publishReliabilityMetrics(checks: Check[]): Promise<Json> {
  const endpointChecks = checks.filter((item) => item.name === 'health_live' || item.name === 'health_ready');
  const durations = endpointChecks.map((item) => item.duration_ms || 0).sort((a, b) => a - b);
  const passed = endpointChecks.filter((item) => item.ok).length;
  const payload = {
    release_sha: EXPECTED_SHA,
    availability_percent: endpointChecks.length ? Math.round((passed / endpointChecks.length) * 100 * 1000) / 1000 : 0,
    latency_p95_ms: durations.at(-1) ?? 0,
    checks_total: endpointChecks.length,
    checks_passed: passed,
  };
  // The service reads the payload from stdin; the exec API has no stdin here, so it goes in as base64.
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  try {
    await dockerExec('reliability metrics', 'buyerly-api', ['sh', '-c', `echo ${encoded} | base64 -d | python -m services.reliability_metrics`]);
  } catch {
    throw new Error('failed to persist secret-free synthetic metrics');
  }
  return payload;
}

async function writeResult(payload: Json): Promise<string> {
  await mkdir(RESULT_DIR, { recursive: true });
  const destination = path.join(RESULT_DIR, `post-deploy-${EXPECTED_SHA}.json`);
  const temporary = path.join(RESULT_DIR, `.${path.basename(destination)}.${randomBytes(6).toString('hex')}`);
  try {
    const handle = await open(temporary, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(sortKeys(payload)) + '\n', 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return destination;
}

// json.dumps(sort_keys=True, separators=(",", ":")) of the Python script.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Json)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

async function main(): Promise<number> {
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) {
    console.log('[ERROR] EXPECTED_SHA must be a full lowercase git SHA.');
    return 1;
  }
  const checks: Check[] = [];
  const startedAt = utcNow();
  await record(checks, 'health_live', () => health('/health/live', 'alive'));
  await record(checks, 'health_ready', () => health('/health/ready', 'ready'));
  // Through the API's forwarding, so this also proves the route there (#611).
  await record(checks, 'server_health_ready', () => health('/health/server/ready', 'ready'));
  await record(checks, 'authentication_boundary', authBoundary);
  await record(checks, 'runtime_versions', runtimeVersions);
  await record(checks, 'worker_heartbeat', workerHeartbeat);
  await record(checks, 'worker_ts_health', workerTsHealth);
  await record(checks, 'database_meta_isolation_summary', internalContracts);
  await record(checks, 'reliability_metrics', () => publishReliabilityMetrics(checks));

  const ok = checks.every((item) => item.ok);
  const payload = {
    schema_version: 1,
    release_sha: EXPECTED_SHA,
    started_at: startedAt,
    finished_at: utcNow(),
    mode: 'read-only',
    meta_budget_mutations: 0,
    ok,
    checks,
  };
  const resultPath = await writeResult(payload);
  // One line per failed check, in the form the deploy workflow surfaces.
  for (const item of checks) if (!item.ok) console.log(`[ERROR] Smoke check ${item.name} failed: ${item.error}`);
  console.log(
    JSON.stringify(
      sortKeys({
        ok,
        release_sha: EXPECTED_SHA,
        result_path: resultPath,
        failed_checks: checks.filter((item) => !item.ok).map((item) => item.name),
        // What the TypeScript worker ran last (#611 stage 4), for the deploy log.
        worker_ts_jobs: workerTsOutcomes(checks),
      }),
    ),
  );
  return ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
