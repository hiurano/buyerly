import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { postgresUrl } from '../config.ts';
import { BUYERLY_ENTITIES } from '../entities/index.ts';
import { MetaTokenError, MetaTokenKeyring } from '../meta/tokens.ts';
import { LAST_ALEMBIC_REVISION } from '../migrations/1762473600000-baseline.ts';
import { MIGRATIONS } from '../migrations/index.ts';

// Whether a restored backup is a database this release can run on (#204;
// from database/restore_check.py, #611 stage 5). scripts/drill_restore.sh
// restores a backup into a throwaway database and runs this inside the API
// container, so the check uses the deployed code's migrations and entities:
//
//   node server/dist/scripts/restore-check.js --database buyerly_restore_drill
//
// The database the app serves is refused: the check may migrate the one it
// inspects. The first failed stage stops the check:
// 1. Schema version: every migration the backup recorded is one of this
//    release's; pending ones (a backup from before the last deploy) are run on
//    the throwaway copy, as `migrate` would after a real restore. A backup
//    from before TypeORM took over must be at Alembic's last revision.
// 2. Schema contract: every entity's table and column with its type family,
//    and the foreign keys the entities declare.
// 3. Data: every foreign key is validated; at least one user and workspace.
// 4. Application read: rows of every entity load, every Meta token decrypts
//    with this release's key.
// Prints counts and names only, never row contents or secrets.

const APP_READ_ROW_LIMIT = 200;

class StageFailed extends Error {}

type Print = (line: string) => void;

function reporter(print: Print) {
  return {
    ok: (stage: string, message: string) => print(`  [OK]   ${stage}: ${message}`),
    fail: (stage: string, message: string): never => {
      print(`  [FAIL] ${stage}: ${message}`);
      throw new StageFailed(stage);
    },
  };
}

async function exists(db: DataSource, table: string): Promise<boolean> {
  const [row] = await db.query<{ found: boolean }[]>('SELECT to_regclass($1) IS NOT NULL AS found', [`public.${table}`]);
  return row.found;
}

// Coarse families: varchar against text or real against double is harmless,
// a date stored as text is not.
function family(type: string): string {
  const t = type.toLowerCase();
  if (t === 'boolean' || t === 'bool') return 'boolean';
  if (['integer', 'int', 'int2', 'int4', 'int8', 'smallint', 'bigint'].includes(t)) return 'integer';
  if (['numeric', 'decimal', 'real', 'float4', 'float8', 'double precision', 'float'].includes(t)) return 'number';
  if (t.startsWith('timestamp')) return 'date and time';
  if (t === 'date') return 'date';
  if (t === 'json' || t === 'jsonb' || t === 'simple-json') return 'JSON';
  if (t === 'bytea') return 'binary';
  if (['varchar', 'character varying', 'text', 'char', 'character', 'bpchar', 'uuid', 'citext', 'enum'].includes(t)) return 'text';
  if (t === 'array' || t.startsWith('_')) return 'array';
  return t;
}

async function checkSchemaVersion(db: DataSource, report: ReturnType<typeof reporter>): Promise<void> {
  const stage = 'schema version';
  const known = MIGRATIONS.map((migration) => migration.name);
  if (await exists(db, 'migrations')) {
    const recorded = (await db.query<{ name: string }[]>('SELECT name FROM migrations ORDER BY id')).map((row) => row.name);
    const unknown = recorded.filter((name) => !known.includes(name));
    if (unknown.length) {
      report.fail(stage, `migrations ${unknown.join(', ')} are not in this release; a backup from a newer release`);
    }
    if (!recorded.length) report.fail(stage, 'the migrations table is empty');
  } else if (await exists(db, 'alembic_version')) {
    const revisions = (await db.query<{ version_num: string }[]>('SELECT version_num FROM alembic_version')).map((row) => row.version_num);
    if (revisions.length !== 1 || revisions[0] !== LAST_ALEMBIC_REVISION) {
      report.fail(stage, `Alembic revision ${revisions.join(', ') || 'none'}; only ${LAST_ALEMBIC_REVISION}, Alembic's last, can be taken over`);
    }
  } else {
    report.fail(stage, 'no migrations table');
  }
  let applied: string[];
  try {
    applied = (await db.runMigrations({ transaction: 'each' })).map((migration) => migration.name);
  } catch (error) {
    return report.fail(stage, `pending migrations failed: ${(error as Error).name}`);
  }
  const latest = known[known.length - 1];
  report.ok(stage, applied.length ? `migrated to ${latest} (ran ${applied.join(', ')})` : `at ${latest}, this release's latest`);
}

