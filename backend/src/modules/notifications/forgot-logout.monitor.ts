import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
        worker: { select: { fullName: true, workerCode: true, category: true } },
        site: { select: { name: true } },
      },
      take: 200,
    });
    if (stale.length === 0) return;

    interface MissedSession {
      sessionId: string;
      workerName: string;
      workerCode: string;
      category: string;
      siteName: string;
      loginAt: string;
    }
    const byOrg = new Map<string, MissedSession[]>();
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

      const list = byOrg.get(s.organizationId) ?? [];
      list.push({
        sessionId: s.id,
        workerName: s.worker.fullName,
        workerCode: s.worker.workerCode,
        category: s.worker.category,
        siteName: s.site.name,
        loginAt: s.loginAt.toISOString(),
      });
      byOrg.set(s.organizationId, list);
    }

    for (const [orgId, sessions] of byOrg) {
      // One summary notification per batch ("5 workers didn't logout") — the
      // full who-list rides in data.sessions for the admin click-through.
      const counts = new Map<string, number>();
      for (const m of sessions) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
      const label = (cat: string) =>
        cat === 'WORKER' ? 'worker' : cat === 'STAFF' ? 'staff member' : 'visitor';
      const title =
        [...counts.entries()].map(([cat, n]) => plural(n, label(cat))).join(' & ') +
        ` didn't logout`;
      const preview = sessions
        .slice(0, 5)
        .map((m) => `${m.workerName} (${m.workerCode}) at ${m.siteName}`)
        .join(', ');
      await this.notifications.create({
        organizationId: orgId,
        type: 'FORGOT_LOGOUT',
        title,
        body:
          `${preview}${sessions.length > 5 ? ` and ${sessions.length - 5} more` : ''}. ` +
          `All were auto-logged out with 8h credited (no overtime).`,
        siteId: null,
        data: { sessions, autoClosed: true } as unknown as Prisma.InputJsonValue,
      });

      // Forgot-logout summaries go to SUPER_ADMINs only (per policy).
      const lines = sessions.map(
        (m) =>
          `${m.workerName} (${m.workerCode}) at ${m.siteName} — login ${m.loginAt}, auto-credited 8h`,
      );
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
