import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type Database } from '../src/app.ts';
import { readConfig } from '../src/config.ts';

// The site the TypeScript server serves itself (#611 stage 6, from
// api/server.py): probes, the React app, public pages, the service worker.

let dist: string;

function database(payload: Record<string, unknown> | null, ping: () => Promise<void> = async () => {}): Database {
  return {
    ping,
    close: async () => {},
    // The worker probe reads one row through a transaction.
    transaction: (async (work: (tx: { query: () => Promise<unknown> }) => Promise<unknown>) =>
      work({ query: async () => (payload ? [{ payload }] : []) })) as unknown as Database['transaction'],
    listen: async () => { throw new Error('no database'); },
  };
}

function app(env: Record<string, string> = {}, db: Database | null = null) {
  return buildApp(readConfig({ APP_VERSION: 'abc123', LOG_LEVEL: 'silent', FRONTEND_DIST: dist, ...env }), db);
}

beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'buyerly-dist-'));
  for (const name of ['index.html', 'landing.html', 'about.html', 'privacy.html', 'terms.html', 'data-deletion.html', 'changelog.html']) {
    writeFileSync(path.join(dist, name), `<!-- ${name} -->`);
  }
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'assets', 'app-1234.js'), 'console.log(1)');
  mkdirSync(path.join(dist, 'changelog'));
  writeFileSync(path.join(dist, 'changelog', '2026-11-07.html'), '<!-- release -->');
  writeFileSync(path.join(dist, 'sw.js'), '// worker');
  writeFileSync(path.join(dist, 'sw-off.js'), '// kill switch');
  writeFileSync(path.join(dist, 'favicon.ico'), 'ico');
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('probes', () => {
  it('answer live and ready at the root, as the Python API did', async () => {
    const server = app({}, database(null));
    expect((await server.inject('/health/live')).json()).toEqual({ status: 'alive', version: 'abc123' });
    expect((await server.inject('/health/ready')).json()).toEqual({ status: 'ready', version: 'abc123' });
    await server.close();
    const down = app({}, database(null, async () => { throw new Error('down'); }));
    const response = await down.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', version: 'abc123' });
    await down.close();
  });

  it('report the worker: unknown on a fresh install, 503 once the monitoring cycle is critical', async () => {
    const fresh = app({}, database(null));
    expect((await fresh.inject('/health/worker')).json()).toEqual({ status: 'unknown', lag_seconds: null, warning_seconds: 180, critical_seconds: 360 });
    await fresh.close();

    const stale = app({}, database({ finished_at: new Date(Date.now() - 600_000).toISOString() }));
    const response = await stale.inject('/health/worker');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'critical' });
    await stale.close();

    const ok = app({}, database({ finished_at: new Date().toISOString() }));
    expect((await ok.inject('/health/worker')).json()).toMatchObject({ status: 'ok', lag_seconds: 0 });
    await ok.close();
  });

  it('report the worker unavailable without a database', async () => {
    const server = app();
    const response = await server.inject('/health/worker');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    await server.close();
  });
});

describe('the built app', () => {
  it('serves the public pages with a short cache, and 404s a missing one', async () => {
    const server = app();
    for (const [url, file] of [['/', 'landing.html'], ['/about', 'about.html'], ['/changelog', 'changelog.html'], ['/changelog/2026-11-07', '2026-11-07.html']]) {
      const response = await server.inject(url);
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(file === '2026-11-07.html' ? 'release' : file);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.headers['cache-control']).toBe('public, max-age=300');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
    expect((await server.inject('/changelog/nope')).json()).toEqual({ detail: 'Document not found' });
    expect((await server.inject('/changelog/..%2Findex')).statusCode).toBe(404);
    await server.close();
  });

  it('serves hashed assets for a year, other built files for five minutes', async () => {
    const server = app();
    const asset = await server.inject('/assets/app-1234.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8');
    const icon = await server.inject('/favicon.ico');
    expect(icon.headers['cache-control']).toBe('public, max-age=300');
    const head = await server.inject({ method: 'HEAD', url: '/assets/app-1234.js' });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    await server.close();
  });

  it('serves the service worker uncached, or its kill switch', async () => {
    const on = app();
    const worker = await on.inject('/sw.js');
    expect(worker.body).toBe('// worker');
    expect(worker.headers['cache-control']).toBe('no-cache, no-store');
    await on.close();
    const off = app({ SERVICE_WORKER: 'false' });
    expect((await off.inject('/sw.js')).body).toBe('// kill switch');
    await off.close();
  });

  it('serves the React app for its own addresses and workspace slugs, never for server roots', async () => {
    const server = app();
    for (const url of ['/login', '/invite/abc', '/acme', '/acme/campaigns?view=1', '/connect/meta']) {
      const response = await server.inject(url);
      expect(response.statusCode, url).toBe(200);
      expect(response.body).toContain('index.html');
      expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    }
    for (const url of ['/api/nope', '/health/nope', '/uploads/nope.png', '/assets/missing.js', '/docs']) {
      const response = await server.inject(url);
      expect(response.statusCode, url).toBe(404);
      expect(response.json()).toEqual({ detail: 'Not Found' });
    }
    expect((await server.inject({ method: 'POST', url: '/acme' })).statusCode).toBe(404);
    expect((await server.inject('/../../etc/passwd')).statusCode).not.toBe(500);
    await server.close();
  });

  it('serves nothing from disk without SERVE_STATIC', async () => {
    const server = app({ SERVE_STATIC: 'false' });
    expect((await server.inject('/')).statusCode).toBe(404);
    expect((await server.inject('/acme')).statusCode).toBe(404);
    expect((await server.inject('/health/live')).statusCode).toBe(200);
    await server.close();
  });
});
