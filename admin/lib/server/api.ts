import { API_INTERNAL_BASE_URL } from '../config';
import { getAccessToken, getRefreshToken, setAuthCookies } from './session';

interface ApiOptions {
  method?: string;
  body?: unknown;
  // when false, don't attempt token refresh (used by the refresh call itself)
  allowRefresh?: boolean;
}

/**
 * Server-side fetch to the backend using the access cookie. On 401 it attempts
 * a single refresh (rotating the cookies) and retries. Throws ApiError on
 * non-2xx so server components / route handlers can map it.
 */
export async function serverApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await rawCall(path, opts, getAccessToken());

  if (res.status === 401 && opts.allowRefresh !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retry = await rawCall(path, opts, refreshed);
      return handle<T>(retry);
    }
  }
  return handle<T>(res);
}

async function rawCall(path: string, opts: ApiOptions, token?: string): Promise<Response> {
  return fetch(`${API_INTERNAL_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await fetch(`${API_INTERNAL_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setAuthCookies(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}
