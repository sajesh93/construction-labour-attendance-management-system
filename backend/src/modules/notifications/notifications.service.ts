import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';

const ALERT_ROLES: UserRole[] = ['SUPER_ADMIN', 'SITE_ADMIN', 'SUPERVISOR'];

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    organizationId: string;
    type: string;
    title: string;
    body: string;
    siteId?: string | null;
    data?: Prisma.InputJsonValue;
  }) {
    return this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        body: input.body,
        siteId: input.siteId ?? null,
        data: input.data,
      },
    });
  }

  /** Polling feed for the admin panel and the mobile app. */
  list(user: AuthUser, since?: string, type?: string) {
    return this.prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(user: AuthUser, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!n) throw Errors.notFound('Notification');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date(), readBy: user.userId },
    });
  }

  /** Register (or refresh) an FCM device token for the current user/device. */
  registerPushToken(
    user: AuthUser,
    input: { token: string; deviceUid?: string; platform?: string },
  ) {
    return this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: {
        organizationId: user.organizationId,
        userId: user.userId,
        deviceUid: input.deviceUid,
        token: input.token,
        platform: input.platform,
      },
      update: {
        organizationId: user.organizationId,
        userId: user.userId,
        deviceUid: input.deviceUid,
        platform: input.platform,
      },
    });
  }

  /** Push tokens to alert for an SOS — everyone in the org except the sender's
   * device. Filtered in code so tokens with a NULL deviceUid are still alerted
   * (a SQL `deviceUid != x` would silently drop NULL rows). */
  async sosTokens(organizationId: string, excludeDeviceUid?: string | null): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { organizationId },
      select: { token: true, deviceUid: true },
    });
    return rows
      .filter((r) => !excludeDeviceUid || r.deviceUid !== excludeDeviceUid)
      .map((r) => r.token);
  }

  /** Drop tokens FCM reported as no longer valid. */
  async pruneTokens(tokens: string[]) {
    if (tokens.length === 0) return;
    await this.prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
  }

  /** Emails of active users in the given roles (defaults to admins + safety officers). */
  async alertEmails(organizationId: string, roles: UserRole[] = ALERT_ROLES): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true, email: { not: null }, role: { in: roles } },
      select: { email: true },
    });
    return users.map((u) => u.email).filter((e): e is string => !!e);
  }
}
