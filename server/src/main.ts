import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
import { connectDatabase } from './database.ts';

const config = readConfig();
const app = buildApp(config, connectDatabase(config.databaseUrl));

// Compose stops containers with SIGTERM; finish open requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info({ version: config.version }, 'Buyerly server started');
} catch (error) {
  app.log.fatal({ err: error }, 'Buyerly server failed to start');
  process.exit(1);
}
