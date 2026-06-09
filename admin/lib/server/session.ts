import { cookies } from 'next/headers';
import {
  ACCESS_MAX_AGE,
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  REFRESH_MAX_AGE,
} from '../config';

const secure = process.env.NODE_ENV === 'production';

export function setAuthCookies(accessToken: string, refreshToken: string) {
  const jar = cookies();
  jar.set(COOKIE_ACCESS, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });
  jar.set(COOKIE_REFRESH, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies() {
  const jar = cookies();
  jar.delete(COOKIE_ACCESS);
  jar.delete(COOKIE_REFRESH);
}

export function getAccessToken(): string | undefined {
  return cookies().get(COOKIE_ACCESS)?.value;
}

export function getRefreshToken(): string | undefined {
  return cookies().get(COOKIE_REFRESH)?.value;
}
