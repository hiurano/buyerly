import { createServer, type IncomingMessage, type Server } from 'node:http';

// Meta's Graph API as a test answers it, on 127.0.0.1:META_RECORDER_PORT:
// each request is kept (method, object path, query and form fields) and
// answered by the first route its method and path match. Nothing matched is
// Meta's error 100, so a request no test expects fails loudly.

export interface MetaRequest {
  method: string;
  path: string;
  params: Record<string, string>;
}

type Answer = { status?: number; body: unknown };
type Route = { method: string; path: string; answer: (request: MetaRequest) => Answer };

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export class MetaRecorder {
  readonly requests: MetaRequest[] = [];
  private routes: Route[] = [];
  private server: Server | undefined;

  async start(port: number): Promise<void> {
    this.server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url ?? '/', 'http://meta.test');
        const params: Record<string, string> = Object.fromEntries(url.searchParams);
        const text = await body(request);
        if (text) for (const [key, value] of new URLSearchParams(text)) params[key] = value;
        const recorded: MetaRequest = { method: request.method ?? 'GET', path: url.pathname.replace(/^\/v\d+\.\d+\//, ''), params };
        this.requests.push(recorded);
        const route = this.routes.find((item) => item.method === recorded.method && item.path === recorded.path);
        const answer = route ? route.answer(recorded) : { status: 400, body: { error: { message: `Unexpected ${recorded.method} ${recorded.path}`, type: 'OAuthException', code: 100 } } };
        response.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(answer.body));
      })();
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
  }

  // Forget the requests so far and answer with these routes from now on.
  answer(routes: Array<[string, string, Answer | ((request: MetaRequest) => Answer)]>): void {
    this.requests.length = 0;
    this.routes = routes.map(([method, path, answer]) => ({ method, path, answer: typeof answer === 'function' ? answer : () => answer }));
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}