async function checkSchemaContract(db: DataSource, report: ReturnType<typeof reporter>): Promise<void> {
  const stage = 'schema contract';
  const live = await db.query<{ table_name: string; column_name: string; data_type: string; udt_name: string }[]>(
    "SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  const columns = new Map<string, Map<string, string>>();
  for (const row of live) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Map());
    columns.get(row.table_name)!.set(row.column_name, row.data_type === 'ARRAY' ? 'array' : row.udt_name);
  }
  const keys = new Set(
    (await db.query<{
      table_name: string; ref_table: string; columns: string;
    }[]>(`
      SELECT c.conrelid::regclass::text AS table_name, c.confrelid::regclass::text AS ref_table,
             array_to_string(ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i), ',') AS columns
      FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`)).map((row) => `${row.table_name}(${row.columns})->${row.ref_table}`),
  );

  const errors: string[] = [];
  let columnCount = 0;
  for (const entity of db.entityMetadatas) {
    const table = columns.get(entity.tableName);
    if (!table) {
      errors.push(`missing table ${entity.tableName}`);
      continue;
    }
    for (const column of entity.columns) {
      columnCount += 1;
      const actual = table.get(column.databaseName);
      if (actual === undefined) {
        errors.push(`missing column ${entity.tableName}.${column.databaseName}`);
        continue;
      }
      const expected = column.isArray ? 'array' : family(String(column.type));
      if (family(actual) !== expected) errors.push(`wrong type ${entity.tableName}.${column.databaseName}: ${actual}, expected ${expected}`);
    }
    for (const foreignKey of entity.foreignKeys) {
      const key = `${entity.tableName}(${foreignKey.columnNames.join(',')})->${foreignKey.referencedTablePath}`;
      if (!keys.has(key)) errors.push(`missing foreign key ${entity.tableName}(${foreignKey.columnNames.join(', ')}) -> ${foreignKey.referencedTablePath}`);
    }
  }
  if (errors.length) {
    report.fail(stage, errors.slice(0, 10).join('; ') + (errors.length > 10 ? ` (+${errors.length - 10} more)` : ''));
  }
  report.ok(stage, `all ${db.entityMetadatas.length} entity tables, ${columnCount} columns with their types, and the entities' foreign keys are present`);
}

async function checkData(db: DataSource, report: ReturnType<typeof reporter>): Promise<void> {
  const stage = 'data';
  const [keys] = await db.query<{ total: number; not_validated: number }[]>(
    "SELECT count(*)::int AS total, (count(*) FILTER (WHERE NOT convalidated))::int AS not_validated FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace",
  );
  const [counts] = await db.query<{ users: number; workspaces: number }[]>(
    'SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM workspaces)::int AS workspaces',
  );
  if (keys.not_validated) report.fail(stage, `${keys.not_validated} of ${keys.total} foreign keys are not validated`);
  if (!counts.users || !counts.workspaces) {
    report.fail(stage, `users ${counts.users}, workspaces ${counts.workspaces}; an empty database is not a usable restore`);
  }
  report.ok(stage, `users ${counts.users}, workspaces ${counts.workspaces}; all ${keys.total} foreign keys hold`);
}

async function checkApplicationRead(db: DataSource, tokenKey: string, report: ReturnType<typeof reporter>): Promise<void> {
  const stage = 'application read';
  let loaded = 0;
  const entities = [...db.entityMetadatas].sort((a, b) => a.name.localeCompare(b.name));
  for (const entity of entities) {
    try {
      loaded += (await db.manager.find(entity.target, { take: APP_READ_ROW_LIMIT })).length;
    } catch (error) {
      report.fail(stage, `${entity.name} rows do not load: ${(error as Error).name}`);
    }
  }
  const tokens = (await db.query<{ token: string }[]>(
    "SELECT access_token_encrypted AS token FROM meta_connections WHERE coalesce(access_token_encrypted, '') <> '' "
      + "UNION ALL SELECT access_token_encrypted FROM accounts WHERE coalesce(access_token_encrypted, '') <> ''",
  )).map((row) => row.token);
  let unreadable = 0;
  if (tokens.length) {
    let keyring: MetaTokenKeyring | null;
    try {
      keyring = new MetaTokenKeyring(tokenKey);
    } catch {
      keyring = null;
    }
    for (const token of tokens) {
      try {
        if (!keyring) throw new MetaTokenError('no key');
        keyring.decrypt(token);
      } catch {
        unreadable += 1;
      }
    }
  }
  if (unreadable) {
    report.fail(stage, `${unreadable} of ${tokens.length} Meta tokens do not decrypt with this release's META_TOKEN_ENCRYPTION_KEY`);
  }
  report.ok(stage, `${loaded} rows of ${entities.length} entities load; Meta tokens decrypt: ${tokens.length} of ${tokens.length}`);
}

// Every stage against `url`; true when all of them pass.
export async function checkRestoredDatabase(url: string, tokenKey: string, print: Print = console.log): Promise<boolean> {
  const db = new DataSource({
    type: 'postgres',
    url,
    entities: BUYERLY_ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: false,
  });
  const report = reporter(print);
  await db.initialize();
  try {
    await checkSchemaVersion(db, report);
    await checkSchemaContract(db, report);
    await checkData(db, report);
    await checkApplicationRead(db, tokenKey, report);
    return true;
  } catch (error) {
    if (error instanceof StageFailed) return false;
    throw error;
  } finally {
    await db.destroy();
  }
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const index = argv.indexOf('--database');
  const database = index >= 0 ? argv[index + 1] : undefined;
  if (!database) {
    console.error('usage: restore-check.js --database <throwaway database with the restored backup>');
    return 2;
  }
  const live = new URL(postgresUrl(env.DATABASE_URL ?? ''));
  if (decodeURIComponent(live.pathname.replace(/^\//, '')) === database) {
    console.log(`[FATAL] '${database}' is the database this app serves; use a throwaway copy.`);
    return 2;
  }
  live.pathname = `/${encodeURIComponent(database)}`;
  return (await checkRestoredDatabase(live.toString(), env.META_TOKEN_ENCRYPTION_KEY ?? '')) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
