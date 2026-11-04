import { DataSource, type DataSourceOptions, type EntityManager } from 'typeorm';
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
    // The Python API keeps a pool of 5 (+10 overflow); the server takes over
    // its areas one at a time, so a smaller pool is enough for now.
    poolSize: 10,
    extra: { connectionTimeoutMillis: 3000 },
    ...options,
  } as DataSourceOptions);
}

// The database as routes see it (app.db). Every unit of work is an explicit
// transaction: `db.transaction(async (tx) => …)` commits when the callback
// returns and rolls back when it throws, like the Python handlers'
// `async with async_session_maker() as session: … await session.commit()`.
export interface Database {
  ping(): Promise<void>;
  close(): Promise<void>;
  transaction<T>(work: (tx: EntityManager) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export interface TransactionOptions {
  // REPEATABLE READ: every read sees one moment (sync bootstrap and delta,
  // database/sync_bootstrap.py begin_snapshot). READ COMMITTED otherwise.
  isolation?: 'REPEATABLE READ';
}

// Thrown inside a transaction to keep its writes and still fail the request:
// a wrong OTP must count the attempt (commit) and answer 401. The Python
// handlers do `await session.commit(); raise HTTPException(...)`.
export class AfterCommit extends Error {
  constructor(readonly error: Error) {
    super(error.message);
    this.name = 'AfterCommit';
  }
}

export function afterCommit(error: Error): AfterCommit {
  return new AfterCommit(error);
}

// The rows of a raw statement. TypeORM's plain query() answers an UPDATE or
// DELETE with [rows, count] instead of the rows; this always gives the rows.
export async function rows<T>(tx: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  const runner = tx.queryRunner ?? tx.connection.createQueryRunner();
  try {
    const result = await runner.query(sql, parameters, true);
    return result.records as T[];
  } finally {
    if (!tx.queryRunner) await runner.release();
  }
}

export function databaseOver(dataSource: DataSource): Database {
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
    async transaction(work, options = {}) {
      const runner = (await connected()).createQueryRunner();
      await runner.connect();
      await runner.startTransaction(options.isolation);
      try {
        const result = await work(runner.manager);
        await runner.commitTransaction();
        return result;
      } catch (error) {
        if (error instanceof AfterCommit) {
          await runner.commitTransaction();
          throw error.error;
        }
        await runner.rollbackTransaction();
        throw error;
      } finally {
        await runner.release();
      }
    },
  };
}

export function connectDatabase(url: string): Database | null {
  return url ? databaseOver(createBuyerlyDataSource(url)) : null;
}
