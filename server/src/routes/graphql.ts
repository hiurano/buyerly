import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GraphQLError, parse, type ExecutionResult, type ParseOptions, type Source } from 'graphql';
import { createYoga, type Plugin } from 'graphql-yoga';
import { currentUser } from '../auth/plugin.ts';
import type { UserEntity } from '../entities/index.ts';
import type { GraphQLContext } from '../graphql/context.ts';
import { INTERNAL_ERROR, asRouteError } from '../graphql/errors.ts';
import { forwardToPython } from '../graphql/forward.ts';
import { MAX_TOKENS, maxAliases, maxDepth } from '../graphql/limits.ts';
import { isPublicRequest } from '../graphql/public.ts';
import { servedHere } from '../graphql/routing.ts';
import { clientSchema, servedRootFields } from '../graphql/schema.ts';

// POST /api/graphql, the web client's API, as Linear's
// client-api.linear.app/graphql (api/client_api; decision 55). The request
// is authenticated before GraphQL runs, as every REST request is
// (auth/plugin.ts currentUser): 401/403 in REST's shape, so every resolver
// has a signed-in user scoped to the workspace in X-Workspace-Slug. What that
// user may do is each field's own check. Documents with fields not moved yet
// go to the Python API (graphql/routing.ts).

// The Python API's cap on request bodies (api/server.py).
const BODY_LIMIT = 6 * 1024 * 1024;

// Yoga keeps its own `request` (the Fetch one) in the context; Fastify's goes in as `http`.
type ServerContext = { http: FastifyRequest; reply: FastifyReply };

// Errors as the Python bridge words them: a field's refusal keeps its status
// in `extensions`; anything else is logged and told as REST's 500.
function maskError(error: unknown): Error {
  if (!(error instanceof GraphQLError)) return INTERNAL_ERROR();
  // Parse and validation errors are GraphQL's own, as Python sends them.
  if (!error.originalError) return error;
  const answer = asRouteError(error.originalError) ?? INTERNAL_ERROR();
  return new GraphQLError(answer.message, { nodes: error.nodes, path: error.path, extensions: answer.extensions });
}

// graphql-js parses with the Python API's token cap, and validates with its
// depth and alias limits.
function limits(): Plugin<ServerContext> {
  return {
    onParse({ setParseFn }) {
      setParseFn((source: string | Source, options?: ParseOptions) => parse(source, { ...options, maxTokens: MAX_TOKENS }));
    },
    onValidate({ addValidationRule }) {
      addValidationRule(maxDepth);
      addValidationRule(maxAliases);
    },
    onExecute() {
      return {
        onExecuteDone({ result, args }) {
          const { http } = args.contextValue as unknown as GraphQLContext;
          const errors = 'errors' in result ? ((result as ExecutionResult).errors ?? []) : [];
          for (const error of errors) {
            if (error.originalError && !asRouteError(error.originalError)) {
              http.log.error({ err: error.originalError }, 'GraphQL field %s failed', error.path?.join('.'));
            }
          }
        },
      };
    },
  };
}

export async function graphqlRoutes(app: FastifyInstance): Promise<void> {
  const schema = clientSchema();
  const served = servedRootFields(schema);
  const yoga = createYoga<ServerContext, GraphQLContext>({
    schema,
    graphqlEndpoint: '/api/graphql',
    graphiql: false,
    landingPage: false,
    logging: false,
    maskedErrors: { maskError },
    plugins: [limits()],
    context: ({ http, reply }) => ({
      app,
      http,
      reply,
      // A public request has no session: its fields never read these.
      user: http.auth?.user as UserEntity,
      webSessionId: http.auth?.webSessionId ?? '',
    }),
  });

  // The body stays bytes: forwarded as it came, or read by Yoga.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: BODY_LIMIT }, (_request, body, done) => done(null, body));

  app.all('/api/graphql', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const raw = Buffer.isBuffer(request.body) ? request.body : undefined;
    let parsed: unknown = null;
    if (request.method === 'POST' && raw && /^application\/json\b/i.test(request.headers['content-type'] ?? '')) {
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch {
        parsed = null;
      }
    }
    if (!servedHere(parsed, served)) return forwardToPython(request, reply, raw);

    if (!isPublicRequest(parsed)) await currentUser(request, reply);
    const response = await yoga.fetch(
      'http://localhost/api/graphql',
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: raw ? new Uint8Array(raw) : undefined },
      { http: request, reply },
    );
    reply.code(response.status).type('application/json');
    return reply.send(Buffer.from(await response.arrayBuffer()));
  });
}
