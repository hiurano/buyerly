import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserEntity } from '../entities/index.ts';
import { lastSyncId } from '../sync/log.ts';
import type { Payload, PayloadClass } from './payloads.ts';

// What every resolver gets (api/client_api get_context). The request was
// authenticated before GraphQL ran, as every REST request is: the session
// cookie of the account in X-Buyerly-Account, the CSRF token on this POST,
// and the workspace in X-Workspace-Slug (auth/plugin.ts currentUser). A
// request failing any of these never reaches a resolver (401/403), so `user`
// is always there, already scoped to that workspace, except in the public
// fields of signing in (public.ts), which never read it.
export interface GraphQLContext {
  app: FastifyInstance;
  // Fastify's request (Yoga's own `request` is the Fetch one).
  http: FastifyRequest;
  reply: FastifyReply;
  user: UserEntity;
  webSessionId: string;
}

// A mutation's answer (schema.py _mutate): success, the newest sync id once
// the write has committed (the client's transaction queue keeps its local
// change until sync has caught up to it), and the record. Call it after the
// write's transaction has returned.
export async function mutated(context: GraphQLContext, type: PayloadClass, record: unknown = null): Promise<Payload> {
  const result: Payload = Object.assign(new type(), {
    success: true,
    lastSyncId: await context.app.db.transaction((tx) => lastSyncId(tx)),
  });
  if (type.entity) result[type.entity] = record;
  return result;
}
