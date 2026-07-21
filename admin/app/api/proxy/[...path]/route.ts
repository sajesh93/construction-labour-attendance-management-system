import { NextRequest, NextResponse } from 'next/server';
import { serverApi, ApiError } from '@/lib/server/api';

/**
 * BFF proxy: the browser calls /api/proxy/<backend-path> and this handler
 * forwards to the backend using the httpOnly access cookie (refreshing as
 * needed). Tokens never reach client-side JavaScript.
 */
async function handle(req: NextRequest, path: string[]) {
  const search = req.nextUrl.search;
  const backendPath = `/${path.join('/')}${search}`;
  const method = req.method;
  // DELETE included: an attendance repair sends its audit reason in the body.
  // Bodyless deletes still work — the parse just yields undefined.
  let body: unknown;
  if (method !== 'GET') {
    body = await req.json().catch(() => undefined);
  }

  try {
    const data = await serverApi(backendPath, { method, body });
    return NextResponse.json(data ?? {});
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json(e.body ?? { code: 'ERROR' }, { status: e.status });
    }
    return NextResponse.json({ code: 'INTERNAL' }, { status: 500 });
  }
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, { params }: Ctx) => handle(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => handle(req, params.path);
export const PATCH = (req: NextRequest, { params }: Ctx) => handle(req, params.path);
export const PUT = (req: NextRequest, { params }: Ctx) => handle(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => handle(req, params.path);
