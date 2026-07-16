/**
 * One-time backfill: replay correction approvals that never reached attendance.
 *
 * Two defects made approved corrections invisible in attendance and reports:
 *
 *   1. Requests filed from the mobile app carry no sessionId, and the old
 *      approve() wrapped its whole apply block in `if (req.sessionId)`. Those
 *      approvals changed nothing. They are identifiable after the fact because
 *      they are APPROVED with a null sessionId.
 *   2. approve() wrote loginAt but never recomputed workDate, which is the
 *      column attendance and reports actually filter on. A correction that moved
 *      a login across a day boundary left the session filed under the old date.
 *
 * This replays (1) through the fixed logic and repairs (2) for sessions an
 * approved correction touched. Both passes are idempotent.
 *
 * DRY RUN BY DEFAULT — prints what it would do and rolls back. Pass --apply to
 * commit. Requires DATABASE_URL in env. From backend/:
 *
 *   DATABASE_URL=... npx ts-node prisma/backfill-approved-corrections.ts
 *   DATABASE_URL=... npx ts-node prisma/backfill-approved-corrections.ts --apply
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { computeWorkHours, ShiftConfig } from '../src/modules/attendance/engine/work-hours.engine';
import { businessDate, minutesOfDay } from '../src/common/time/time.util';

const APPLY = process.argv.includes('--apply');

/** Thrown to roll back the dry-run transaction. */
class Rollback extends Error {}

type Tx = Prisma.TransactionClient;

const shiftConfigOf = (
  shift: {
    startTime: Date;
    endTime: Date;
    isOvernight: boolean;
    lateGraceMinutes: number;
    earlyGraceMinutes: number;
    otThresholdMinutes: number;
  } | null,
): ShiftConfig | undefined =>
  shift
    ? {
        startTimeMinutes: minutesOfDay(shift.startTime),
        endTimeMinutes: minutesOfDay(shift.endTime),
        isOvernight: shift.isOvernight,
        lateGraceMinutes: shift.lateGraceMinutes,
        earlyGraceMinutes: shift.earlyGraceMinutes,
        otThresholdMinutes: shift.otThresholdMinutes,
      }
    : undefined;

/** Recompute workDate + hours for a session after its login/logout changed. */
async function settle(tx: Tx, sessionId: string) {
  const s = await tx.attendanceSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { shift: true, site: true },
  });

  const workDate = businessDate(s.loginAt, s.site.timezone);
  const data: Prisma.AttendanceSessionUncheckedUpdateInput = {};
  if (workDate.getTime() !== s.workDate.getTime()) data.workDate = workDate;

  if (s.logoutAt) {
    const hours = computeWorkHours(s.loginAt, s.logoutAt, s.site.timezone, shiftConfigOf(s.shift));
    data.state = 'CLOSED';
    data.workedMinutes = hours.workedMinutes;
    data.overtimeMinutes = hours.overtimeMinutes;
    data.lateMinutes = hours.lateMinutes;
    data.earlyLeaveMinutes = hours.earlyLeaveMinutes;
    data.closedReason = 'CORRECTION';
  }

  if (Object.keys(data).length) {
    await tx.attendanceSession.update({ where: { id: sessionId }, data });
  }
  return { workDateChanged: data.workDate !== undefined, workDate };
}

