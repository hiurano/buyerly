// Settings from the environment, read once at start. The names match the
// Python services' (core/config.py), since both run from the same .env while
// the server moves to TypeScript (#611).

export interface Config {
  port: number;
  host: string;
  // The release sha, or "local" outside a release build.
  version: string;
  // A node-postgres URL; empty means "no database" (the ready check fails).
  databaseUrl: string;
  logLevel: string;
}

// Compose gives the Python services SQLAlchemy URLs
// ("postgresql+asyncpg://…"); node-postgres wants the plain scheme.
export function postgresUrl(url: string): string {
  return url.replace(/^postgres(?:ql)?\+[a-z0-9]+:\/\//, 'postgresql://');
}

// LOG_LEVEL is shared with the Python services, which name two levels
// differently; anything unknown falls back to info rather than failing start.
const LOG_LEVELS: Record<string, string> = {
  trace: 'trace', debug: 'debug', info: 'info', warn: 'warn', warning: 'warn',
  error: 'error', fatal: 'fatal', critical: 'fatal', silent: 'silent',
};

export function logLevel(value: string | undefined): string {
  return LOG_LEVELS[(value ?? '').trim().toLowerCase()] ?? 'info';
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.SERVER_PORT ?? 8090);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`SERVER_PORT is not a port: ${env.SERVER_PORT}`);
  }
  return {
    port,
    host: env.SERVER_HOST ?? '0.0.0.0',
    version: env.APP_VERSION || 'local',
    databaseUrl: postgresUrl(env.DATABASE_URL ?? ''),
    logLevel: logLevel(env.LOG_LEVEL),
  };
}
