import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';

// The sync bus between processes (decision 54, #611 stage 4): a process
// that committed new sync_actions rows publishes here, and every sync hub
// reads the log at once instead of at its next poll. Postgres NOTIFY (sent
// by the log's trigger for every writer, the Python worker included) keeps
// waking the hubs too, and the hubs still poll: a lost message only delays
// a change, never loses it.

export const SYNC_BUS_CHANNEL = 'buyerly:sync_actions';

// Calls `onMessage` for every publish; ioredis reconnects and subscribes
// again by itself. The result stops it.
export async function subscribeSyncBus(url: string, onMessage: () => void, log: FastifyBaseLogger): Promise<() => Promise<void>> {
  const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  let reported = false;
  client.on('error', (error: Error) => {
    if (!reported) log.warn({ err: error }, 'Sync bus connection error; the hub polls meanwhile');
    reported = true;
  });
  client.on('ready', () => { reported = false; });
  client.on('message', (channel: string) => {
    if (channel === SYNC_BUS_CHANNEL) onMessage();
  });
  try {
    await client.connect();
    await client.subscribe(SYNC_BUS_CHANNEL);
  } catch (error) {
    log.warn({ err: error }, 'Sync bus is not reachable yet; the hub polls meanwhile');
  }
  return async () => {
    client.disconnect();
  };
}

export async function publishSyncBus(client: Redis): Promise<void> {
  await client.publish(SYNC_BUS_CHANNEL, '');
}
