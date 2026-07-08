import { UserRole } from './types';

export type NavGroup = 'Overview' | 'Operations' | 'People' | 'Sites & partners' | 'Administration';

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'], group: 'Overview' },
  { label: 'Attendance', href: '/attendance', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'], group: 'Operations' },
  { label: 'Corrections', href: '/corrections', roles: ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'], group: 'Operations' },
  { label: 'Reports', href: '/reports', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Operations' },
  { label: 'Workers', href: '/workers', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'People' },
  { label: 'Staff', href: '/staff', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'People' },
  { label: 'Visitors', href: '/visitors', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'People' },
  { label: 'Sites', href: '/sites', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Sites & partners' },
  { label: 'Vendors', href: '/vendors', roles: ['SUPER_ADMIN'], group: 'Sites & partners' },
  { label: 'Designations', href: '/designations', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Sites & partners' },
  { label: 'Users', href: '/users', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Administration' },
  { label: 'Devices', href: '/devices', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Administration' },
  { label: 'Company', href: '/company', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Administration' },
  { label: 'Storage', href: '/storage', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Administration' },
  { label: 'Audit', href: '/audit', roles: ['SUPER_ADMIN', 'SITE_ADMIN'], group: 'Administration' },
];

export function navForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

/**
 * Display labels — enum values are kept for DB compatibility, but the UI says
 * "Admin" for SITE_ADMIN and "Safety Officer" for SUPERVISOR everywhere.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SITE_ADMIN: 'Admin',
  WATCHMAN: 'Watchman',
  SUPERVISOR: 'Safety Officer',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}
