import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { businessDate } from '../../common/time/time.util';
import { computeWorkHours, ShiftConfig } from './engine/work-hours.engine';
import { BulkLogoutDto, EditSessionDto } from './dto/session-admin.dto';

/** A session as the fix panel shows it. */
const SESSION_SELECT = {
  id: true,
  workerId: true,
  siteId: true,
  workDate: true,
  loginAt: true,
  logoutAt: true,
  state: true,
  workedMinutes: true,
  overtimeMinutes: true,
  closedReason: true,
  loginTapId: true,
  logoutTapId: true,
  worker: {
    select: {
      id: true,
      fullName: true,
      workerCode: true,
      category: true,
      designation: { select: { name: true } },
      vendor: { select: { name: true } },
    },
  },
  site: { select: { id: true, name: true, timezone: true } },
} as const;

/**
 * Super-admin repairs to attendance records.
 *
 * The watchmen scan people in and out, and the scans are sometimes wrong: the
 * wrong card gets tapped, someone re-scans after already leaving, or a shift
 * ends without anyone scanning out at all. This service is the escape hatch —
 * every method is gated on ATTENDANCE_EDIT (SUPER_ADMIN only) and writes an
 * audit row carrying the before/after and the operator's stated reason.
 *
 * Taps are deliberately left alone. They are the raw evidence of what the
 * scanner saw; only the derived session is corrected, so the audit trail can
 * still show the original scan next to the fix.
 */
