// The client API, as Linear's `client-api.linear.app/graphql` (#509): every read sync does not
// carry and every write goes through POST /api/graphql. REST is left to sync, sign-in and uploads.
//
// A document holds one root field, and `graphql` returns that field's value. Records come back as
// the server's JSON, in the synced models' snake_case fields. A mutation's payload carries
// `lastSyncId`, the sync id that holds its effect, for the transaction queue (#508).
import { ApiError, META_OAUTH_NOT_CONFIGURED, send } from './api';
import { pool } from '@/models/pool';

type GraphQLError = {
  message: string;
  extensions?: { statusCode?: number; userPresentableMessage?: string; detail?: { code?: string } };
};

export async function graphql<T>(
  document: string,
  variables: Record<string, unknown> = {},
  { signal, headers }: { signal?: AbortSignal; headers?: HeadersInit } = {},
): Promise<T> {
  const payload = (await send('/api/graphql', {
    method: 'POST',
    body: JSON.stringify({ query: document, variables }),
    signal,
    headers,
  })) as { data?: Record<string, unknown> | null; errors?: GraphQLError[] };
  const error = payload.errors?.[0];
  if (error) {
    const message = error.extensions?.detail?.code === 'meta_oauth_not_configured'
      ? META_OAUTH_NOT_CONFIGURED
      : error.extensions?.userPresentableMessage || error.message || 'Something went wrong';
    throw new ApiError(error.extensions?.statusCode ?? 500, message);
  }
  // Whatever a write changed, the pool reads again behind the next page that shows it (#488).
  if (/^\s*mutation\b/.test(document)) pool.invalidate('');
  const data = payload.data ?? {};
  return data[Object.keys(data)[0]] as T;
}
