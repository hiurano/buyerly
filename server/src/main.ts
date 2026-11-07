import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
import { connectDatabase } from './database.ts';
import { registerTelegramWebhook } from './notifications/telegram.ts';
import { ImageStorage } from './uploads/images.ts';
import { startWatchdog } from './worker/watchdog.ts';

const config = readConfig();
const app = buildApp(config, connectDatabase(config.databaseUrl));
let stopWatchdog = (): void => {};

// Compose stops containers with SIGTERM; finish open requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    stopWatchdog();
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info({ version: config.version }, 'Buyerly server started');
  // The worker watchdog runs here, beside the worker it watches (#685).
  if (config.databaseUrl) stopWatchdog = startWatchdog(app.db, app.log);
  void registerTelegramWebhook(config.telegramBotToken, config.webappUrl, app.log);
  // Logos uploaded but never attached to a workspace (api/server.py did this at start).
  app.db.transaction((tx) => new ImageStorage(config.uploadsRoot).cleanupStaleWorkspaceLogos(tx)).then(
    (removed) => { if (removed) app.log.info('Removed %d stale workspace logo uploads', removed); },
    (error: unknown) => app.log.error({ err: error }, 'Failed to clean stale workspace logo uploads'),
  );
} catch (error) {
  app.log.fatal({ err: error }, 'Buyerly server failed to start');
  process.exit(1);
}
