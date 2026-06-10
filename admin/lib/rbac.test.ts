import { describe, it, expect } from 'vitest';
import { navForRole } from './rbac';

describe('navForRole', () => {
  it('gives super admin every nav item', () => {
    const labels = navForRole('SUPER_ADMIN').map((i) => i.label);
    expect(labels).not.toContain('Organizations');
    expect(labels).toContain('Workers');
    expect(labels).toContain('Audit');
  });

  it('hides vendors from site admin', () => {
    const labels = navForRole('SITE_ADMIN').map((i) => i.label);
    expect(labels).not.toContain('Organizations');
    expect(labels).not.toContain('Vendors');
    expect(labels).toContain('Sites');
  });

  it('limits supervisor to read/summary views', () => {
    const labels = navForRole('SUPERVISOR').map((i) => i.label);
    expect(labels).toContain('Attendance');
    expect(labels).toContain('Corrections');
    expect(labels).not.toContain('Workers');
    expect(labels).not.toContain('Users');
  });
});
