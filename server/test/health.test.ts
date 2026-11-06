import { describe, expect, it } from 'vitest';
import { buildApp, type Database } from '../src/app.ts';
import { logLevel, postgresUrl, readConfig } from '../src/config.ts';

const config = readConfig({ APP_VERSION: 'abc123', LOG_LEVEL: 'silent' });

function database(ping: () => Promise<void>): Database {
  return { ping, close: async () => {}, transaction: async () => { throw new Error("no database"); }, listen: async () => { throw new Error("no database"); } };
}

describe('health', () => {
  it('is alive with the release version', async () => {
    const app = buildApp(config, null);
    const response = await app.inject({ method: 'GET', url: '/health/server/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'alive', version: 'abc123' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    await app.close();
  });

  it('is ready when the database answers', async () => {
    const app = buildApp(config, database(async () => {}));
    const response = await app.inject({ method: 'GET', url: '/health/server/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', version: 'abc123' });
    await app.close();
  });

  it('is not ready when the database fails', async () => {
    const app = buildApp(config, database(async () => { throw new Error('down'); }));
    const response = await app.inject({ method: 'GET', url: '/health/server/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', version: 'abc123' });
    await app.close();
  });

  it('is not ready without a database', async () => {
    const app = buildApp(config, null);
    const response = await app.inject({ method: 'GET', url: '/health/server/ready' });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});

describe('unknown paths', () => {
  it('answer 404 without echoing the query string', async () => {
    const app = buildApp(config, null);
    const response = await app.inject({ method: 'GET', url: '/nope?access_token=SECRET' });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('SECRET');
    await app.close();
  });
});

describe('config', () => {
  it('turns SQLAlchemy URLs into node-postgres ones', () => {
    expect(postgresUrl('postgresql+asyncpg://u:p@db:5432/buyerly')).toBe('postgresql://u:p@db:5432/buyerly');
    expect(postgresUrl('postgresql://u:p@db/buyerly')).toBe('postgresql://u:p@db/buyerly');
  });

  it('defaults to port 8090 and version "local"', () => {
    const defaults = readConfig({});
    expect(defaults.port).toBe(8090);
    expect(defaults.version).toBe('local');
  });

  it('maps Python log level names', () => {
    expect(logLevel('WARNING')).toBe('warn');
    expect(logLevel('CRITICAL')).toBe('fatal');
    expect(logLevel('Info')).toBe('info');
    expect(logLevel('verbose')).toBe('info');
    expect(logLevel(undefined)).toBe('info');
  });

  it('rejects a port that is not a number', () => {
    expect(() => readConfig({ SERVER_PORT: 'eighty' })).toThrow(/SERVER_PORT/);
  });
});