/** Pass 1 — replay approvals that never touched a session. */
async function replayUnapplied(tx: Tx) {
  // APPROVED + no sessionId is exactly the never-applied set: the old code only
  // ever ran when sessionId was set, and never wrote sessionId back.
  const reqs = await tx.correctionRequest.findMany({
    where: { status: 'APPROVED', sessionId: null },
    include: { items: true, worker: { select: { fullName: true, workerCode: true } } },
    // Oldest approval first, so several corrections to one session compose in
    // the order the admin actually approved them.
    orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`\nPass 1 — approvals that never applied: ${reqs.length} request(s)\n`);
  let applied = 0;
  let created = 0;
  const skipped: string[] = [];

  for (const req of reqs) {
    const who = `${req.worker.workerCode} ${req.worker.fullName}`;
    const day = req.workDate.toISOString().slice(0, 10);
    const label = `  [${req.id.slice(0, 8)}] ${who} ${day} ${req.type}`;

    const patch: Prisma.AttendanceSessionUncheckedUpdateInput = {};
    let bad = false;
    for (const item of req.items) {
      const v = item.proposedValue as unknown;
      switch (item.field) {
        case 'login_at':
          patch.loginAt = new Date(v as string);
          break;
        case 'logout_at':
          patch.logoutAt = new Date(v as string);
          break;
        case 'site_id':
          patch.siteId = v as string;
          break;
        case 'shift_id':
          patch.shiftId = v as string;
          break;
        default:
          skipped.push(`${label} — unsupported field "${item.field}"`);
          bad = true;
      }
      if (bad) break;
    }
    if (bad) continue;

    if (!Object.keys(patch).length) {
      // Nothing was ever proposed (e.g. a WRONG_SITE filed with no items) —
      // there is no change to replay, so just close it out as a no-op.
      skipped.push(`${label} — request has no proposed changes`);
      continue;
    }

    let session = await tx.attendanceSession.findFirst({
      where: { organizationId: req.organizationId, workerId: req.workerId, workDate: req.workDate },
      orderBy: { loginAt: 'desc' },
    });

    if (!session) {
      if (!patch.loginAt) {
        skipped.push(`${label} — no session for that day and no proposed login time`);
        continue;
      }
      const site = await tx.site.findFirst({
        where: { id: req.siteId, organizationId: req.organizationId },
        include: { settings: true },
      });
      if (!site) {
        skipped.push(`${label} — site ${req.siteId} not found`);
        continue;
      }
      session = await tx.attendanceSession.create({
        data: {
          organizationId: req.organizationId,
          workerId: req.workerId,
          siteId: req.siteId,
          shiftId: site.settings?.defaultShiftId ?? null,
          workDate: req.workDate,
          loginAt: patch.loginAt as Date,
          state: 'OPEN',
        },
      });
      created++;
      console.log(`${label} — CREATE session ${session.id.slice(0, 8)}`);
    } else {
      console.log(`${label} — PATCH session ${session.id.slice(0, 8)}`);
    }

    const before = {
      loginAt: session.loginAt,
      logoutAt: session.logoutAt,
      siteId: session.siteId,
      shiftId: session.shiftId,
      workDate: session.workDate,
    };

    await tx.attendanceSession.update({ where: { id: session.id }, data: patch });
    await settle(tx, session.id);

    const after = await tx.attendanceSession.findUniqueOrThrow({ where: { id: session.id } });
    console.log(
      `      login ${before.loginAt.toISOString()} -> ${after.loginAt.toISOString()}\n` +
        `      logout ${before.logoutAt?.toISOString() ?? '—'} -> ${after.logoutAt?.toISOString() ?? '—'}\n` +
        `      workDate ${before.workDate.toISOString().slice(0, 10)} -> ${after.workDate.toISOString().slice(0, 10)}`,
    );

    // Back-link so the request is traceable to the row it changed — and so a
    // re-run of this script skips it.
    await tx.correctionRequest.update({
      where: { id: req.id },
      data: { sessionId: session.id },
    });

    // Attribute to the admin who originally approved it; the reason marks it as
    // a replay rather than a fresh decision.
    await tx.auditLog.create({
      data: {
        organizationId: req.organizationId,
        actorUserId: req.reviewedBy,
        action: 'CORRECTION_APPROVE_BACKFILL',
        entityType: 'AttendanceSession',
        entityId: session.id,
        oldValue: before as unknown as Prisma.InputJsonValue,
        newValue: {
          loginAt: after.loginAt,
          logoutAt: after.logoutAt,
          siteId: after.siteId,
          shiftId: after.shiftId,
          workDate: after.workDate,
        } as unknown as Prisma.InputJsonValue,
        reason: `Backfill replay of correction ${req.id} approved ${req.reviewedAt?.toISOString() ?? '?'} that never reached attendance`,
      },
    });
    applied++;
  }

  console.log(
    `\n  Pass 1: ${applied} replayed (${created} session(s) created), ${skipped.length} skipped.`,
  );
  if (skipped.length) {
    console.log('  Skipped — need a human decision:');
    skipped.forEach((s) => console.log(`   ${s}`));
  }
  return { applied, created, skipped: skipped.length };
}

/** Pass 2 — repair stale workDate on sessions an approved correction did touch. */
async function repairWorkDates(tx: Tx) {
  const linked = await tx.correctionRequest.findMany({
    where: { status: 'APPROVED', sessionId: { not: null } },
    select: { sessionId: true },
  });
  const ids = [...new Set(linked.map((r) => r.sessionId as string))];

  console.log(`\nPass 2 — workDate check on ${ids.length} correction-touched session(s)\n`);
  let fixed = 0;
  for (const id of ids) {
    const s = await tx.attendanceSession.findUnique({
      where: { id },
      include: { site: true, worker: { select: { fullName: true, workerCode: true } } },
    });
    if (!s) continue;
    const want = businessDate(s.loginAt, s.site.timezone);
    if (want.getTime() === s.workDate.getTime()) continue;

    console.log(
      `  [${id.slice(0, 8)}] ${s.worker.workerCode} ${s.worker.fullName} — workDate ` +
        `${s.workDate.toISOString().slice(0, 10)} -> ${want.toISOString().slice(0, 10)}`,
    );
    await tx.attendanceSession.update({ where: { id }, data: { workDate: want } });
    await tx.auditLog.create({
      data: {
        organizationId: s.organizationId,
        action: 'CORRECTION_WORKDATE_BACKFILL',
        entityType: 'AttendanceSession',
        entityId: id,
        oldValue: { workDate: s.workDate } as unknown as Prisma.InputJsonValue,
        newValue: { workDate: want } as unknown as Prisma.InputJsonValue,
        reason: 'Backfill: workDate realigned to the corrected login time',
      },
    });
    fixed++;
  }
  console.log(`\n  Pass 2: ${fixed} workDate(s) realigned.`);
  return fixed;
}

async function main() {
  const prisma = new PrismaClient();
  console.log(APPLY ? '=== APPLY — changes will be committed ===' : '=== DRY RUN — no writes ===');

  try {
    await prisma.$transaction(
      async (tx) => {
        await replayUnapplied(tx);
        await repairWorkDates(tx);
        if (!APPLY) throw new Rollback();
      },
      { timeout: 600_000, maxWait: 30_000 },
    );
    console.log('\nCommitted.');
  } catch (e) {
    if (e instanceof Rollback) {
      console.log('\nDry run rolled back. Re-run with --apply to commit.');
    } else {
      throw e;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
