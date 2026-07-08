import { cookies } from 'next/headers';
import {
  ACCESS_MAX_AGE,
  COOKIE_ACCESS,
  COOKIE_DEVICE_ID,
  COOKIE_DEVICE_TOKEN,
  COOKIE_DEVICE_UID,
  COOKIE_REFRESH,
  DEVICE_MAX_AGE,
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

// ---- Browser device identity (device-approval flow) ----

const deviceCookieOpts = {
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: DEVICE_MAX_AGE,
};

/** Stable per-browser UID; created on first login and kept across sessions. */
export function getOrCreateDeviceUid(): string {
  const jar = cookies();
  const existing = jar.get(COOKIE_DEVICE_UID)?.value;
  if (existing) return existing;
  const uid = `web-${crypto.randomUUID()}`;
  jar.set(COOKIE_DEVICE_UID, uid, deviceCookieOpts);
  return uid;
}

export function getDeviceUid(): string | undefined {
  return cookies().get(COOKIE_DEVICE_UID)?.value;
}

export function setDeviceCredentials(deviceId: string, deviceToken: string) {
  const jar = cookies();
  jar.set(COOKIE_DEVICE_ID, deviceId, deviceCookieOpts);
  jar.set(COOKIE_DEVICE_TOKEN, deviceToken, deviceCookieOpts);
}

export function getDeviceCredentials(): { deviceId?: string; deviceToken?: string } {
  const jar = cookies();
  return {
    deviceId: jar.get(COOKIE_DEVICE_ID)?.value,
    deviceToken: jar.get(COOKIE_DEVICE_TOKEN)?.value,
  };
}
