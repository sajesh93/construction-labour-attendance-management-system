/**
 * Exercises the one-off backfill against an in-memory stand-in for the tables it
 * touches. Docker/Postgres isn't available in CI, so this fakes the handful of
 * Prisma calls the script makes rather than mocking away its logic — the real
 * selection predicates, patch building, ordering and hour recomputation all run.
 */
import { replayUnapplied, repairWorkDates } from '../../../prisma/backfill-approved-corrections';

const ORG = 'org1';
const SITE = 'site1';
const SHIFT = 'shift1';
const DAY8 = new Date(Date.UTC(2026, 5, 8));
const DAY9 = new Date(Date.UTC(2026, 5, 9));

const shift = {
  id: SHIFT,
  startTime: new Date(Date.UTC(1970, 0, 1, 9, 0)),
  endTime: new Date(Date.UTC(1970, 0, 1, 18, 0)),
  isOvernight: false,
  lateGraceMinutes: 10,
  earlyGraceMinutes: 10,
  otThresholdMinutes: 30,
};
const site = { id: SITE, organizationId: ORG, timezone: 'Asia/Kolkata' };

type Row = Record<string, any>;

/** Minimal in-memory Prisma stand-in covering only what the backfill calls. */
function makeTx(seed: { sessions: Row[]; requests: Row[] }) {
  const sessions: Row[] = seed.sessions.map((s) => ({ ...s }));
  const requests: Row[] = seed.requests.map((r) => ({ ...r }));
  const audits: Row[] = [];
  let seq = 0;

  const hydrate = (s: Row, include?: Row) => {
    if (!include) return { ...s };
    return {
      ...s,
      ...(include.shift ? { shift: s.shiftId ? shift : null } : {}),
      ...(include.site ? { site } : {}),
      ...(include.worker ? { worker: { workerCode: 'W', fullName: 'Test Worker' } } : {}),
    };
  };

  const tx: any = {
    correctionRequest: {
      findMany: async ({ where, orderBy }: Row) => {
        let out = requests.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.sessionId === null && r.sessionId !== null) return false;
          if (where.sessionId?.not === null && r.sessionId === null) return false;
          return true;
        });
        if (orderBy) {
          out = [...out].sort(
            (a, b) => (a.reviewedAt?.getTime() ?? 0) - (b.reviewedAt?.getTime() ?? 0),
          );
        }
        return out.map((r) => ({
          ...r,
          items: r.items ?? [],
          worker: { workerCode: r.workerCode, fullName: r.workerName },
        }));
      },
      update: async ({ where, data }: Row) => {
        const r = requests.find((x) => x.id === where.id);
        if (!r) throw new Error(`no request ${where.id}`);
        Object.assign(r, data);
        return r;
      },
    },
    attendanceSession: {
      findFirst: async ({ where, orderBy }: Row) => {
        let out = sessions.filter(
          (s) =>
            s.organizationId === where.organizationId &&
            s.workerId === where.workerId &&
            s.workDate.getTime() === where.workDate.getTime(),
        );
        if (orderBy?.loginAt === 'desc') {
          out = [...out].sort((a, b) => b.loginAt.getTime() - a.loginAt.getTime());
        }
        return out[0] ?? null;
      },
      findUnique: async ({ where, include }: Row) => {
        const s = sessions.find((x) => x.id === where.id);
        return s ? hydrate(s, include) : null;
      },
      findUniqueOrThrow: async ({ where, include }: Row) => {
        const s = sessions.find((x) => x.id === where.id);
        if (!s) throw new Error(`no session ${where.id}`);
        return hydrate(s, include);
      },
      create: async ({ data }: Row) => {
        const s = { id: `new${++seq}`, logoutAt: null, ...data };
        sessions.push(s);
        return { ...s };
      },
      update: async ({ where, data }: Row) => {
        const s = sessions.find((x) => x.id === where.id);
        if (!s) throw new Error(`no session ${where.id}`);
        Object.assign(s, data);
        return { ...s };
      },
    },
    site: {
      findFirst: async ({ where }: Row) =>
        where.id === SITE && where.organizationId === ORG
          ? { ...site, settings: { defaultShiftId: SHIFT } }
          : null,
    },
    auditLog: { create: async ({ data }: Row) => audits.push(data) },
  };
  return { tx, sessions, requests, audits };
}

const req = (over: Row): Row => ({
  id: 'r0',
  organizationId: ORG,
  workerId: 'w1',
  siteId: SITE,
  sessionId: null,
  workDate: DAY8,
  type: 'LOGOUT',
  reason: 'FORGOT_CARD',
  status: 'APPROVED',
  reviewedBy: 'admin1',
  reviewedAt: new Date('2026-06-09T05:00:00Z'),
  workerCode: 'W001',
  workerName: 'Test Worker',
  items: [],
  ...over,
});

const session = (over: Row): Row => ({
  id: 's1',
  organizationId: ORG,
  workerId: 'w1',
  siteId: SITE,
  shiftId: SHIFT,
  workDate: DAY8,
  loginAt: new Date('2026-06-08T03:30:00Z'), // 09:00 IST
  logoutAt: null,
  state: 'OPEN',
  ...over,
});

beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
afterAll(() => jest.restoreAllMocks());

