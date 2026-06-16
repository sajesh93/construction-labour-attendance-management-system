import { Injectable } from '@nestjs/common';
import { CorrectionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { minutesOfDay } from '../../common/time/time.util';
import { computeWorkHours, ShiftConfig } from '../attendance/engine/work-hours.engine';
import { CreateCorrectionDto, ReviewCorrectionDto } from './dto/correction.dto';

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateCorrectionDto) {
    const request = await this.prisma.correctionRequest.create({
      data: {
        organizationId: user.organizationId,
        workerId: dto.workerId,
        siteId: dto.siteId,
        sessionId: dto.sessionId,
        workDate: new Date(dto.workDate),
        type: dto.type,
        reason: dto.reason,
        notes: dto.notes,
        requestedBy: user.userId,
        items: {
          create: dto.items.map((i) => ({
            field: i.field,
            proposedValue: i.proposedValue as Prisma.InputJsonValue,
          })),
        },
      },
      include: { items: true },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'CORRECTION_REQUEST',
      entityType: 'CorrectionRequest',
      entityId: request.id,
      newValue: { type: dto.type, reason: dto.reason, items: dto.items },
    });
    return request;
  }

  async list(user: AuthUser, status?: CorrectionStatus, siteId?: string, workerId?: string) {
    const rows = await this.prisma.correctionRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status } : {}),
        ...(siteId ? { siteId } : {}),
        ...(workerId ? { workerId } : {}),
      },
      include: {
        items: true,
        worker: { select: { fullName: true, workerCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve the requester/reviewer UUIDs to human names so the admin sees
    // *who* filed each correction and who reviewed it, not raw IDs.
    const userIds = [
      ...new Set(rows.flatMap((r) => [r.requestedBy, r.reviewedBy]).filter(Boolean) as string[]),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, role: true },
        })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      ...r,
      requestedByName: nameOf.get(r.requestedBy) ?? null,
      reviewedByName: r.reviewedBy ? (nameOf.get(r.reviewedBy) ?? null) : null,
    }));
  }

  async get(user: AuthUser, id: string) {
    const req = await this.prisma.correctionRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { items: true, session: true },
    });
    if (!req) throw Errors.notFound('Correction request');
    return req;
  }

  async cancel(user: AuthUser, id: string) {
    const req = await this.get(user, id);
    if (req.status !== 'PENDING')
      throw Errors.businessRule('Only pending requests can be cancelled');
    const updated = await this.prisma.correctionRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'CORRECTION_CANCEL',
      entityType: 'CorrectionRequest',
      entityId: id,
    });
    return updated;
  }

  async reject(user: AuthUser, id: string, dto: ReviewCorrectionDto) {
    const req = await this.get(user, id);
    if (req.status !== 'PENDING') throw Errors.businessRule('Request is not pending');
    const updated = await this.prisma.correctionRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'CORRECTION_REJECT',
      entityType: 'CorrectionRequest',
      entityId: id,
      reason: dto.reviewNotes,
    });
    return updated;
  }

  /**
   * APPROVE — the ONLY path that mutates attendance from a correction.
   * Runs in a transaction: re-validate freshness → apply field changes →
   * recompute hours → mark APPROVED → write an audit record with old/new.
   */
  async approve(user: AuthUser, id: string, dto: ReviewCorrectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.correctionRequest.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { items: true },
      });
      if (!req) throw Errors.notFound('Correction request');
      if (req.status !== 'PENDING') throw Errors.businessRule('Request is not pending');

      let sessionBefore: Record<string, unknown> | null = null;
      let sessionAfter: Record<string, unknown> | null = null;

      if (req.sessionId) {
        const session = await tx.attendanceSession.findUnique({
          where: { id: req.sessionId },
          include: { shift: true, site: true },
        });
        if (!session) throw Errors.conflict('Target session no longer exists');

        // Freshness: if the session changed after the request was filed, abort.
        if (session.updatedAt > req.createdAt) {
          throw Errors.conflict('Session changed since the request was filed; please re-file');
        }

        sessionBefore = {
          loginAt: session.loginAt,
          logoutAt: session.logoutAt,
          siteId: session.siteId,
          shiftId: session.shiftId,
        };

        const patch: Prisma.AttendanceSessionUpdateInput = {};
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
              patch.site = { connect: { id: v as string } };
              break;
            case 'shift_id':
              patch.shift = { connect: { id: v as string } };
              break;
            default:
              throw Errors.businessRule(`Unsupported correction field: ${item.field}`);
          }
        }

        // Apply, then recompute hours from resulting login/logout.
        const applied = await tx.attendanceSession.update({
          where: { id: session.id },
          data: patch,
          include: { shift: true, site: true },
        });

        if (applied.logoutAt) {
          const shiftCfg: ShiftConfig | undefined = applied.shift
            ? {
                startTimeMinutes: minutesOfDay(applied.shift.startTime),
                endTimeMinutes: minutesOfDay(applied.shift.endTime),
                isOvernight: applied.shift.isOvernight,
                lateGraceMinutes: applied.shift.lateGraceMinutes,
                earlyGraceMinutes: applied.shift.earlyGraceMinutes,
                otThresholdMinutes: applied.shift.otThresholdMinutes,
              }
            : undefined;
          const hours = computeWorkHours(
            applied.loginAt,
            applied.logoutAt,
            applied.site.timezone,
            shiftCfg,
          );
          await tx.attendanceSession.update({
            where: { id: session.id },
            data: {
              state: 'CLOSED',
              workedMinutes: hours.workedMinutes,
              overtimeMinutes: hours.overtimeMinutes,
              lateMinutes: hours.lateMinutes,
              earlyLeaveMinutes: hours.earlyLeaveMinutes,
              closedReason: 'CORRECTION',
            },
          });
        }

        sessionAfter = {
          loginAt: applied.loginAt,
          logoutAt: applied.logoutAt,
          siteId: applied.siteId,
          shiftId: applied.shiftId,
        };
      }

      const updated = await tx.correctionRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: user.userId,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes,
        },
      });

      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'CORRECTION_APPROVE',
        entityType: 'AttendanceSession',
        entityId: req.sessionId ?? req.id,
        oldValue: sessionBefore,
        newValue: sessionAfter,
        reason: dto.reviewNotes,
      });

      return updated;
    });
  }
}
