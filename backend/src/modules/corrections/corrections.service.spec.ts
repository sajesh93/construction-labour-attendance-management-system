import { CorrectionsService } from './corrections.service';

const user: any = { userId: 'u1', organizationId: 'org1', role: 'SITE_ADMIN', siteScopes: [] };

describe('CorrectionsService.approve (approval gate)', () => {
  it('aborts with CONFLICT when the session changed after the request was filed', async () => {
    const requestCreatedAt = new Date('2026-06-08T10:00:00Z');
    const sessionUpdatedAt = new Date('2026-06-08T12:00:00Z'); // later → stale request

    const tx: any = {
      correctionRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          status: 'PENDING',
          sessionId: 's1',
          createdAt: requestCreatedAt,
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T11:00:00Z' }],
        }),
        update: jest.fn(),
      },
      attendanceSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          updatedAt: sessionUpdatedAt,
          loginAt: new Date(),
          logoutAt: null,
          siteId: 's',
          shiftId: null,
        }),
        update: jest.fn(),
      },
    };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    const audit: any = { record: jest.fn() };
    const svc = new CorrectionsService(prisma, audit);

    await expect(svc.approve(user, 'c1', {})).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.correctionRequest.update).not.toHaveBeenCalled();
  });

  it('resolves the session by worker + work date when the request has no sessionId', async () => {
    const workDate = new Date(Date.UTC(2026, 5, 8));
    const session = {
      id: 's1',
      updatedAt: new Date('2026-06-08T12:00:00Z'),
      loginAt: new Date('2026-06-08T03:30:00Z'), // 09:00 IST
      logoutAt: null,
      siteId: 'site1',
      shiftId: null,
      workDate,
      shift: null,
      site: { timezone: 'Asia/Kolkata' },
    };
    const tx: any = {
      correctionRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          status: 'PENDING',
          organizationId: 'org1',
          workerId: 'w1',
          siteId: 'site1',
          sessionId: null, // mobile-filed request
          workDate,
          createdAt: new Date('2026-06-08T10:00:00Z'),
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T12:30:00Z' }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'c1', status: 'APPROVED' }),
      },
      attendanceSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(session),
        create: jest.fn(),
        update: jest
          .fn()
          .mockResolvedValue({ ...session, logoutAt: new Date('2026-06-08T12:30:00Z') }),
      },
    };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    const audit: any = { record: jest.fn() };
    const svc = new CorrectionsService(prisma, audit);

    const res = await svc.approve(user, 'c1', {});

    expect(res.status).toBe('APPROVED');
    // The session was located without a pinned id and actually patched.
    expect(tx.attendanceSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1', workerId: 'w1', workDate },
      }),
    );
    expect(tx.attendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({ logoutAt: new Date('2026-06-08T12:30:00Z') }),
      }),
    );
    // ...and the approved request is back-linked to the row it changed.
    expect(tx.correctionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sessionId: 's1' }) }),
    );
  });

  it('refiles the session under the corrected login date', async () => {
    const workDate = new Date(Date.UTC(2026, 5, 8));
    const session = {
      id: 's1',
      updatedAt: new Date('2026-06-08T12:00:00Z'),
      loginAt: new Date('2026-06-08T03:30:00Z'),
      logoutAt: null,
      siteId: 'site1',
      shiftId: null,
      workDate,
      shift: null,
      site: { timezone: 'Asia/Kolkata' },
    };
    // Correction moves login to 2026-06-09 09:00 IST → work date must follow.
    const correctedLogin = new Date('2026-06-09T03:30:00Z');
    const tx: any = {
      correctionRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          status: 'PENDING',
          organizationId: 'org1',
          workerId: 'w1',
          siteId: 'site1',
          sessionId: null,
          workDate,
          createdAt: new Date('2026-06-09T10:00:00Z'),
          items: [{ field: 'login_at', proposedValue: correctedLogin.toISOString() }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'c1', status: 'APPROVED' }),
      },
      attendanceSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(session),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...session, loginAt: correctedLogin }),
      },
    };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    const audit: any = { record: jest.fn() };
    const svc = new CorrectionsService(prisma, audit);

    await svc.approve(user, 'c1', {});

    expect(tx.attendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { workDate: new Date(Date.UTC(2026, 5, 9)) } }),
    );
  });

  it('does not mutate attendance when rejecting', async () => {
    const prisma: any = {
      correctionRequest: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'c1', status: 'PENDING', organizationId: 'org1' }),
        update: jest.fn().mockResolvedValue({ id: 'c1', status: 'REJECTED' }),
      },
    };
    const audit: any = { record: jest.fn() };
    const svc = new CorrectionsService(prisma, audit);
    const res = await svc.reject(user, 'c1', { reviewNotes: 'invalid' });
    expect(res.status).toBe('REJECTED');
  });
});
