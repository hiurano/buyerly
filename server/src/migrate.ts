import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { postgresUrl } from './config.ts';
import { MIGRATIONS } from './migrations/index.ts';

// `node server/dist/migrate.js` (Compose service `migrate`, #611 stage 5): the
// pending TypeORM migrations, each in its own transaction, then the one
// app_settings row the app expects. deploy.sh runs it before a release starts;
// a failure stops the deploy and keeps the previous release running.

const url = postgresUrl(process.env.DATABASE_URL ?? '');
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const dataSource = new DataSource({
  type: 'postgres',
  url,
  migrations: MIGRATIONS,
  migrationsTableName: 'migrations',
  migrationsTransactionMode: 'each',
  synchronize: false,
  logging: ['error', 'migration'],
});

try {
  await dataSource.initialize();
  const applied = await dataSource.runMigrations();
  console.log(applied.length ? `Applied migrations: ${applied.map((m) => m.name).join(', ')}` : 'No pending migrations');
  await dataSource.query(
    // The defaults database/models.py gave the row (the columns have none).
    'INSERT INTO app_settings (poll_interval_minutes, critical_rule_interval_minutes, stop_confirmation_minutes, '
      + 'inventory_cache_minutes, account_health_interval_minutes, max_concurrent_accounts, max_concurrent_actions, '
      + 'usage_soft_limit_percent, usage_hard_limit_percent, adaptive_polling_enabled, updated_at) '
      + 'SELECT 10, 2, 10, 5, 15, 3, 3, 60, 80, true, now() WHERE NOT EXISTS (SELECT 1 FROM app_settings)',
  );
  console.log('Buyerly database is ready');
  await dataSource.destroy();
} catch (error) {
  console.error('Migration failed:', error);
  await dataSource.destroy().catch(() => undefined);
  process.exit(1);
}
