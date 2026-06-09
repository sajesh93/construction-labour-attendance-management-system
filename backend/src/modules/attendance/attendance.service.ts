import { Injectable } from '@nestjs/common';
import { AttendanceTap, Prisma, SiteSettings, TapSource, Worker } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AuditService } from '../../common/audit/audit.service';
import { Errors } from '../../common/errors/app.exception';
import { businessDate, minutesOfDay } from '../../common/time/time.util';
import { computeWorkHours, ShiftConfig } from './engine/work-hours.engine';
import { decideTap, distanceMeters, shouldVerifyPhoto } from './engine/tap-decision';
import { TapDto } from './dto/attendance.dto';

export interface TapContext {
  deviceId: string;
  ip?: string;
  /** 0-100 randomness for photo policy; injectable for tests. */
  photoRoll?: number;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private workerCard(w: Worker) {
    return {
      id: w.id,
      fullName: w.fullName,
      photoUrl: w.photoUrl,
      bloodGroup: w.bloodGroup,
      emergencyContactName: w.emergencyContactName,
      emergencyContactNumber: w.emergencyContactNumber,
    };
  }

  private async resolveWorker(
    organizationId: string,
    source: TapSource,
    identifier: string,
  ): Promise<Worker | null> {
    const base = { organizationId, deletedAt: null };
    if (source === TapSource.NFC_UID) {
      return this.prisma.worker.findFirst({ where: { ...base, nfcUid: identifier } });
    }
    if (source === TapSource.QR) {
      return this.prisma.worker.findFirst({ where: { ...base, qrIdentifier: identifier } });
    }
    // NFC_NDEF and MANUAL resolve by worker code.
    return this.prisma.worker.findFirst({ where: { ...base, workerCode: identifier } });
  }

  private toShiftConfig(shift: {
    startTime: Date;
    endTime: Date;
    isOvernight: boolean;
    lateGraceMinutes: number;
    earlyGraceMinutes: number;
    otThresholdMinutes: number;
  }): ShiftConfig {
    return {
      startTimeMinutes: minutesOfDay(shift.startTime),
      endTimeMinutes: minutesOfDay(shift.endTime),
      isOvernight: shift.isOvernight,
      lateGraceMinutes: shift.lateGraceMinutes,
      earlyGraceMinutes: shift.earlyGraceMinutes,
      otThresholdMinutes: shift.otThresholdMinutes,
    };
  }

