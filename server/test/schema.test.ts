import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createBuyerlyDataSource } from '../src/database.ts';
import { UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../src/entities/index.ts';

// The entities against the schema Alembic builds (#611 stage 2). While the
// Python services still migrate the database, the entities follow it, never
// the other way round: a migration that changes a table fails here until its
// entity changes too. CI migrates a Postgres of its own and sets
// SCHEMA_DATABASE_URL; without it (a laptop with no database) the check is
// skipped, but never in CI.
const url = process.env.SCHEMA_DATABASE_URL ?? '';
if (!url && process.env.CI) throw new Error('SCHEMA_DATABASE_URL must be set in CI');

// Indexes on expressions, which TypeORM's @Index cannot describe; each entity
// names them in a comment.
const EXPRESSION_INDEXES = new Set(['uq_teams_workspace_key', 'uq_teams_workspace_name']);

interface LiveColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

interface LiveConstraint {
  table_name: string;
  conname: string;
  contype: 'p' | 'u' | 'f' | 'c';
  columns: string[];
  ref_table: string | null;
  ref_columns: string[] | null;
  confdeltype: string;
}

interface LiveIndex {
  tablename: string;
  indexname: string;
  indexdef: string;
  is_unique: boolean;
  columns: string[];
  predicate: string | null;
}

const FK_ACTIONS: Record<string, string> = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };

// One spelling for a column type on both sides.
function liveType(column: LiveColumn): string {
  if (column.data_type === 'ARRAY') return `${column.udt_name.replace(/^_/, '')}[]`;
  return column.data_type;
}

