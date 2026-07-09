'use client';

export class BrowserApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: {
      code?: string;
      title?: string;
      detail?: string;
      meta?: { errors?: unknown; message?: string };
    },
  ) {
    super(body?.title ?? `Error ${status}`);
  }
}

/**
 * The message to actually show a user for a failed request.
 *
 * `title` is the exception's class name for plain HTTP errors ("BadRequest-
 * Exception"), which tells nobody anything — prefer the business message, then
 * the per-field validation errors, and only fall back to the title when the
 * server sent nothing better.
 */
export function apiErrorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof BrowserApiError)) return fallback;
  const { meta, detail, title } = e.body;
  if (meta?.message) return meta.message;
  if (detail) return detail;
  if (Array.isArray(meta?.errors) && meta.errors.length > 0) {
    return meta.errors.filter((m): m is string => typeof m === 'string').join('; ');
  }
  // "BadRequestException" and friends are class names, not messages.
  if (title && !/Exception$/.test(title)) return title;
  return fallback;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new BrowserApiError(res.status, data ?? {});
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => call<T>(path, { method: 'DELETE' }),
};
