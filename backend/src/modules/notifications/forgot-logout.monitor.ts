import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { NotificationsService } from './notifications.service';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

/**
 * Flags sessions that have been OPEN for longer than FORGOT_LOGOUT_AFTER_HOURS
 * (default 12h) — the worker almost certainly forgot to log out. Each session
 * is claimed atomically (forgotLogoutNotifiedAt guard), so concurrent API +
 * worker replicas never double-notify.
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
        // Atomic claim — only the process that flips the flag notifies.
        const claimed = await this.prisma.attendanceSession.updateMany({
          where: { id: s.id, forgotLogoutNotifiedAt: null },
          data: { forgotLogoutNotifiedAt: new Date() },
        });
        if (claimed.count === 0) continue;

        const line = `${s.worker.fullName} (${s.worker.workerCode}) at ${s.site.name} — logged in ${s.loginAt.toISOString()}`;
        await this.notifications.create({
          organizationId: s.organizationId,
          type: 'FORGOT_LOGOUT',
          title: `${s.worker.fullName} forgot to log out`,
          body: `Still logged in at ${s.site.name} since ${s.loginAt.toISOString()} (> ${hours}h).`,
          siteId: s.siteId,
          data: { sessionId: s.id, workerCode: s.worker.workerCode },
        });
        const list = byOrg.get(s.organizationId) ?? [];
        list.push(line);
        byOrg.set(s.organizationId, list);
      }

      for (const [orgId, lines] of byOrg) {
        const emails = await this.notifications.alertEmails(orgId);
        await this.mail.send(
          emails,
          `CLAMS: ${lines.length} worker(s) forgot to log out`,
          `The following workers have open sessions older than ${hours} hours:\n\n` +
            lines.join('\n') +
            `\n\nPlease review and raise corrections if needed.`,
        );
      }
      this.logger.log(`Forgot-logout: notified ${stale.length} stale session(s)`);
    } catch (e) {
      this.logger.error(`Forgot-logout check failed: ${(e as Error).message}`);
    }
  }
}
