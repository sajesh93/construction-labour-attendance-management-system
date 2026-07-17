import { NextRequest, NextResponse } from 'next/server';
import { API_INTERNAL_BASE_URL } from '@/lib/config';
import { getAccessToken } from '@/lib/server/session';

/**
 * Streams the worker-documents zip from the backend using the httpOnly access
 * cookie — same reason as /api/photo: the JSON-only proxy can't carry binary.
 *
 * The body is passed straight through so the zip is never buffered here; a
 * few hundred people is a large download.
 */
export async function POST(req: NextRequest) {
  const token = getAccessToken();
  const res = await fetch(`${API_INTERNAL_BASE_URL}/workers/documents`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: await req.text(),
    cache: 'no-store',
  });
  if (!res.ok || !res.body) {
    return new NextResponse(null, { status: res.status === 200 ? 502 : res.status });
  }
  return new NextResponse(res.body, {
    headers: {
      'content-type': 'application/zip',
      'cache-control': 'no-store',
    },
  });
}
