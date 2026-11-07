import type { MigrationInterface, QueryRunner } from 'typeorm';
import { BASELINE_SCHEMA } from './baseline-schema.ts';

// The schema as Alembic left it at its last revision (#611 stage 5, decision
// 54: the first TypeORM migration fixes the schema as is). An empty database
// gets it from BASELINE_SCHEMA, which is `pg_dump --schema-only` of an
// Alembic-migrated database; CI proves the two are identical. A database
// Alembic already migrated (production) has the schema: the baseline only
// checks it is at that last revision and is recorded as applied.
export const LAST_ALEMBIC_REVISION = '0054_drop_unused_tables';

export class Baseline1762473600000 implements MigrationInterface {
  name = 'Baseline1762473600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ alembic }] = await queryRunner.manager.query<{ alembic: boolean }[]>(
      "SELECT to_regclass('public.alembic_version') IS NOT NULL AS alembic",
    );
    if (alembic) {
      const rows = await queryRunner.manager.query<{ version_num: string }[]>('SELECT version_num FROM alembic_version');
      const revisions = rows.map((row) => row.version_num);
      if (revisions.length !== 1 || revisions[0] !== LAST_ALEMBIC_REVISION) {
        throw new Error(`Alembic left this database at ${revisions.join(', ') || 'no revision'}, expected ${LAST_ALEMBIC_REVISION}`);
      }
      return;
    }
    await queryRunner.query(BASELINE_SCHEMA);
  }

  async down(): Promise<void> {
    throw new Error('The baseline is not reverted: restore a backup instead');
  }
}
