import type { FastifyReply, FastifyRequest } from 'fastify';

// A client API request this server does not answer yet, passed to the Python
// API as it came (routing.ts). The Python API forwards /api/graphql here, so
// the request says it has made that hop (SERVER_HOP_HEADER) and the API
// answers it itself. The browser's address travels in X-Forwarded-For as from
// any proxy; the API trusts this server's address for it (docker-compose.yml).

export const SERVER_HOP_HEADER = 'x-buyerly-server-hop';

// Per-connection headers (RFC 9110 §7.6.1) belong to one hop, not the next.
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]);
const REQUEST_SKIP = new Set([...HOP_HEADERS, 'host', 'content-length', SERVER_HOP_HEADER]);
// fetch has unzipped the body already.
const RESPONSE_SKIP = new Set([...HOP_HEADERS, 'content-length', 'content-encoding']);

export async function forwardToPython(request: FastifyRequest, reply: FastifyReply, body: Buffer | undefined): Promise<FastifyReply> {
  const base = request.server.config.apiUrl.replace(/\/+$/, '');
  if (!base) {
    request.log.error('API_URL is not set: cannot forward %s %s', request.method, request.url.split('?')[0]);
    return reply.code(502).send({ detail: 'Service unavailable' });
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || REQUEST_SKIP.has(name)) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  // Came through the API (a trusted proxy): its chain already ends at the
  // tunnel, which the API reads as it did the first time. Otherwise this
  // server is the first proxy and adds its peer, as any proxy does.
  const forwarded = request.headers['x-forwarded-for'];
  const chain = request.server.clientAddress.viaTrustedProxy(request)
    ? [forwarded]
    : [forwarded, request.socket.remoteAddress];
  const value = chain.flat().filter(Boolean).join(', ');
  if (value) headers.set('x-forwarded-for', value);
  headers.set(SERVER_HOP_HEADER, '1');

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${request.url}`, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' || !body ? undefined : new Uint8Array(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    // The path only: a query string may carry a token.
    request.log.error({ err: error }, 'Python API unreachable for %s %s', request.method, request.url.split('?')[0]);
    return reply.code(502).send({ detail: 'Service unavailable' });
  }
  reply.code(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (!RESPONSE_SKIP.has(name) && name !== 'set-cookie') reply.header(name, value);
  });
  const cookies = upstream.headers.getSetCookie();
  if (cookies.length) reply.header('set-cookie', cookies);
  return reply.send(Buffer.from(await upstream.arrayBuffer()));
}
