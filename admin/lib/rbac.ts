import { UserRole } from './types';

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'] },
  { label: 'Organizations', href: '/organizations', roles: ['SUPER_ADMIN'] },
  { label: 'Sites', href: '/sites', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Vendors', href: '/vendors', roles: ['SUPER_ADMIN'] },
  { label: 'Workers', href: '/workers', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Attendance', href: '/attendance', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'] },
  { label: 'Corrections', href: '/corrections', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'] },
  { label: 'Reports', href: '/reports', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Users', href: '/users', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
  { label: 'Audit', href: '/audit', roles: ['SUPER_ADMIN', 'SITE_ADMIN'] },
];

export function navForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}
