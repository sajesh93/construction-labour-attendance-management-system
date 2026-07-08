import { NextRequest, NextResponse } from 'next/server';
import { API_INTERNAL_BASE_URL } from '@/lib/config';
import {
  getOrCreateDeviceUid,
  setAuthCookies,
  setDeviceCredentials,
} from '@/lib/server/session';

/** Short human-readable browser label for the Devices page ("Chrome on Windows"). */
function browserLabel(ua: string | null): string {
  if (!ua) return 'Web browser';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Linux/.test(ua)
          ? 'Linux'
          : 'PC';
  return `${browser} on ${os}`;
}

export async function POST(req: NextRequest) {
  const { email, identifier, password } = await req.json();
  const res = await fetch(`${API_INTERNAL_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: identifier ?? email, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  }

  const data = await res.json();
  setAuthCookies(data.accessToken, data.refreshToken);

  // Device approval: non-super-admin browsers must be approved before any
  // data is served. Register this browser and try to collect its token —
  // that succeeds only once an admin/super admin has authorized it.
  let deviceStatus: string | null = null;
  if (data.user?.role && data.user.role !== 'SUPER_ADMIN') {
    deviceStatus = 'PENDING';
    try {
      const uid = getOrCreateDeviceUid();
      const reg = await fetch(`${API_INTERNAL_BASE_URL}/auth/device/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${data.accessToken}`,
        },
        body: JSON.stringify({
          deviceUid: uid,
          platform: 'web',
          label: browserLabel(req.headers.get('user-agent')),
        }),
        cache: 'no-store',
      });
      const regBody = await reg.json();
      deviceStatus = regBody.status ?? 'PENDING';
      if (reg.ok && regBody.status === 'AUTHORIZED') {
        const tok = await fetch(`${API_INTERNAL_BASE_URL}/auth/device/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify({ deviceId: regBody.deviceId }),
          cache: 'no-store',
        });
        if (tok.ok) {
          const tokBody = await tok.json();
          setDeviceCredentials(regBody.deviceId, tokBody.deviceToken);
        }
      }
    } catch {
      // Registration failures surface as the pending-approval screen.
    }
  }

  return NextResponse.json({ user: data.user, deviceStatus });
}