@Injectable()
export class SessionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Sites this user may touch; SUPER_ADMIN is unscoped. */
  private scope(user: AuthUser) {
    return user.role !== 'SUPER_ADMIN' && user.siteScopes.length > 0
      ? { siteId: { in: user.siteScopes } }
      : {};
  }

  private async orgTimezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone ?? 'Asia/Kolkata';
  }

  /** Everyone recorded on a given work date — open and closed alike. */
  async day(user: AuthUser, date?: string, siteId?: string) {
    const tz = await this.orgTimezone(user.organizationId);
    const workDate = date ? new Date(`${date}T00:00:00.000Z`) : businessDate(new Date(), tz);
    if (Number.isNaN(workDate.getTime())) throw Errors.businessRule('Invalid date');

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        workDate,
        ...this.scope(user),
        ...(siteId && siteId !== 'all' ? { siteId } : {}),
      },
      select: SESSION_SELECT,
      orderBy: [{ worker: { workerCode: 'asc' } }, { loginAt: 'asc' }],
    });

    // A worker with two rows on one day is nearly always a mis-scan, so flag it
    // for the operator rather than making them spot it in a long table.
    const seen = new Map<string, number>();
    for (const s of sessions) seen.set(s.workerId, (seen.get(s.workerId) ?? 0) + 1);

    return {
      date: workDate.toISOString().slice(0, 10),
      timezone: tz,
      sessions: sessions.map((s) => ({ ...s, isDuplicate: (seen.get(s.workerId) ?? 0) > 1 })),
      openCount: sessions.filter((s) => s.state === 'OPEN').length,
    };
  }

  private async loadSession(user: AuthUser, id: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id, organizationId: user.organizationId, ...this.scope(user) },
      select: SESSION_SELECT,
    });
    if (!session) throw Errors.notFound('Attendance session');
    return session;
  }

  /** The shift's rules, so a corrected session is scored like a scanned one. */
  private async shiftConfig(shiftId: string | null): Promise<ShiftConfig | undefined> {
    if (!shiftId) return undefined;
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return undefined;
    const mins = (t: Date) => t.getUTCHours() * 60 + t.getUTCMinutes();
    return {
      startTimeMinutes: mins(shift.startTime),
      endTimeMinutes: mins(shift.endTime),
      isOvernight: shift.isOvernight,
      lateGraceMinutes: shift.lateGraceMinutes,
      earlyGraceMinutes: shift.earlyGraceMinutes,
      otThresholdMinutes: shift.otThresholdMinutes,
    };
  }

  /**
   * Change who a session belongs to and/or when it started and ended.
   *
   * Both edits land in one call because they are usually one story: "that was
   * the wrong man, and he left at six" is a single correction to the operator
   * even though it touches two columns.
   */
  async edit(user: AuthUser, id: string, dto: EditSessionDto) {
    const session = await this.loadSession(user, id);
    const full = await this.prisma.attendanceSession.findUniqueOrThrow({
      where: { id },
      select: { shiftId: true },
    });

    const loginAt = dto.loginAt ? new Date(dto.loginAt) : session.loginAt;
    const logoutAt =
      dto.logoutAt === undefined ? session.logoutAt : dto.logoutAt ? new Date(dto.logoutAt) : null;

    if (Number.isNaN(loginAt.getTime())) throw Errors.businessRule('Invalid login time');
    if (logoutAt && Number.isNaN(logoutAt.getTime()))
      throw Errors.businessRule('Invalid logout time');
    if (logoutAt && logoutAt <= loginAt)
      throw Errors.businessRule('The logout time must be after the login time');

    let workerId = session.workerId;
    if (dto.workerId && dto.workerId !== session.workerId) {
      const target = await this.prisma.worker.findFirst({
        where: { id: dto.workerId, organizationId: user.organizationId, deletedAt: null },
        select: { id: true, fullName: true, workerCode: true },
      });
      if (!target) throw Errors.notFound('Worker');

      // One OPEN session per worker is a DB constraint; catching it here lets us
      // say which record is in the way instead of surfacing a Postgres error.
      const clash = await this.prisma.attendanceSession.findFirst({
        where: {
          workerId: target.id,
          workDate: session.workDate,
          id: { not: session.id },
          ...(logoutAt === null ? { state: 'OPEN' } : {}),
        },
        select: { id: true, state: true, loginAt: true },
      });
      if (clash) {
        throw Errors.businessRule(
          `${target.workerCode} ${target.fullName} already has ${
            clash.state === 'OPEN' ? 'an open session' : 'a session'
          } on this day. Delete or fix that record first.`,
        );
      }
      workerId = target.id;
    }

    const hours = logoutAt
      ? computeWorkHours(
          loginAt,
          logoutAt,
          session.site?.timezone ?? 'Asia/Kolkata',
          await this.shiftConfig(full.shiftId),
        )
      : null;

    const updated = await this.prisma.attendanceSession.update({
      where: { id },
      data: {
        workerId,
        loginAt,
        logoutAt,
        state: logoutAt ? 'CLOSED' : 'OPEN',
        workedMinutes: hours?.workedMinutes ?? null,
        overtimeMinutes: hours?.overtimeMinutes ?? null,
        lateMinutes: hours?.lateMinutes ?? null,
        earlyLeaveMinutes: hours?.earlyLeaveMinutes ?? null,
        ...(logoutAt && session.state === 'OPEN' ? { closedReason: 'ADMIN_EDIT' } : {}),
      },
      select: SESSION_SELECT,
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'ATTENDANCE_SESSION_EDIT',
      entityType: 'AttendanceSession',
      entityId: id,
      oldValue: {
        workerId: session.workerId,
        workerCode: session.worker.workerCode,
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        state: session.state,
        workedMinutes: session.workedMinutes,
      },
      newValue: {
        workerId: updated.workerId,
        workerCode: updated.worker.workerCode,
        loginAt: updated.loginAt,
        logoutAt: updated.logoutAt,
        state: updated.state,
        workedMinutes: updated.workedMinutes,
      },
      reason: dto.reason,
    });

    return updated;
  }

  /**
   * Remove a session outright — for the person who was never on site, or the
   * phantom row a duplicate scan created.
   */
  async remove(user: AuthUser, id: string, reason: string) {
    const session = await this.loadSession(user, id);

    await this.prisma.attendanceSession.delete({ where: { id } });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'ATTENDANCE_SESSION_DELETE',
      entityType: 'AttendanceSession',
      entityId: id,
      oldValue: {
        workerId: session.workerId,
        workerCode: session.worker.workerCode,
        workerName: session.worker.fullName,
        workDate: session.workDate,
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        state: session.state,
      },
      newValue: null,
      reason,
    });

    return { deleted: true, id };
  }

  /**
   * Close everyone still open on a day at one chosen clock time — the end-of-
   * shift sweep for when the gate closes and nobody scanned out.
   *
   * Sessions that started *after* the chosen time can't take it without going
   * negative, so they are reported back as skipped rather than failing the whole
   * sweep. `dryRun` returns the same shape without writing, which is what the
   * confirmation dialog previews.
   */
  async bulkLogout(user: AuthUser, dto: BulkLogoutDto) {
    const tz = await this.orgTimezone(user.organizationId);
    const workDate = dto.date
      ? new Date(`${dto.date}T00:00:00.000Z`)
      : businessDate(new Date(), tz);
    if (Number.isNaN(workDate.getTime())) throw Errors.businessRule('Invalid date');

    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(dto.time);
    if (!match) throw Errors.businessRule('Give the logout time as HH:mm, for example 18:05');

    const open = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        workDate,
        state: 'OPEN',
        ...this.scope(user),
        ...(dto.siteId && dto.siteId !== 'all' ? { siteId: dto.siteId } : {}),
        ...(dto.sessionIds?.length ? { id: { in: dto.sessionIds } } : {}),
      },
      select: { ...SESSION_SELECT, shiftId: true },
      orderBy: [{ worker: { workerCode: 'asc' } }],
    });

    const closed: Array<{
      id: string;
      workerCode: string;
      fullName: string;
      loginAt: Date;
      logoutAt: Date;
      workedMinutes: number;
      overtimeMinutes: number;
    }> = [];
    const skipped: Array<{ id: string; workerCode: string; fullName: string; reason: string }> = [];

    for (const s of open) {
      // The chosen wall-clock time on this session's own site day.
      const logoutAt = this.atLocalTime(
        s.workDate,
        Number(match[1]),
        Number(match[2]),
        s.site?.timezone ?? tz,
      );

      if (logoutAt <= s.loginAt) {
        skipped.push({
          id: s.id,
          workerCode: s.worker.workerCode,
          fullName: s.worker.fullName,
          reason: 'Logged in after this time',
        });
        continue;
      }

      const hours = computeWorkHours(
        s.loginAt,
        logoutAt,
        s.site?.timezone ?? tz,
        await this.shiftConfig(s.shiftId),
      );

      if (!dto.dryRun) {
        await this.prisma.attendanceSession.update({
          where: { id: s.id },
          data: {
            logoutAt,
            state: 'CLOSED',
            workedMinutes: hours.workedMinutes,
            overtimeMinutes: hours.overtimeMinutes,
            lateMinutes: hours.lateMinutes,
            earlyLeaveMinutes: hours.earlyLeaveMinutes,
            closedReason: 'ADMIN_BULK_LOGOUT',
          },
        });
        await this.audit.record({
          organizationId: user.organizationId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: 'ATTENDANCE_SESSION_BULK_LOGOUT',
          entityType: 'AttendanceSession',
          entityId: s.id,
          oldValue: { state: 'OPEN', logoutAt: null, workedMinutes: s.workedMinutes },
          newValue: {
            state: 'CLOSED',
            logoutAt,
            workedMinutes: hours.workedMinutes,
            overtimeMinutes: hours.overtimeMinutes,
          },
          reason: dto.reason,
        });
      }

      closed.push({
        id: s.id,
        workerCode: s.worker.workerCode,
        fullName: s.worker.fullName,
        loginAt: s.loginAt,
        logoutAt,
        workedMinutes: hours.workedMinutes,
        overtimeMinutes: hours.overtimeMinutes,
      });
    }

    return {
      dryRun: dto.dryRun ?? false,
      date: workDate.toISOString().slice(0, 10),
      time: dto.time,
      closed,
      skipped,
    };
  }

  /** The instant of `hh:mm` on `workDate` as read on a clock in `timezone`. */
  private atLocalTime(workDate: Date, hh: number, mm: number, timezone: string): Date {
    return DateTime.fromObject(
      {
        year: workDate.getUTCFullYear(),
        month: workDate.getUTCMonth() + 1,
        day: workDate.getUTCDate(),
        hour: hh,
        minute: mm,
      },
      { zone: timezone },
    ).toJSDate();
  }
}
