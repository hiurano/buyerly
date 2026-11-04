import { DataSource, type DataSourceOptions } from 'typeorm';
import type { Database } from './app.ts';
import { BUYERLY_ENTITIES } from './entities/index.ts';

// TypeORM over the tables Alembic owns (#611 stage 2, decision 54). The
// schema stays as the Python side migrates it while both servers run, so
// TypeORM never creates or changes anything: no synchronize, no migrations.
// server/test/schema.test.ts checks the entities against the migrated schema.
export function createBuyerlyDataSource(url: string, options: Partial<DataSourceOptions> = {}): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    entities: BUYERLY_ENTITIES,
    synchronize: false,
    migrationsRun: false,
    migrations: [],
    // A small pool until the server serves more than its health checks.
    poolSize: 2,
    extra: { connectionTimeoutMillis: 3000 },
    ...options,
  } as DataSourceOptions);
}

export function connectDatabase(url: string): Database | null {
  if (!url) return null;
  const dataSource = createBuyerlyDataSource(url);
  // Connect on first use, not at start: the server starts and reports "not
  // ready" while the database is down, then connects once it is up.
  let connecting: Promise<DataSource> | null = null;
  const connected = async (): Promise<DataSource> => {
    if (dataSource.isInitialized) return dataSource;
    connecting ??= dataSource.initialize().catch((error: unknown) => {
      connecting = null;
      throw error;
    });
    return connecting;
  };
  return {
    async ping() {
      await (await connected()).query('SELECT 1');
    },
    async close() {
      if (dataSource.isInitialized) await dataSource.destroy();
    },
  };
}
