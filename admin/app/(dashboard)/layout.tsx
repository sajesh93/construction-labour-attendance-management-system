import * as React from 'react';
import { redirect } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/server/api';
import { Me } from '@/lib/types';
import { AppShell } from '@/components/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  try {
    me = await serverApi<Me>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/login');
    throw e;
  }
  return <AppShell me={me}>{children}</AppShell>;
}
