import { currentRoute } from './routing';
import { requestAccount } from './accounts';
import { pool } from '@/models/pool';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const entry = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

/** A REST request: sync, sign-in and uploads; everything else is `graphql` (lib/graphql.ts). */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const payload = await send(path, init);
  // Whatever a write changed, the pool reads again behind the next page that shows it (#488);
  // the writes that know their record also change it in the pool at once.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) pool.invalidate('');
  return payload as T;
}

type Fetcher = (path: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/**
 * Sends a request as this tab's account and workspace; a refusal is an
 * `ApiError`. `through` sends it another way than `fetch`: the transaction
 * queue's go through the sync hub (#498).
 */
export async function send(path: string, init: RequestInit = {}, through: Fetcher = (url, options) => fetch(url, options)): Promise<unknown> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const route = currentRoute();
  // An empty X-Workspace-Slug asks for no workspace scope: the profile lists every workspace, so a
  // URL for one this account may not open must not read as logged out.
  if (headers.get('X-Workspace-Slug') === '') {
    headers.delete('X-Workspace-Slug');
  } else if (route.kind === 'workspace' || route.kind === 'welcome') {
    headers.set('X-Workspace-Slug', route.workspace);
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  // Several accounts may be logged in here: name this tab's, and send its own CSRF token.
  const account = requestAccount();
  if (account) headers.set('X-Buyerly-Account', String(account.id));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie(account ? account.csrfCookie : 'buyerly_csrf');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const response = await through(path, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, errorDetail(payload));
  return payload;
}

type ErrorBody = { detail?: unknown; message?: unknown };

/** What a refusal says, in the shapes the API answers with. */
function errorDetail(payload: unknown): string {
  const body = (payload ?? {}) as ErrorBody;
  const detail = body.detail as { code?: unknown; message?: unknown } | null | undefined;
  if (typeof body.detail === 'string') return body.detail;
  if (detail?.code === 'meta_oauth_not_configured') return META_OAUTH_NOT_CONFIGURED;
  if (typeof detail?.message === 'string') return detail.message;
  if (Array.isArray(body.detail)) {
    // FastAPI validation: a list of {loc, msg}; a model check reads "Value error, <reason>".
    const messages = (body.detail as unknown[])
      .map((item) => (item as { msg?: unknown } | null)?.msg)
      .filter((msg): msg is string => typeof msg === 'string');
    if (messages.length > 0) return messages.map((msg) => msg.replace(/^Value error, /, '')).join(' ');
  }
  if (typeof body.message === 'string') return body.message;
  return 'Something went wrong';
}

export const META_OAUTH_NOT_CONFIGURED =
  'Facebook login is not configured: META_APP_ID / META_APP_SECRET are missing from .env. Use “Generate link” instead.';
