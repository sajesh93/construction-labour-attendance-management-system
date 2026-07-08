import * as React from 'react';
import { redirect } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/server/api';
import { Me } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { DevicePending } from '@/components/DevicePending';
import { getDeviceCredentials, getDeviceUid } from '@/lib/server/session';

interface DeviceStatus {
  deviceId: string | null;
  status: 'PENDING' | 'AUTHORIZED' | 'REVOKED' | 'UNREGISTERED';
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  try {
    me = await serverApi<Me>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/login');
    throw e;
  }

  // Device approval gate: everyone except the Super Admin needs this browser
  // approved (Admin PCs by the Super Admin; Safety Officers by an Admin).
  if (me.role !== 'SUPER_ADMIN') {
    const approver = me.role === 'SITE_ADMIN' ? 'the Super Admin' : 'an Admin';
    const uid = getDeviceUid();
    const { deviceToken } = getDeviceCredentials();
    if (!uid) return <DevicePending approverLabel={approver} />;
    try {
      const st = await serverApi<DeviceStatus>(
        `/auth/device/status?uid=${encodeURIComponent(uid)}`,
      );
      if (st.status !== 'AUTHORIZED' || !deviceToken) {
        return <DevicePending approverLabel={approver} />;
      }
    } catch {
      return <DevicePending approverLabel={approver} />;
    }
  }

  return <AppShell me={me}>{children}</AppShell>;
}
