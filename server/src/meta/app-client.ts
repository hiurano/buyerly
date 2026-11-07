import type { FastifyInstance } from 'fastify';
import { MetaClient } from './client.ts';
import { PostgresInventoryCache } from './inventory-cache.ts';

// The server's one Meta client (api/server.py _create_meta_client): its
// usage snapshot and in-memory inventory last as long as the app, and the
// shared ad set inventory is the Postgres one both servers read. Requests go
// through app.services.metaFetch at call time, so tests can answer for Meta.
const clients = new WeakMap<FastifyInstance, MetaClient>();

// The rule simulator (src/scripts/rule-simulator.ts) makes undo go through
// the client it drives the worker with.
export function useMetaClient(app: FastifyInstance, client: MetaClient): void {
  clients.set(app, client);
}

export function metaClient(app: FastifyInstance): MetaClient {
  let client = clients.get(app);
  if (!client) {
    client = new MetaClient({
      graphVersion: app.config.metaGraphVersion,
      baseUrl: app.config.metaGraphBaseUrl,
      appSecret: app.config.metaAppSecret,
      fetch: (input, init) => app.services.metaFetch(input, init),
      log: app.log,
      cacheProvider: new PostgresInventoryCache(app.db, app.log),
    });
    clients.set(app, client);
  }
  return client;
}
