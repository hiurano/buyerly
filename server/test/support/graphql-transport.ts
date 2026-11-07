import type { HttpRequest, HttpResponse } from './target.ts';

// The contract tests of signing in, sessions, the profile and the invite
// pages were written against REST paths; those routes went with decision 55
// (#685) and the same behaviour is GraphQL's now. As Python's tests did
// (tests/client_api_transport.py), the test browser sends such a request as
// the GraphQL operation the web client uses and answers as the route did:
// the field's data as the body, and a refusal's `extensions.statusCode`,
// `detail` (or message) and `retryAfter` as the status, `{ detail }` and the
// Retry-After header. What a test asserts is GraphQL's behaviour.

interface Operation {
  query: string;
  variables?: Record<string, unknown>;
  // The REST answer from the field's data.
  answer: (data: Record<string, unknown>) => unknown;
  // Sent without X-Workspace-Slug, as the page asks for the profile (App.tsx).
  unscoped?: boolean;
}

const field = (name: string) => (data: Record<string, unknown>) => data[name];
const inputMutation = (name: string, input: unknown): Operation => ({
  query: `mutation Op($input: JSON!) { ${name}(input: $input) }`,
  variables: { input: input ?? {} },
  answer: field(name),
});

// The GraphQL operation for a REST request the server no longer routes; null
// for any other request.
export function operationFor(request: HttpRequest): Operation | null {
  const [path, query = ''] = request.path.split('?', 2);
  const { method, body } = request;
  const params = new URLSearchParams(query);
  const key = `${method} ${path}`;
  switch (key) {
    case 'GET /api/me':
      return { query: '{ viewer }', answer: field('viewer'), unscoped: true };
    case 'GET /api/auth/accounts':
      return { query: '{ availableUsers }', answer: field('availableUsers') };
    case 'GET /api/auth/sessions':
      return { query: '{ authenticationSessions }', answer: field('authenticationSessions') };
    case 'POST /api/auth/request-temporary-password':
      return inputMutation('emailUserAccountAuthChallenge', body);
    case 'POST /api/auth/verify-temporary-password':
      return inputMutation('emailTokenUserAccountAuth', body);
    case 'POST /api/auth/verify-email-link':
      return inputMutation('emailLinkUserAccountAuth', body);
    case 'POST /api/auth/request-email-change':
      return {
        query: 'mutation Op($input: JSON!) { userEmailChangeRequest(input: $input) { emailChange } }',
        variables: { input: body ?? {} },
        answer: (data) => (data.userEmailChangeRequest as { emailChange: unknown }).emailChange,
      };
    case 'POST /api/auth/verify-email-change':
      return {
        query: 'mutation Op($input: JSON!) { userEmailChangeVerify(input: $input) { emailChange } }',
        variables: { input: body ?? {} },
        answer: (data) => (data.userEmailChangeVerify as { emailChange: unknown }).emailChange,
      };
    case 'POST /api/auth/logout':
      return { query: 'mutation { logout { success } }', answer: () => ({ message: 'Signed out' }) };
    case 'POST /api/auth/logout-all': {
      const keepCurrent = params.get('keep_current') === 'true';
      return {
        query: 'mutation Op($keepCurrent: Boolean!) { logoutAllSessions(keepCurrent: $keepCurrent) { success } }',
        variables: { keepCurrent },
        answer: () => ({ message: keepCurrent ? 'Other sessions ended' : 'All sessions ended' }),
      };
    }
  }
  const session = /^\/api\/auth\/sessions\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && session) {
    return {
      query: 'mutation Op($sessionId: String!) { logoutSession(sessionId: $sessionId) { success } }',
      variables: { sessionId: decodeURIComponent(session[1]) },
      answer: () => ({ message: 'Session ended' }),
    };
  }
  const invite = /^\/api\/invites\/([^/]+)$/.exec(path);
  if (method === 'GET' && invite) {
    return {
      query: 'query Op($token: String!) { workspaceInviteDetails(token: $token) }',
      variables: { token: decodeURIComponent(invite[1]) },
      answer: field('workspaceInviteDetails'),
    };
  }
  const metaInvite = /^\/api\/meta\/invites\/public\/([^/]+)$/.exec(path);
  if (method === 'GET' && metaInvite) {
    return {
      query: 'query Op($token: String!) { metaInviteDetails(token: $token) }',
      variables: { token: decodeURIComponent(metaInvite[1]) },
      answer: field('metaInviteDetails'),
    };
  }
  return null;
}

interface GraphQLAnswer {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number; detail?: unknown; retryAfter?: string } }[];
}

// The GraphQL request that carries `operation`, keeping the browser's headers.
export function graphqlRequest(request: HttpRequest, operation: Operation): HttpRequest {
  const headers: Record<string, string> = { ...request.headers, 'content-type': 'application/json' };
  if (operation.unscoped) delete headers['x-workspace-slug'];
  return {
    method: 'POST',
    path: '/api/graphql',
    headers,
    body: { query: operation.query, variables: operation.variables ?? {} },
  };
}

// GraphQL's response as the REST route answered.
export function asRest(response: HttpResponse, operation: Operation): HttpResponse {
  // Refused before any field ran (no session, CSRF): already a REST answer.
  if (response.status !== 200) return response;
  const answer = response.body as GraphQLAnswer;
  const error = answer.errors?.[0];
  if (error) {
    const headers = { ...response.headers };
    if (error.extensions?.retryAfter) headers['retry-after'] = error.extensions.retryAfter;
    const body = { detail: error.extensions?.detail ?? error.message };
    return { ...response, status: error.extensions?.statusCode ?? 400, headers, body, raw: Buffer.from(JSON.stringify(body)) };
  }
  const body = operation.answer(answer.data ?? {});
  return { ...response, body, raw: Buffer.from(JSON.stringify(body)) };
}