describe.skipIf(!url)('entities match the migrated schema', () => {
  let dataSource: DataSource;
  let columns: LiveColumn[];
  let constraints: LiveConstraint[];
  let indexes: LiveIndex[];

  beforeAll(async () => {
    dataSource = await createBuyerlyDataSource(url).initialize();
    columns = await dataSource.query(`
      SELECT table_name, column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> 'alembic_version'
      ORDER BY table_name, ordinal_position`);
    constraints = await dataSource.query(`
      SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS columns,
        c.confrelid::regclass::text AS ref_table,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
              JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS ref_columns,
        c.confdeltype
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype IN ('p', 'u', 'f', 'c')
        AND c.conrelid::regclass::text <> 'alembic_version'`);
    indexes = await dataSource.query(`
      SELECT t.relname AS tablename, i.relname AS indexname, pg_get_indexdef(x.indexrelid) AS indexdef,
        x.indisunique AS is_unique,
        ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY k(n, o)
              JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.n ORDER BY k.o) AS columns,
        pg_get_expr(x.indpred, x.indrelid) AS predicate
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname <> 'alembic_version'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid AND c.contype IN ('p', 'u'))`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  const entityTables = () => dataSource.entityMetadatas.map((entity) => entity.tableName).sort();

  it('has an entity for every table, and a table for every entity', () => {
    const tables = [...new Set(columns.map((column) => column.table_name))].sort();
    expect(entityTables()).toEqual(tables);
  });

  it('has every column with the same type, length, nullability and default', () => {
    const live = columns.map((column) => {
      const serial = column.column_default?.startsWith('nextval(') ?? false;
      return [
        `${column.table_name}.${column.column_name}`,
        liveType(column),
        column.character_maximum_length ?? '-',
        column.is_nullable === 'YES' ? 'null' : 'not null',
        serial ? 'serial' : (column.column_default ?? '-'),
      ].join(' ');
    });
    const declared = dataSource.entityMetadatas.flatMap((entity) =>
      entity.columns.map((column) => {
        const type = dataSource.driver.normalizeType(column) + (column.isArray ? '[]' : '');
        // Entities give database defaults as raw SQL: () => "now()".
        const rawDefault: unknown = typeof column.default === 'function' ? column.default() : column.default;
        const fallback = rawDefault === undefined ? '-' : typeof rawDefault === 'string' ? rawDefault : JSON.stringify(rawDefault);
        return [
          `${entity.tableName}.${column.databaseName}`,
          type,
          column.length || '-',
          column.isNullable ? 'null' : 'not null',
          column.isGenerated && column.generationStrategy === 'increment' ? 'serial' : fallback,
        ].join(' ');
      }),
    );
    expect(declared.sort()).toEqual(live.sort());
  });

  it('has the same primary keys', () => {
    const live = constraints
      .filter((constraint) => constraint.contype === 'p')
      .map((constraint) => `${constraint.table_name} (${constraint.columns.join(', ')})`);
    const declared = dataSource.entityMetadatas.map(
      (entity) => `${entity.tableName} (${entity.primaryColumns.map((column) => column.databaseName).join(', ')})`,
    );
    expect(declared.sort()).toEqual(live.sort());
  });

  it('has the same foreign keys, by name, columns, target and ON DELETE', () => {
    const live = constraints
      .filter((constraint) => constraint.contype === 'f')
      .map((constraint) =>
        `${constraint.table_name}.${constraint.conname} (${constraint.columns.join(', ')}) -> ` +
        `${constraint.ref_table} (${(constraint.ref_columns ?? []).join(', ')}) ON DELETE ${FK_ACTIONS[constraint.confdeltype]}`,
      );
    const declared = dataSource.entityMetadatas.flatMap((entity) =>
      entity.foreignKeys.map((key) =>
        `${entity.tableName}.${key.name} (${key.columnNames.join(', ')}) -> ` +
        `${key.referencedTablePath} (${key.referencedColumnNames.join(', ')}) ON DELETE ${key.onDelete ?? 'NO ACTION'}`,
      ),
    );
    expect(declared.sort()).toEqual(live.sort());
  });

  it('has the same unique and check constraints', () => {
    const live = constraints
      .filter((constraint) => constraint.contype === 'u' || constraint.contype === 'c')
      .map((constraint) =>
        constraint.contype === 'u'
          ? `${constraint.table_name}.${constraint.conname} unique (${constraint.columns.join(', ')})`
          : `${constraint.table_name}.${constraint.conname} check`,
      );
    const declared = dataSource.entityMetadatas.flatMap((entity) => [
      ...entity.uniques.map(
        (unique) => `${entity.tableName}.${unique.name} unique (${unique.columns.map((column) => column.databaseName).join(', ')})`,
      ),
      ...entity.checks.map((check) => `${entity.tableName}.${check.name} check`),
    ]);
    expect(declared.sort()).toEqual(live.sort());
  });

  it('has the same indexes, by name, columns, uniqueness and condition', () => {
    const live = indexes
      .filter((index) => !EXPRESSION_INDEXES.has(index.indexname))
      .map((index) =>
        `${index.tablename}.${index.indexname} (${index.columns.join(', ')})` +
        `${index.is_unique ? ' unique' : ''}${index.predicate ? ` where ${index.predicate}` : ''}`,
      );
    const declared = dataSource.entityMetadatas.flatMap((entity) =>
      entity.indices.map((index) =>
        `${entity.tableName}.${index.name} (${index.columns.map((column) => column.databaseName).join(', ')})` +
        `${index.isUnique ? ' unique' : ''}${index.where ? ` where ${index.where}` : ''}`,
      ),
    );
    expect(declared.sort()).toEqual(live.sort());
    // The skipped ones still exist, so the list above stays honest.
    const names = new Set(indexes.map((index) => index.indexname));
    for (const name of EXPRESSION_INDEXES) expect(names.has(name), name).toBe(true);
  });

  it('reads every entity with every column', async () => {
    for (const entity of dataSource.entityMetadatas) {
      await expect(dataSource.getRepository(entity.target).find({ take: 1 }), entity.tableName).resolves.toBeInstanceOf(Array);
    }
  });

  it('writes and reads back a row with its defaults, JSONB and relations', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    try {
      const users = runner.manager.getRepository(UserEntity);
      const user = await users.save(users.create({ username: 'schema-check', email: 'schema-check@example.com' }));
      const workspaces = runner.manager.getRepository(WorkspaceEntity);
      const workspace = await workspaces.save(workspaces.create({ name: 'Schema check', slug: 'schema-check', ownerUserId: user.id }));
      const members = runner.manager.getRepository(WorkspaceMemberEntity);
      await members.save(members.create({
        workspaceId: workspace.id,
        userId: user.id,
        notificationChannels: {
          email: { enabled: true, priority_only: false, kinds: ['urgent'] },
          telegram: { enabled: false, priority_only: false, kinds: [] },
          desktop: { enabled: false, priority_only: false, kinds: [] },
          invite_accepted: true,
        },
      }));

      const member = await members.findOneOrFail({ where: { userId: user.id }, relations: { user: true, workspace: true } });
      // Defaults from models.py and from the database itself (users.title).
      expect(member.role).toBe('owner');
      expect(member.user?.title).toBe('');
      expect(member.user?.onboardingStep).toBe('personal_details');
      expect(member.workspace?.badgeColor).toBe('#F5A300');
      expect(member.joinedAt).toBeInstanceOf(Date);
      expect(member.notificationChannels?.email.kinds).toEqual(['urgent']);
      expect(member.inboxDisplay).toBeNull();
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
