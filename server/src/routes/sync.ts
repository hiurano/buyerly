import { gzipSync } from 'node:zlib';
import type { SyncDelta } from '@buyerly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { EntityManager } from 'typeorm';
import { currentUser } from '../auth/plugin.ts';
import { HttpError } from '../http/errors.ts';
import { integerQuery } from '../http/query.ts';
import { archivedJson, bootstrapJson } from '../sync/bootstrap.ts';
import { actionMessage, bootstrapSyncGroups, changesSince, lastSyncId, needsBootstrap } from '../sync/log.ts';
import { userWorkspaceMember, type ActingMember } from '../workspaces/access.ts';

// The sync engine's HTTP endpoints, as Linear's /sync/bootstrap,
// /sync/archived_models and /sync/delta (api/routers/sync.py).
//
// GET /api/sync/bootstrap gives a fresh client every synced model the member
// may see in the active workspace and the sync id it is current to; the client
// then catches up from that id. GET /api/sync/archived-models gives archived
// and recently deleted ones, loaded when the client opens them. Both are one
// round trip, gzipped when the client accepts it. GET /api/sync/delta is the
// socket's catch-up over HTTP; 410 `bootstrap` when the log no longer reaches
// back that far.

// Below this a gzip frame costs more than it saves.
const GZIP_MIN_BYTES = 1024;
// The socket's batch; also /delta's default page.
export const SYNC_BATCH = 500;

function sendJson(request: FastifyRequest, reply: FastifyReply, body: string): Buffer {
  let data = Buffer.from(body);
  reply.header('cache-control', 'no-store').header('vary', 'Accept-Encoding').type('application/json');
  if (data.length >= GZIP_MIN_BYTES && (request.headers['accept-encoding'] ?? '').includes('gzip')) {
    data = gzipSync(data, { level: 6 });
    reply.header('content-encoding', 'gzip');
  }
  return data;
}

// The workspace and member, read in the same snapshot as what follows.
async function actingMember(tx: EntityManager, request: FastifyRequest): Promise<ActingMember> {
  const found = await userWorkspaceMember(tx, request.auth!.user);
  if (!found) throw new HttpError(404, 'Workspace not found.');
  return found.member;
}

const SNAPSHOT = { isolation: 'REPEATABLE READ' } as const;

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preValidation: [currentUser] };

  app.get('/api/sync/bootstrap', auth, async (request, reply) => {
    const body = await app.db.transaction(async (tx) => bootstrapJson(tx, await actingMember(tx, request)), SNAPSHOT);
    return sendJson(request, reply, body);
  });

  app.get('/api/sync/archived-models', auth, async (request, reply) => {
    const body = await app.db.transaction(async (tx) => archivedJson(tx, await actingMember(tx, request)), SNAPSHOT);
    return sendJson(request, reply, body);
  });

  app.get('/api/sync/delta', auth, async (request): Promise<SyncDelta> => {
    const { since, limit } = integerQuery(request, { since: { ge: 0 }, limit: { default: SYNC_BATCH, ge: 1, le: 5000 } });
    const { groups, found, newest } = await app.db.transaction(async (tx) => {
      const member = await actingMember(tx, request);
      if (await needsBootstrap(tx, since)) throw new HttpError(410, 'bootstrap');
      const memberGroups = await bootstrapSyncGroups(tx, member);
      return {
        groups: memberGroups,
        found: await changesSince(tx, memberGroups, since, limit + 1),
        newest: await lastSyncId(tx),
      };
    }, SNAPSHOT);
    const hasMore = found.length > limit;
    const page = found.slice(0, limit);
    // With nothing more to send the client is current to the newest id, not just its last change.
    const through = hasMore ? Number(page[page.length - 1].sync_id) : Math.max(newest, since);
    return {
      actions: page.map(actionMessage),
      last_sync_id: through,
      has_more: hasMore,
      sync_groups: groups,
    };
  });
}
