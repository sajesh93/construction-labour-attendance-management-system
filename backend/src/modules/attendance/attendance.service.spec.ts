import { AttendanceService } from './attendance.service';
import { TapSource } from '@prisma/client';

function makeDto(over: Partial<any> = {}) {
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    siteId: 'site-1',
    deviceId: 'dev-1',
    source: TapSource.NFC_UID,
    identifier: '04AABBCC',
    clientEventTime: '2026-06-09T02:30:00Z',
    ...over,
  } as any;
}

const baseWorker = { id: 'w1', fullName: 'Ramesh', photoUrl: null, bloodGroup: 'B+', emergencyContactName: 'S', emergencyContactNumber: '9', deletedAt: null };
const baseSite = { id: 'site-1', timezone: 'Asia/Kolkata', latitude: null, longitude: null, settings: { siteId: 'site-1', verificationMode: 'AUTO', autoLoginCountdownSeconds: 10, duplicateTapCooldownSeconds: 30, geoEnforcement: false, geoRadiusMeters: 200, photoVerificationMode: 'NEVER', photoVerificationRandomPct: 0, defaultShiftId: null, updatedAt: new Date() } };

function buildService(prismaOver: any) {
  const prisma: any = {
    attendanceTap: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'tap-1' }), findFirst: jest.fn().mockResolvedValue(null) },
    site: { findFirst: jest.fn().mockResolvedValue(baseSite), findUnique: jest.fn().mockResolvedValue(baseSite) },
    worker: { findFirst: jest.fn().mockResolvedValue(baseWorker) },
    attendanceSession: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'sess-1', loginAt: new Date('2026-06-09T02:30:00Z') }), update: jest.fn(), findUnique: jest.fn() },
    ...prismaOver,
  };
  const redis: any = { acquireLock: jest.fn().mockResolvedValue('tok'), releaseLock: jest.fn() };
  const audit: any = { record: jest.fn() };
  return { svc: new AttendanceService(prisma, redis, audit), prisma };
}

describe('AttendanceService.handleTap', () => {
  it('returns IDEMPOTENT_REPLAY for an already-seen eventId', async () => {
    const { svc } = buildService({
      attendanceTap: { findUnique: jest.fn().mockResolvedValue({ id: 'tap-x', eventId: 'e', tapType: 'LOGIN' }) },
    });
    const res = await svc.handleTap('org-1', makeDto(), { deviceId: 'dev-1' });
    expect(res.result).toBe('IDEMPOTENT_REPLAY');
  });

  it('records a LOGIN in AUTO mode (creates an open session)', async () => {
    const { svc, prisma } = buildService({});
    const res = await svc.handleTap('org-1', makeDto(), { deviceId: 'dev-1', photoRoll: 99 });
    expect(res.result).toBe('LOGIN_RECORDED');
    expect(prisma.attendanceSession.create).toHaveBeenCalled();
  });

  it('records a LOGOUT when an open session exists', async () => {
    const open = { id: 'sess-1', loginAt: new Date('2026-06-09T02:30:00Z'), siteId: 'site-1', shift: null };
    const { svc } = buildService({
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue(open),
        findUnique: jest.fn().mockResolvedValue(open),
        update: jest.fn().mockResolvedValue({ id: 'sess-1', workedMinutes: 540, overtimeMinutes: 0, logoutAt: new Date() }),
        create: jest.fn(),
      },
    });
    const res = await svc.handleTap('org-1', makeDto({ clientEventTime: '2026-06-09T11:30:00Z' }), { deviceId: 'dev-1' });
    expect(res.result).toBe('LOGOUT_RECORDED');
    expect((res as any).workedMinutes).toBe(540);
  });

  it('rejects a duplicate tap inside the cooldown window', async () => {
    const lastTap = { clientEventTime: new Date('2026-06-09T02:30:00Z'), tapType: 'LOGIN' };
    const { svc } = buildService({
      attendanceTap: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(lastTap),
      },
    });
    await expect(
      svc.handleTap('org-1', makeDto({ clientEventTime: '2026-06-09T02:30:10Z' }), { deviceId: 'dev-1' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TAP' });
  });
});
