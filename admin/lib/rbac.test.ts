import { describe, it, expect } from 'vitest';
import { navForRole } from './rbac';

describe('navForRole', () => {
  it('gives super admin every nav item', () => {
    const labels = navForRole('SUPER_ADMIN').map((i) => i.label);
    expect(labels).not.toContain('Organizations');
    expect(labels).toContain('Workers');
    expect(labels).toContain('Audit');
  });

  it('gives site admin everything but organizations', () => {
    const labels = navForRole('SITE_ADMIN').map((i) => i.label);
    expect(labels).not.toContain('Organizations');
    expect(labels).toContain('Sites');
    expect(labels).toContain('Vendors');
  });

  it('gives the safety officer operations and people, not administration', () => {
    const labels = navForRole('SUPERVISOR').map((i) => i.label);
    for (const allowed of [
      'Dashboard',
      'Attendance',
      'Corrections',
      'Reports',
      'Workers',
      'Staff',
      'Visitors',
      'Sites',
      'Vendors',
      'Designations',
    ]) {
      expect(labels).toContain(allowed);
    }
    for (const denied of ['Users', 'Devices', 'Company', 'Storage', 'Audit']) {
      expect(labels).not.toContain(denied);
    }
  });

  it('keeps the watchman out of the admin panel', () => {
    expect(navForRole('WATCHMAN')).toHaveLength(0);
  });
});
