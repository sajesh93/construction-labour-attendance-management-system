import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_ACCESS, COOKIE_REFRESH } from '@/lib/config';

/**
 * Guard the dashboard. If neither an access nor refresh cookie is present,
 * redirect to /login. (Token validity is enforced server-side on each call.)
 */
export function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has(COOKIE_ACCESS) || req.cookies.has(COOKIE_REFRESH);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect everything except login, the auth routes, and public/static assets
    // (logo.png must be reachable on the unauthenticated login page).
    // /download serves the Android APK and must stay public.
    // /zxing holds the QR-reader WebAssembly: a static asset with no secrets,
    // and a redirect served in its place fails to instantiate.
    '/((?!login|api/auth|download|zxing|_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
};
