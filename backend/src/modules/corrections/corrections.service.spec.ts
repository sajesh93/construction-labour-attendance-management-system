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

  it('does not mutate attendance when rejecting', async () => {
    const prisma: any = {
      correctionRequest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1', status: 'PENDING', organizationId: 'org1' }),
        update: jest.fn().mockResolvedValue({ id: 'c1', status: 'REJECTED' }),
      },
    };
    const audit: any = { record: jest.fn() };
    const svc = new CorrectionsService(prisma, audit);
    const res = await svc.reject(user, 'c1', { reviewNotes: 'invalid' });
    expect(res.status).toBe('REJECTED');
  });
});