describe('backfill: replayUnapplied', () => {
  it('applies a mobile-filed LOGOUT that never reached the session', async () => {
    const { tx, sessions, requests, audits } = makeTx({
      sessions: [session({})],
      requests: [
        req({
          id: 'r1',
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T12:30:00Z' }], // 18:00 IST
        }),
      ],
    });

    const res = await replayUnapplied(tx);

    expect(res).toMatchObject({ applied: 1, created: 0, skipped: 0 });
    const s = sessions[0];
    expect(s.logoutAt).toEqual(new Date('2026-06-08T12:30:00Z'));
    expect(s.state).toBe('CLOSED');
    expect(s.closedReason).toBe('CORRECTION');
    expect(s.workedMinutes).toBe(540); // 09:00 -> 18:00 IST
    // Back-linked, so the row is traceable and a re-run skips it.
    expect(requests[0].sessionId).toBe('s1');
    expect(audits[0]).toMatchObject({
      action: 'CORRECTION_APPROVE_BACKFILL',
      entityId: 's1',
      actorUserId: 'admin1',
    });
  });

  it('creates the session for a MISSING correction that has no row', async () => {
    const { tx, sessions } = makeTx({
      sessions: [],
      requests: [
        req({
          id: 'r2',
          type: 'MISSING',
          items: [
            { field: 'login_at', proposedValue: '2026-06-08T03:30:00Z' },
            { field: 'logout_at', proposedValue: '2026-06-08T12:30:00Z' },
          ],
        }),
      ],
    });

    const res = await replayUnapplied(tx);

    expect(res).toMatchObject({ applied: 1, created: 1 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      workerId: 'w1',
      siteId: SITE,
      shiftId: SHIFT, // from site default
      state: 'CLOSED',
      workedMinutes: 540,
    });
    expect(sessions[0].workDate).toEqual(DAY8);
  });

  it('refiles the session under the corrected login date', async () => {
    const { tx, sessions } = makeTx({
      sessions: [session({})],
      // Login moves to the 9th 09:00 IST — workDate must follow.
      requests: [
        req({
          id: 'r3',
          type: 'LOGIN',
          items: [{ field: 'login_at', proposedValue: '2026-06-09T03:30:00Z' }],
        }),
      ],
    });

    await replayUnapplied(tx);

    expect(sessions[0].workDate).toEqual(DAY9);
  });

  it('never replays a rejected or pending request', async () => {
    const { tx, sessions, requests } = makeTx({
      sessions: [session({})],
      requests: [
        req({
          id: 'r4',
          status: 'REJECTED',
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T23:00:00Z' }],
        }),
        req({
          id: 'r5',
          status: 'PENDING',
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T22:00:00Z' }],
        }),
      ],
    });

    const res = await replayUnapplied(tx);

    expect(res.applied).toBe(0);
    expect(sessions[0].logoutAt).toBeNull();
    expect(requests.every((r) => r.sessionId === null)).toBe(true);
  });

  it('is idempotent — a second run has nothing left to do', async () => {
    const { tx, sessions } = makeTx({
      sessions: [session({})],
      requests: [
        req({ id: 'r6', items: [{ field: 'logout_at', proposedValue: '2026-06-08T12:30:00Z' }] }),
      ],
    });

    const first = await replayUnapplied(tx);
    const second = await replayUnapplied(tx);

    expect(first.applied).toBe(1);
    expect(second.applied).toBe(0); // back-link excludes it from the predicate
    expect(sessions).toHaveLength(1); // no duplicate session
  });

  it('skips rather than guesses when there is no session and no proposed login', async () => {
    const { tx, sessions } = makeTx({
      sessions: [],
      requests: [
        req({ id: 'r7', items: [{ field: 'logout_at', proposedValue: '2026-06-08T12:30:00Z' }] }),
      ],
    });

    const res = await replayUnapplied(tx);

    expect(res).toMatchObject({ applied: 0, created: 0, skipped: 1 });
    expect(sessions).toHaveLength(0);
  });

  it('composes multiple corrections in approval order', async () => {
    const { tx, sessions } = makeTx({
      sessions: [session({})],
      requests: [
        // Deliberately out of order in the table; the later approval must win.
        req({
          id: 'late',
          reviewedAt: new Date('2026-06-09T09:00:00Z'),
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T13:30:00Z' }],
        }),
        req({
          id: 'early',
          reviewedAt: new Date('2026-06-09T05:00:00Z'),
          items: [{ field: 'logout_at', proposedValue: '2026-06-08T12:30:00Z' }],
        }),
      ],
    });

    await replayUnapplied(tx);

    expect(sessions[0].logoutAt).toEqual(new Date('2026-06-08T13:30:00Z')); // 19:00 IST
    expect(sessions[0].workedMinutes).toBe(600);
  });
});

describe('backfill: repairWorkDates', () => {
  it('realigns a stale workDate left by an applied correction', async () => {
    const { tx, sessions, audits } = makeTx({
      // Correction applied under the old code: loginAt moved to the 9th, workDate stuck on the 8th.
      sessions: [
        session({
          loginAt: new Date('2026-06-09T03:30:00Z'),
          logoutAt: new Date('2026-06-09T12:30:00Z'),
          state: 'CLOSED',
          workDate: DAY8,
        }),
      ],
      requests: [req({ id: 'r8', sessionId: 's1' })],
    });

    const fixed = await repairWorkDates(tx);

    expect(fixed).toBe(1);
    expect(sessions[0].workDate).toEqual(DAY9);
    expect(audits[0]).toMatchObject({ action: 'CORRECTION_WORKDATE_BACKFILL', entityId: 's1' });
  });

  it('leaves a correct workDate alone', async () => {
    const { tx, audits } = makeTx({
      sessions: [session({})], // login 09:00 IST on the 8th, workDate the 8th
      requests: [req({ id: 'r9', sessionId: 's1' })],
    });

    expect(await repairWorkDates(tx)).toBe(0);
    expect(audits).toHaveLength(0);
  });
});
