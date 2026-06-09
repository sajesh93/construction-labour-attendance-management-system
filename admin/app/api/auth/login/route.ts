import { NextRequest, NextResponse } from 'next/server';
import { API_INTERNAL_BASE_URL } from '@/lib/config';
import { setAuthCookies } from '@/lib/server/session';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const res = await fetch(`${API_INTERNAL_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  }

  const data = await res.json();
  setAuthCookies(data.accessToken, data.refreshToken);
  return NextResponse.json({ user: data.user });
}
