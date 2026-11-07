import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { postgresUrl } from '../config.ts';
import { MIGRATIONS } from '../migrations/index.ts';

// The post-deploy smoke's checks inside the API container (#611 stage 6, from
// services/smoke_checks.py and services/reliability_metrics.py). The smoke
// (post-deploy-smoke.ts) runs in a container without the app's settings, so
// it execs this where they are:
//
//   node server/dist/scripts/smoke-checks.js
//     read-only production contracts as one JSON line; exit 1 when one fails
//   node server/dist/scripts/smoke-checks.js --metrics <base64 JSON>
//     stores the smoke's secret-free measurements under
//     automation_runtime_states['monitoring'].synthetic

type Json = Record<string, unknown>;
interface Check { name: string; ok: boolean; [key: string]: unknown }

const SHA = /^[0-9a-f]{40}$/;

async function count(db: DataSource, sql: string): Promise<number> {
  const [row] = await db.query<{ count: string | number }[]>(sql);
  return Number(row.count);
}

export async function collectChecks(db: DataSource, env: NodeJS.ProcessEnv): Promise<Check[]> {
  const checks: Check[] = [];
  try {
    const recorded = new Set((await db.query<{ name: string }[]>('SELECT name FROM migrations')).map((row) => row.name));
    const pending = MIGRATIONS.map((migration) => migration.name).filter((name) => !recorded.has(name));
    checks.push(pending.length ? { name: 'database_migrations', ok: false, error: `pending: ${pending.join(', ')}` } : { name: 'database_migrations', ok: true });
  } catch {
    checks.push({ name: 'database_migrations', ok: false, error: 'the migrations table cannot be read' });
  }

  const meta = {
    app_id: Boolean(env.META_APP_ID?.trim()),
    app_secret: Boolean(env.META_APP_SECRET?.trim()),
    login_config_id: Boolean(env.META_LOGIN_CONFIG_ID?.trim()),
    redirect_uri: Boolean(env.META_OAUTH_REDIRECT_URI?.trim()),
    encryption_key: Boolean(env.META_TOKEN_ENCRYPTION_KEY?.trim()),
    // The server pins a version when the setting is empty (config.ts).
    graph_version: true,
  };
  checks.push({ name: 'meta_configuration', ok: Object.values(meta).every(Boolean), details: meta });

  const isolation: [string, string, string][] = [
    [
      'account_connection_workspace_mismatch',
      `SELECT count(*) FROM accounts AS account JOIN meta_connections AS connection ON connection.id = account.meta_connection_id
       WHERE account.workspace_id IS NULL OR account.workspace_id <> connection.workspace_id`,
      'workspace isolation query failed',
    ],
    ['summary_workspace_scope', 'SELECT count(*) FROM summary_snapshots WHERE workspace_id IS NULL', 'summary workspace query failed'],
  ];
  for (const [name, sql, error] of isolation) {
    try {
      const violations = await count(db, sql);
      checks.push({ name, ok: violations === 0, violations });
    } catch {
      checks.push({ name, ok: false, error });
    }
  }
  return checks;
}

export function normalizeSyntheticMetrics(payload: unknown, now: Date = new Date()): Json {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('synthetic metrics must be an object');
  const input = payload as Json;
  const releaseSha = String((input.release_sha as string | undefined) || '');
  if (!SHA.test(releaseSha)) throw new Error('release_sha must be a full lowercase git SHA');
  const availability = Number(input.availability_percent ?? 0);
  const latency = Math.trunc(Number(input.latency_p95_ms ?? 0));
  const total = Math.trunc(Number(input.checks_total ?? 0));
  const passed = Math.trunc(Number(input.checks_passed ?? 0));
  if (!(availability >= 0 && availability <= 100)) throw new Error('availability_percent is outside 0..100');
  if (!(latency >= 0 && latency <= 120_000)) throw new Error('latency_p95_ms is outside 0..120000');
  if (!(total >= 1 && passed >= 0 && passed <= total)) throw new Error('invalid synthetic check counters');
  return {
    release_sha: releaseSha,
    measured_at: now.toISOString(),
    availability_percent: Math.round(availability * 1000) / 1000,
    latency_p95_ms: latency,
    checks_total: total,
    checks_passed: passed,
    ok: passed === total,
  };
}

export async function persistSyntheticMetrics(db: DataSource, payload: unknown): Promise<Json> {
  const synthetic = normalizeSyntheticMetrics(payload);
  await db.query(
    `INSERT INTO automation_runtime_states (state_key, payload, updated_at)
     VALUES ('monitoring', jsonb_build_object('synthetic', $1::jsonb), now())
     ON CONFLICT (state_key) DO UPDATE
       SET payload = coalesce(automation_runtime_states.payload, '{}'::jsonb) || jsonb_build_object('synthetic', $1::jsonb),
           updated_at = now()`,
    [JSON.stringify(synthetic)],
  );
  return synthetic;
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const db = new DataSource({ type: 'postgres', url: postgresUrl(env.DATABASE_URL ?? ''), logging: false });
  await db.initialize();
  try {
    const index = argv.indexOf('--metrics');
    if (index >= 0) {
      const raw = Buffer.from(argv[index + 1] ?? '', 'base64').toString('utf8');
      if (raw.length > 16_384) throw new Error('synthetic metrics payload is too large');
      const stored = await persistSyntheticMetrics(db, JSON.parse(raw));
      console.log(JSON.stringify({ ok: true, release_sha: stored.release_sha }));
      return 0;
    }
    const checks = await collectChecks(db, env);
    const ok = checks.every((check) => check.ok);
    console.log(JSON.stringify({ checks, meta_budget_mutations: 0, mode: 'read-only', ok }));
    return ok ? 0 : 1;
  } finally {
    await db.destroy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
