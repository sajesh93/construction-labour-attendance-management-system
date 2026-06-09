import { decideTap, distanceMeters, shouldVerifyPhoto } from './tap-decision';

describe('decideTap', () => {
  const t = (iso: string) => new Date(iso);

  it('opens a LOGIN when no open session and no recent tap', () => {
    const d = decideTap(t('2026-06-09T08:00:00Z'), 30, null, null);
    expect(d.action).toBe('LOGIN');
  });

  it('closes via LOGOUT when an open session exists', () => {
    const d = decideTap(t('2026-06-09T17:00:00Z'), 30, { id: 's1', loginAt: t('2026-06-09T08:00:00Z'), siteId: 'site1' }, {
      clientEventTime: t('2026-06-09T08:00:00Z'),
      tapType: 'LOGIN',
    });
    expect(d).toEqual({ action: 'LOGOUT', sessionId: 's1' });
  });

  it('rejects a duplicate tap inside the cooldown window', () => {
    const d = decideTap(t('2026-06-09T08:00:10Z'), 30, null, {
      clientEventTime: t('2026-06-09T08:00:00Z'),
      tapType: 'LOGIN',
    });
    expect(d.action).toBe('DUPLICATE');
    if (d.action === 'DUPLICATE') expect(d.cooldownRemainingSeconds).toBe(20);
  });

  it('allows a tap exactly at the cooldown boundary', () => {
    const d = decideTap(t('2026-06-09T08:00:30Z'), 30, null, {
      clientEventTime: t('2026-06-09T08:00:00Z'),
      tapType: 'LOGIN',
    });
    expect(d.action).toBe('LOGIN');
  });
});

describe('distanceMeters', () => {
  it('is ~0 for identical points', () => {
    expect(distanceMeters(12.97, 77.59, 12.97, 77.59)).toBeLessThan(1);
  });

  it('computes a known distance within tolerance', () => {
    // ~111 km per degree of latitude.
    const d = distanceMeters(12.0, 77.0, 13.0, 77.0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});

describe('shouldVerifyPhoto', () => {
  it('ALWAYS always triggers', () => {
    expect(shouldVerifyPhoto('ALWAYS', 0, 99)).toBe(true);
  });
  it('NEVER never triggers', () => {
    expect(shouldVerifyPhoto('NEVER', 100, 0)).toBe(false);
  });
  it('RANDOM triggers below the percentage', () => {
    expect(shouldVerifyPhoto('RANDOM', 20, 19)).toBe(true);
    expect(shouldVerifyPhoto('RANDOM', 20, 20)).toBe(false);
  });
});
