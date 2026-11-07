import type { FastifyInstance } from 'fastify';
import { authenticated } from '../auth/plugin.ts';
import { rateLimit } from '../http/rate-limit.ts';
import { MetaNotConfigured, oauthCallback, startOAuthViaInvite } from '../meta/connections.ts';

// The paths of connecting a Facebook profile that stay REST (decision 55:
// the browser or Facebook arrives by URL): the OAuth start from an invite,
// Facebook's callback, and the signed-in check of the settings
// (api/meta_oauth.py). The rest of Meta connections, the invite landing
// page's info (metaInviteDetails) included, is GraphQL (graphql/areas).

export async function metaOAuthRoutes(app: FastifyInstance): Promise<void> {
  // oauth_config: which Facebook Login settings are present, never their values but the redirect URI.
  app.get('/api/meta/oauth/config', { preValidation: [authenticated] }, async () => {
    const { config } = app;
    const checks = {
      app_id: Boolean(config.metaAppId.trim()),
      app_secret: Boolean(config.metaAppSecret.trim()),
      login_config_id: Boolean(config.metaLoginConfigId.trim()),
      redirect_uri: Boolean(config.metaOauthRedirectUri.trim()),
      encryption_key: Boolean(config.metaTokenEncryptionKey.trim()),
    };
    return {
      configured: Object.values(checks).every(Boolean),
      checks,
      graph_version: config.metaGraphVersion,
      redirect_uri: config.metaOauthRedirectUri,
    };
  });

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
