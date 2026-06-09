import { Permission, roleHasPermission, ROLE_PERMISSIONS } from './permissions';

describe('RBAC permissions', () => {
  it('watchman can mark attendance but cannot edit it', () => {
    expect(roleHasPermission('WATCHMAN', Permission.ATTENDANCE_MARK)).toBe(true);
    expect(roleHasPermission('WATCHMAN', Permission.ATTENDANCE_EDIT)).toBe(false);
    expect(roleHasPermission('WATCHMAN', Permission.PAYROLL_VIEW)).toBe(false);
  });

  it('supervisor can request corrections but not approve them', () => {
    expect(roleHasPermission('SUPERVISOR', Permission.CORRECTION_REQUEST)).toBe(true);
    expect(roleHasPermission('SUPERVISOR', Permission.CORRECTION_APPROVE)).toBe(false);
    expect(roleHasPermission('SUPERVISOR', Permission.ATTENDANCE_EDIT)).toBe(false);
  });

  it('every role can view emergency data', () => {
    (['SUPER_ADMIN', 'SITE_ADMIN', 'WATCHMAN', 'SUPERVISOR'] as const).forEach((role) => {
      expect(roleHasPermission(role, Permission.EMERGENCY_VIEW)).toBe(true);
    });
  });

  it('super admin holds every permission', () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN.length).toBe(Object.values(Permission).length);
  });

  it('only super admin manages organizations', () => {
    expect(roleHasPermission('SUPER_ADMIN', Permission.ORG_MANAGE)).toBe(true);
    expect(roleHasPermission('SITE_ADMIN', Permission.ORG_MANAGE)).toBe(false);
  });
});