  /**
   * Core tap handler. Idempotent on eventId. Decides LOGIN/LOGOUT/DUPLICATE,
   * enforces geo when configured, applies verification + photo policy.
   * This is the single entry point used by both the live tap endpoint and the
   * offline sync ingest (one event at a time).
   */
  async handleTap(organizationId: string, dto: TapDto, ctx: TapContext) {
    // 1. Idempotency: a tap with this eventId already processed → replay.
    const existing = await this.prisma.attendanceTap.findUnique({
      where: { organizationId_eventId: { organizationId, eventId: dto.eventId } },
    });
    if (existing) {
      return this.replayResult(existing);
    }

    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId },
      include: { settings: true },
    });
    if (!site) throw Errors.notFound('Site');
    const settings = site.settings ?? this.defaultSettings(dto.siteId);

    const worker = await this.resolveWorker(organizationId, dto.source, dto.identifier);

    // Unresolved identifier: persist the raw tap for later reconciliation.
    if (!worker) {
      await this.prisma.attendanceTap.create({
        data: {
          eventId: dto.eventId,
          organizationId,
          siteId: dto.siteId,
          deviceId: dto.deviceId,
          rawIdentifier: dto.identifier,
          tapSource: dto.source,
          clientEventTime: new Date(dto.clientEventTime),
          monotonicMs: dto.monotonicMs != null ? BigInt(dto.monotonicMs) : null,
          latitude: dto.geo?.lat,
          longitude: dto.geo?.lng,
          geoAccuracyM: dto.geo?.accuracyM,
          isManualBackup: dto.manual?.isBackup ?? false,
          manualReason: dto.manual?.reason,
        },
      });
      throw Errors.workerNotFound(`Unresolved identifier: ${dto.identifier}`);
    }

    // 2. Geo enforcement.
    if (settings.geoEnforcement && site.latitude != null && site.longitude != null) {
      if (dto.geo == null) throw Errors.businessRule('Location required for this site');
      const dist = distanceMeters(site.latitude, site.longitude, dto.geo.lat, dto.geo.lng);
      if (dist > settings.geoRadiusMeters) {
        throw Errors.geoOutOfRange(Math.round(dist), settings.geoRadiusMeters);
      }
    }

    const tapTime = new Date(dto.clientEventTime);

    // 3. Serialise per-worker decisions with a short Redis lock.
    const lockKey = `worker:${worker.id}:session`;
    const lockToken = await this.redis.acquireLock(lockKey, 5000);
    if (!lockToken) throw Errors.conflict('Another tap is being processed for this worker');

    try {
      const openSession = await this.prisma.attendanceSession.findFirst({
        where: { workerId: worker.id, state: 'OPEN' },
      });
      const lastTap = await this.prisma.attendanceTap.findFirst({
        where: { workerId: worker.id },
        orderBy: { clientEventTime: 'desc' },
      });

      const decision = decideTap(
        tapTime,
        settings.duplicateTapCooldownSeconds,
        openSession
          ? { id: openSession.id, loginAt: openSession.loginAt, siteId: openSession.siteId }
          : null,
        lastTap ? { clientEventTime: lastTap.clientEventTime, tapType: lastTap.tapType } : null,
      );

      if (decision.action === 'DUPLICATE') {
        throw Errors.duplicateTap(decision.cooldownRemainingSeconds);
      }

      if (decision.action === 'LOGIN') {
        return await this.doLogin(organizationId, site, settings, worker, dto, ctx, tapTime);
      }
      return await this.doLogout(
        organizationId,
        site,
        worker,
        dto,
        ctx,
        tapTime,
        decision.sessionId,
      );
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  private defaultSettings(siteId: string): SiteSettings {
    return {
      siteId,
      verificationMode: 'MANUAL',
      autoLoginCountdownSeconds: 10,
      duplicateTapCooldownSeconds: 30,
      geoEnforcement: false,
      geoRadiusMeters: 200,
      photoVerificationMode: 'RANDOM',
      photoVerificationRandomPct: 20,
      defaultShiftId: null,
      updatedAt: new Date(),
    };
  }

  private async doLogin(
    organizationId: string,
    site: { id: string; timezone: string; settings: SiteSettings | null },
    settings: SiteSettings,
    worker: Worker,
    dto: TapDto,
    ctx: TapContext,
    tapTime: Date,
  ) {
    // Auto-close any stale open session from a previous business day (#5).
    const stale = await this.prisma.attendanceSession.findFirst({
      where: { workerId: worker.id, state: 'OPEN' },
    });
    if (stale) {
      await this.prisma.attendanceSession.update({
        where: { id: stale.id },
        data: {
          state: 'AUTO_CLOSED',
          closedReason: 'auto-closed on next login',
          logoutAt: tapTime,
        },
      });
    }

    const roll = ctx.photoRoll ?? Math.floor(Math.random() * 100);
    const requiresPhoto = shouldVerifyPhoto(
      settings.photoVerificationMode,
      settings.photoVerificationRandomPct,
      roll,
    );
    const workDate = businessDate(tapTime, site.timezone);

    const tap = await this.prisma.attendanceTap.create({
      data: {
        eventId: dto.eventId,
        organizationId,
        siteId: site.id,
        deviceId: dto.deviceId,
        workerId: worker.id,
        rawIdentifier: dto.identifier,
        tapSource: dto.source,
        tapType: 'LOGIN',
        clientEventTime: tapTime,
        monotonicMs: dto.monotonicMs != null ? BigInt(dto.monotonicMs) : null,
        latitude: dto.geo?.lat,
        longitude: dto.geo?.lng,
        geoAccuracyM: dto.geo?.accuracyM,
        verifiedMode: settings.verificationMode,
        photoCapturedUrl: dto.photoUrl,
        isManualBackup: dto.manual?.isBackup ?? false,
        manualReason: dto.manual?.reason,
      },
    });

    // MANUAL mode: persist the tap (durable) but defer session creation to confirm.
    if (settings.verificationMode === 'MANUAL') {
      await this.maybeAuditManual(organizationId, ctx, worker.id, dto);
      return {
        result: 'LOGIN_PENDING_CONFIRM',
        eventId: dto.eventId,
        worker: this.workerCard(worker),
        verificationMode: settings.verificationMode,
        requiresConfirm: true,
        requiresPhoto,
      };
    }

    // AUTO mode: commit the session immediately.
    const session = await this.prisma.attendanceSession.create({
      data: {
        organizationId,
        workerId: worker.id,
        siteId: site.id,
        shiftId: settings.defaultShiftId,
        workDate,
        loginTapId: tap.id,
        loginAt: tapTime,
        state: 'OPEN',
      },
    });
    await this.maybeAuditManual(organizationId, ctx, worker.id, dto);

    return {
      result: 'LOGIN_RECORDED',
      sessionId: session.id,
      worker: this.workerCard(worker),
      verificationMode: settings.verificationMode,
      requiresPhoto,
      loginAt: session.loginAt,
    };
  }

  private async doLogout(
    organizationId: string,
    site: { id: string; timezone: string },
    worker: Worker,
    dto: TapDto,
    ctx: TapContext,
    tapTime: Date,
    sessionId: string,
  ) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { shift: true },
    });
    if (!session) throw Errors.conflict('Open session disappeared');

    const tap = await this.prisma.attendanceTap.create({
      data: {
        eventId: dto.eventId,
        organizationId,
        siteId: dto.siteId,
        deviceId: dto.deviceId,
        workerId: worker.id,
        rawIdentifier: dto.identifier,
        tapSource: dto.source,
        tapType: 'LOGOUT',
        clientEventTime: tapTime,
        monotonicMs: dto.monotonicMs != null ? BigInt(dto.monotonicMs) : null,
        latitude: dto.geo?.lat,
        longitude: dto.geo?.lng,
        geoAccuracyM: dto.geo?.accuracyM,
        isManualBackup: dto.manual?.isBackup ?? false,
        manualReason: dto.manual?.reason,
      },
    });

    const shiftConfig = session.shift ? this.toShiftConfig(session.shift) : undefined;
    const hours = computeWorkHours(session.loginAt, tapTime, site.timezone, shiftConfig);
    const isCrossSite = dto.siteId !== session.siteId;

    const updated = await this.prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        logoutTapId: tap.id,
        logoutAt: tapTime,
        state: 'CLOSED',
        workedMinutes: hours.workedMinutes,
        overtimeMinutes: hours.overtimeMinutes,
        lateMinutes: hours.lateMinutes,
        earlyLeaveMinutes: hours.earlyLeaveMinutes,
        logoutSiteId: isCrossSite ? dto.siteId : null,
        isCrossSite,
      },
    });

    await this.maybeAuditManual(organizationId, ctx, worker.id, dto);

    return {
      result: 'LOGOUT_RECORDED',
      sessionId: updated.id,
      workedMinutes: updated.workedMinutes,
      overtimeMinutes: updated.overtimeMinutes,
      isCrossSite,
      logoutAt: updated.logoutAt,
    };
  }

  private async maybeAuditManual(
    organizationId: string,
    ctx: TapContext,
    workerId: string,
    dto: TapDto,
  ) {
    if (dto.manual?.isBackup) {
      await this.audit.record({
        organizationId,
        action: 'ATTENDANCE_MANUAL_BACKUP',
        entityType: 'Worker',
        entityId: workerId,
        deviceId: ctx.deviceId,
        ipAddress: ctx.ip,
        reason: dto.manual.reason,
        newValue: { source: dto.source, siteId: dto.siteId },
      });
    }
  }

  /** Finalize a MANUAL-mode login after the watchman confirms the face match. */
  async confirm(organizationId: string, eventId: string, _ctx: TapContext) {
    const tap = await this.prisma.attendanceTap.findUnique({
      where: { organizationId_eventId: { organizationId, eventId } },
    });
    if (!tap || tap.tapType !== 'LOGIN' || !tap.workerId) {
      throw Errors.notFound('Login tap');
    }
    const existing = await this.prisma.attendanceSession.findFirst({
      where: { loginTapId: tap.id },
    });
    if (existing) {
      return { result: 'LOGIN_RECORDED', sessionId: existing.id, loginAt: existing.loginAt };
    }

    const site = await this.prisma.site.findUnique({
      where: { id: tap.siteId },
      include: { settings: true },
    });
    const workDate = businessDate(tap.clientEventTime, site?.timezone ?? 'Asia/Kolkata');

    const session = await this.prisma.attendanceSession.create({
      data: {
        organizationId,
        workerId: tap.workerId,
        siteId: tap.siteId,
        shiftId: site?.settings?.defaultShiftId ?? null,
        workDate,
        loginTapId: tap.id,
        loginAt: tap.clientEventTime,
        state: 'OPEN',
      },
    });
    return { result: 'LOGIN_RECORDED', sessionId: session.id, loginAt: session.loginAt };
  }

  private replayResult(tap: AttendanceTap) {
    return {
      result: 'IDEMPOTENT_REPLAY',
      eventId: tap.eventId,
      tapType: tap.tapType,
      tapId: tap.id,
    };
  }

  async activeSessions(organizationId: string, siteId: string) {
    return this.prisma.attendanceSession.findMany({
      where: { organizationId, siteId, state: 'OPEN' },
      include: {
        worker: { select: { id: true, fullName: true, photoUrl: true, workerCode: true } },
      },
      orderBy: { loginAt: 'asc' },
    });
  }

  /** Supervisor monthly summary for a worker (docs/03 §5). */
  async workerSummary(organizationId: string, workerId: string, month: string) {
    const [year, mon] = month.split('-').map((n) => parseInt(n, 10));
    if (!year || !mon) throw Errors.validation({ message: 'month must be YYYY-MM' });
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 1));

    const worker = await this.prisma.worker.findFirst({
      where: { id: workerId, organizationId },
      select: { id: true, fullName: true, photoUrl: true },
    });
    if (!worker) throw Errors.workerNotFound();

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { workerId, organizationId, workDate: { gte: from, lt: to } },
      orderBy: { workDate: 'asc' },
    });

    const totalMinutes = sessions.reduce((s, x) => s + (x.workedMinutes ?? 0), 0);
    const overtime = sessions.reduce((s, x) => s + (x.overtimeMinutes ?? 0), 0);
    const lateArrivals = sessions.filter((x) => (x.lateMinutes ?? 0) > 0).length;
    const workedDays = new Set(sessions.map((x) => x.workDate.toISOString().slice(0, 10))).size;
    const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();

    return {
      worker,
      month,
      totalMonthlyMinutes: totalMinutes,
      overtimeMinutes: overtime,
      absentDays: Math.max(0, daysInMonth - workedDays),
      lateArrivals,
      daily: sessions.map((x) => ({
        date: x.workDate.toISOString().slice(0, 10),
        loginAt: x.loginAt,
        logoutAt: x.logoutAt,
        workedMinutes: x.workedMinutes,
        overtimeMinutes: x.overtimeMinutes,
        late: (x.lateMinutes ?? 0) > 0,
        earlyLeave: (x.earlyLeaveMinutes ?? 0) > 0,
        state: x.state,
      })),
    };
  }
}

// Re-export Prisma type to satisfy unused import lint when tree-shaken.
export type { Prisma };
