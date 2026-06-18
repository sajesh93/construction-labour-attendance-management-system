import { UserRole } from './types';

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'] },
  { label: 'Sites', href: '/sites', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Vendors', href: '/vendors', roles: ['SUPER_ADMIN'] },
  { label: 'Designations', href: '/designations', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Workers', href: '/workers', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Staff', href: '/staff', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Visitors', href: '/visitors', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Devices', href: '/devices', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Attendance', href: '/attendance', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'] },
  { label: 'Corrections', href: '/corrections', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'] },
  { label: 'Reports', href: '/reports', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Users', href: '/users', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Company', href: '/company', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Storage', href: '/storage', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Audit', href: '/audit', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
];

export function navForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

/** Display labels — SUPERVISOR is shown as "Safety Officer" everywhere. */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SITE_ADMIN: 'Site Admin',
  WATCHMAN: 'Watchman',
  SUPERVISOR: 'Safety Officer',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}
