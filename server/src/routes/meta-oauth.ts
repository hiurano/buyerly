import type { FastifyInstance } from 'fastify';
import { rateLimit } from '../http/rate-limit.ts';
import { MetaNotConfigured, oauthCallback, publicMetaInviteInfo, startOAuthViaInvite } from '../meta/connections.ts';

// The paths of connecting a Facebook profile that stay REST (decision 55:
// the browser or Facebook arrives by URL): the invite landing page's info,
// the OAuth start from an invite, and Facebook's callback (api/meta_oauth.py).
// The rest of Meta connections is GraphQL (graphql/areas/meta).

export async function metaOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>(
    '/api/meta/invites/public/:token',
    { preValidation: [rateLimit({ limit: 30, windowSeconds: 60, scope: 'meta_invite_public' })] },
    async (request) => app.db.transaction((tx) => publicMetaInviteInfo(tx, request.params.token)),
  );

  app.get<{ Params: { token: string } }>(
    '/api/meta/oauth/invite/:token',
    { preValidation: [rateLimit({ limit: 10, windowSeconds: 60, scope: 'meta_invite_oauth' })] },
    async (request, reply) => {
      try {
        return reply.redirect(await startOAuthViaInvite(app, request.params.token), 303);
      } catch (error) {
        if (error instanceof MetaNotConfigured) return reply.code(503).send({ detail: error.detail });
        throw error;
      }
    },
  );

  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>(
    '/api/meta/oauth/callback',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            state: { type: 'string', maxLength: 512 },
            code: { type: 'string', maxLength: 4096 },
            error: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => reply.redirect(await oauthCallback(app, request.query), 303),
  );
}
