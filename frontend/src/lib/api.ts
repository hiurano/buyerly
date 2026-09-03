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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('buyerly_csrf');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    let detail = 'Something went wrong';
    if (typeof payload.detail === 'string') {
      detail = payload.detail;
    } else if (payload.detail?.code === 'meta_oauth_not_configured') {
      detail = 'Вход через Facebook не настроен: отсутствуют ключи META_APP_ID / META_APP_SECRET в .env. Используйте «Сгенерировать ссылку».';
    } else if (typeof payload.detail?.message === 'string') {
      detail = payload.detail.message;
    } else if (typeof payload.message === 'string') {
      detail = payload.message;
    }
    throw new ApiError(response.status, detail);
  }
  return payload as T;
}
