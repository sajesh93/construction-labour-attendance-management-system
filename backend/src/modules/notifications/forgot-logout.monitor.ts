import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { businessDate } from '../../common/time/time.util';
import { NotificationsService } from './notifications.service';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const AUTO_CREDIT_MINUTES = 8 * 60; // forgotten sessions are credited 8h flat
const NOTIFICATION_RETENTION_DAYS = 30;
const SOS_RETENTION_DAYS = 180;

/**
 * Housekeeping monitor (runs in API + worker; all actions are claim-guarded
 * or idempotent, so replicas never double-act):
 *
 * 1. Forgot-logout: sessions OPEN longer than FORGOT_LOGOUT_AFTER_HOURS
 *    (default 12h) are AUTO-CLOSED with exactly 8h credited and no overtime,
 *    marked "no logout". Super admins get an email; the admin panel shows a
 *    warning banner via the notification feed.
 * 2. Visitor passes: visitors whose visit date has passed are marked EXITED —
 *    their QR stops working (taps resolve ACTIVE people only).
 * 3. Retention: notifications older than 30 days and SOS events older than
 *    180 days are pruned.
 */
@Injectable()
export class ForgotLogoutMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ForgotLogoutMonitor.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    // First pass shortly after boot.
    setTimeout(() => void this.check(), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async check() {
    try {
      await this.autoCloseForgotten();
      await this.expireVisitors();
      await this.pruneOldRows();
    } catch (e) {
      this.logger.error(`Housekeeping run failed: ${(e as Error).message}`);
    }
  }

  private async autoCloseForgotten() {
    const hours = Number(process.env.FORGOT_LOGOUT_AFTER_HOURS ?? 12);
    const cutoff = new Date(Date.now() - hours * 3600_000);

    const stale = await this.prisma.attendanceSession.findMany({
      where: { state: 'OPEN', loginAt: { lt: cutoff }, forgotLogoutNotifiedAt: null },
      include: {
        worker: { select: { fullName: true, workerCode: true } },
        site: { select: { name: true } },
      },
      take: 200,
    });
    if (stale.length === 0) return;

    const byOrg = new Map<string, string[]>();
    for (const s of stale) {
      // Atomic claim — only the process that flips the flag acts on it.
      const claimed = await this.prisma.attendanceSession.updateMany({
        where: { id: s.id, forgotLogoutNotifiedAt: null },
        data: { forgotLogoutNotifiedAt: new Date() },
      });
      if (claimed.count === 0) continue;

      // Auto log-out: credit exactly 8 hours, no overtime, marked "no logout".
      const logoutAt = new Date(s.loginAt.getTime() + AUTO_CREDIT_MINUTES * 60_000);
      await this.prisma.attendanceSession.update({
        where: { id: s.id },
        data: {
          state: 'AUTO_CLOSED',
          logoutAt,
          workedMinutes: AUTO_CREDIT_MINUTES,
          overtimeMinutes: 0,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          closedReason: 'no logout — auto-closed with 8h credited',
        },
      });

      await this.notifications.create({
        organizationId: s.organizationId,
        type: 'FORGOT_LOGOUT',
        title: `${s.worker.fullName} (${s.worker.workerCode}) — no logout`,
        body:
          `Logged in at ${s.site.name} on ${s.loginAt.toISOString()} and never logged out. ` +
          `Auto-logged out with 8h credited (no overtime).`,
        siteId: s.siteId,
        data: { sessionId: s.id, workerCode: s.worker.workerCode, autoClosed: true },
      });

      const line = `${s.worker.fullName} (${s.worker.workerCode}) at ${s.site.name} — login ${s.loginAt.toISOString()}, auto-credited 8h`;
      const list = byOrg.get(s.organizationId) ?? [];
      list.push(line);
      byOrg.set(s.organizationId, list);
    }

    for (const [orgId, lines] of byOrg) {
      // Forgot-logout summaries go to SUPER_ADMINs only (per policy).
      const emails = await this.notifications.alertEmails(orgId, ['SUPER_ADMIN']);
      await this.mail.send(
        emails,
        `CLAMS: ${lines.length} worker(s) auto-logged out (no logout)`,
        `The following open sessions exceeded ${hours} hours and were auto-closed ` +
          `with exactly 8 hours credited and no overtime:\n\n` +
          lines.join('\n') +
          `\n\nRaise a correction if the actual hours differ.`,
      );
    }
    this.logger.log(`Auto-closed ${stale.length} forgotten session(s)`);
  }

  /** Visitors are day passes: once the visit date has passed, mark EXITED. */
  private async expireVisitors() {
    const today = businessDate(new Date(), 'Asia/Kolkata');
    const expired = await this.prisma.worker.findMany({
      where: {
        category: 'VISITOR',
        status: 'ACTIVE',
        deletedAt: null,
        joinDate: { lt: today },
      },
      select: { id: true, joinDate: true, fullName: true },
      take: 200,
    });
    for (const v of expired) {
      await this.prisma.worker.update({
        where: { id: v.id },
        data: { status: 'EXITED', exitDate: v.joinDate ?? today },
      });
    }
    if (expired.length > 0) {
      this.logger.log(`Expired ${expired.length} visitor pass(es)`);
    }
  }

  private async pruneOldRows() {
    const notifCutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
    const sosCutoff = new Date(Date.now() - SOS_RETENTION_DAYS * 86_400_000);
    await this.prisma.notification.deleteMany({ where: { createdAt: { lt: notifCutoff } } });
    await this.prisma.sosEvent.deleteMany({ where: { createdAt: { lt: sosCutoff } } });
  }
}
