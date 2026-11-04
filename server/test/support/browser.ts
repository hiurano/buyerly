import { randomInt } from 'node:crypto';
import { codeFrom, type HttpResponse, type Target } from './target.ts';

// A browser for contract tests: keeps cookies as a browser would (set,
// replaced, dropped when expired) and comes from an address of its own, so
// one test's rate limits never reach another's.

export interface Response extends HttpResponse {
  json<T = Record<string, unknown>>(): T;
  // The Set-Cookie headers as one string, to look for a cookie by name.
  cookieHeader: string;
}

function randomAddress(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

export class Browser {
  readonly cookies = new Map<string, string>();
  readonly address = randomAddress();

  constructor(
    private readonly target: Target,
    private readonly defaults: Record<string, string> = {},
  ) {}

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private remember(setCookies: string[]): void {
    for (const line of setCookies) {
      const [pair = '', ...attributes] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
      const maxAge = attributes.map((item) => item.trim()).find((item) => /^max-age=/i.test(item));
      if (!value || (maxAge && Number(maxAge.split('=')[1]) <= 0)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { headers?: Record<string, string>; json?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'x-forwarded-for': this.address,
      'user-agent': 'Buyerly contract test',
      ...this.defaults,
      ...Object.fromEntries(Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])),
    };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (options.json !== undefined) headers['content-type'] = 'application/json';
    const response = await this.target.send({ method, path, headers, body: options.json });
    this.remember(response.setCookies);
    return {
      ...response,
      json: <T>() => response.body as T,
      cookieHeader: response.setCookies.join('\n'),
    };
  }

  get(path: string, headers?: Record<string, string>): Promise<Response> {
    return this.request('GET', path, { headers });
  }

  post(path: string, json?: unknown, headers?: Record<string, string>): Promise<Response> {
    return this.request('POST', path, { json, headers });
  }

  delete(path: string, headers?: Record<string, string>): Promise<Response> {
    return this.request('DELETE', path, { headers });
  }

  // The CSRF header of the account in `slot`, as the page sends it.
  csrf(slot = 0): Record<string, string> {
    return { 'x-csrf-token': this.cookie(slot === 0 ? 'buyerly_csrf' : `buyerly_csrf_${slot}`) ?? '' };
  }

  // Sign in the way people do (tests/sign_in_helper.py): ask for a code,
  // read it from the email, enter it. Returns the verify answer. Sign-in is
  // the setup here, not what is tested: unless the test names the address,
  // each sign-in comes from a new one, out of the way of the rate limits.
  async signIn(email: string, extra: Record<string, string> = {}): Promise<Response> {
    const named = 'x-forwarded-for' in this.defaults || Object.keys(extra).some((name) => name.toLowerCase() === 'x-forwarded-for');
    const headers = named ? extra : { ...extra, 'x-forwarded-for': randomAddress() };
    const requested = await this.post('/api/auth/request-temporary-password', { email }, headers);
    if (requested.status !== 200) throw new Error(`Code request failed: ${requested.status} ${JSON.stringify(requested.body)}`);
    const { code } = codeFrom(await this.target.lastEmail(email));
    return this.post('/api/auth/verify-temporary-password', { email, code }, headers);
  }
}
