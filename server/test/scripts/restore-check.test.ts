import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postgresUrl } from '../../src/config.ts';
import { BUYERLY_ENTITIES } from '../../src/entities/index.ts';
import { MIGRATIONS } from '../../src/migrations/index.ts';
import { seed } from '../../src/scripts/dev-seed.ts';
import { checkRestoredDatabase, main } from '../../src/scripts/restore-check.ts';
import { DATABASE_URL } from '../support/target.ts';

// The restore drill's checks (tests/test_restore_check.py before the port,
// #204): each case builds a throwaway database the way a restore would, with
// this release's migrations and the dev seed as its control records, then
// breaks one thing.

const KEY = 'CKOJW1eA4PLOe59rNqizKftdfj0lN17_CIFSpe7ihLw=';
const OTHER_KEY = 'tw0Y2xOAgFmOgnpxXuzX0wl8ARzu2n1bh8fYpCYvVhY=';
const DRILL = 'buyerly_restore_check_test';

function urlOf(database: string): string {
  const url = new URL(postgresUrl(DATABASE_URL));
  url.pathname = `/${database}`;
  return url.toString();
}

async function admin<T>(work: (db: DataSource) => Promise<T>): Promise<T> {
  const db = new DataSource({ type: 'postgres', url: urlOf('postgres') });
  await db.initialize();
  try {
    return await work(db);
  } finally {
    await db.destroy();
  }
}

async function onDrill<T>(work: (db: DataSource) => Promise<T>, migrated = true): Promise<T> {
  const db = new DataSource({
    type: 'postgres', url: urlOf(DRILL), entities: BUYERLY_ENTITIES, migrations: MIGRATIONS, migrationsTableName: 'migrations',
  });
  await db.initialize();
  try {
    if (migrated) await db.runMigrations();
    return await work(db);
  } finally {
    await db.destroy();
  }
}

async function check(key = KEY): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  const ok = await checkRestoredDatabase(urlOf(DRILL), key, (line) => lines.push(line));
  return { ok, lines };
}

describe.skipIf(!DATABASE_URL)('the restore check', { timeout: 120_000 }, () => {
  beforeEach(async () => {
    await admin(async (db) => {
      await db.query(`DROP DATABASE IF EXISTS ${DRILL} WITH (FORCE)`);
      await db.query(`CREATE DATABASE ${DRILL}`);
    });
    await onDrill((db) => seed(db, { metaGraphBaseUrl: 'http://fake-meta:8090', metaTokenEncryptionKey: KEY, log: () => undefined }));
  });
  afterEach(async () => {
    await admin((db) => db.query(`DROP DATABASE IF EXISTS ${DRILL} WITH (FORCE)`));
  });
  afterAll(async () => {
    await admin((db) => db.query(`DROP DATABASE IF EXISTS ${DRILL} WITH (FORCE)`));
  });

  it('passes every stage on a real schema with control records', async () => {
    const { ok, lines } = await check();
    expect(lines.map((line) => line.slice(0, 30))).toEqual([
      expect.stringContaining('[OK]   schema version'),
      expect.stringContaining('[OK]   schema contract'),
      expect.stringContaining('[OK]   data'),
      expect.stringContaining('[OK]   application read'),
    ]);
    expect(ok).toBe(true);
  });

  it('takes over a backup from before TypeORM at Alembic\'s last revision, and refuses an older one', async () => {
    await onDrill(async (db) => {
      await db.query('DROP TABLE migrations');
      await db.query("CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY); INSERT INTO alembic_version VALUES ('0054_drop_unused_tables')");
    }, false);
    const taken = await check();
    expect(taken.ok).toBe(true);
    expect(taken.lines[0]).toContain('ran Baseline1762473600000');

    await onDrill(async (db) => {
      await db.query('DROP TABLE migrations');
      await db.query("UPDATE alembic_version SET version_num = '0053_desktop_push'");
    }, false);
    const older = await check();
    expect(older.ok).toBe(false);
    expect(older.lines).toEqual([expect.stringContaining('[FAIL] schema version: Alembic revision 0053_desktop_push')]);
  });

  it('fails a migration this release does not know, or no migrations at all', async () => {
    await onDrill((db) => db.query("INSERT INTO migrations (timestamp, name) VALUES (1999999999999, 'FromTheFuture1999999999999')"), false);
    const newer = await check();
    expect(newer.ok).toBe(false);
    expect(newer.lines[0]).toContain('FromTheFuture1999999999999 are not in this release');

    await onDrill((db) => db.query('DROP TABLE migrations'), false);
    const none = await check();
    expect(none.ok).toBe(false);
    expect(none.lines[0]).toContain('no migrations table');
  });

  it('fails the contract on a missing column', async () => {
    await onDrill((db) => db.query('ALTER TABLE workspaces DROP COLUMN slug'), false);
    expect((await check()).lines.at(-1)).toContain('missing column workspaces.slug');
  });

  it('fails the contract on a column of the wrong type', async () => {
    await onDrill((db) => db.query('ALTER TABLE users ALTER COLUMN created_at TYPE text USING created_at::text'), false);
    expect((await check()).lines.at(-1)).toContain('wrong type users.created_at: text, expected date and time');
  });

  it('fails the data stage on orphaned rows behind an unvalidated foreign key', async () => {
    await onDrill(async (db) => {
      const [fk] = await db.query<{ conname: string }[]>(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'workspace_members'::regclass AND contype = 'f' AND confrelid = 'users'::regclass "
          + "AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'workspace_members'::regclass AND attname = 'user_id')]",
      );
      await db.query(`ALTER TABLE workspace_members DROP CONSTRAINT ${fk.conname}`);
      await db.query('UPDATE workspace_members SET user_id = 999999');
      await db.query(`ALTER TABLE workspace_members ADD CONSTRAINT ${fk.conname} FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID`);
    }, false);
    expect((await check()).lines.at(-1)).toMatch(/\[FAIL\] data: 1 of \d+ foreign keys are not validated/);
  });

  it('fails the application read when the release cannot decrypt the Meta tokens', async () => {
    const { ok, lines } = await check(OTHER_KEY);
    expect(ok).toBe(false);
    expect(lines.at(-1)).toMatch(/\[FAIL\] application read: \d+ of \d+ Meta tokens do not decrypt/);
  });

  it('refuses the database the app serves', async () => {
    expect(await main(['--database', 'buyerly'], { DATABASE_URL: 'postgresql+asyncpg://u:p@db:5432/buyerly' })).toBe(2);
  });
});
