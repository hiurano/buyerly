import 'reflect-metadata';
import { readConfig } from '../config.ts';
import { createBuyerlyDataSource } from '../database.ts';
import { DEFAULT_WORKER_PORT, buildWorker } from './app.ts';

// `node server/dist/worker/main.js` (Compose service `worker-ts`, #611 stage 4).

const config = readConfig();
const port = Number(process.env.WORKER_PORT ?? DEFAULT_WORKER_PORT);
let worker: ReturnType<typeof buildWorker>;
try {
  worker = buildWorker(config, createBuyerlyDataSource(config.databaseUrl, { poolSize: 5 }));
} catch (error) {
  console.error('Buyerly worker refused to start:', error instanceof Error ? error.message : error);
  process.exit(1);
}

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    worker.app.log.info({ signal }, 'Worker shutting down; running jobs finish first');
    worker.stop().then(() => process.exit(0), (error: unknown) => {
      worker.app.log.error({ err: error }, 'Worker did not stop cleanly');
      process.exit(1);
    });
  });
}

try {
  await worker.app.listen({ port, host: config.host });
  await worker.start();
  worker.app.log.info({ version: config.version, jobs: worker.owned }, 'Buyerly worker started');
} catch (error) {
  worker.app.log.fatal({ err: error }, 'Buyerly worker failed to start');
  process.exit(1);
}
