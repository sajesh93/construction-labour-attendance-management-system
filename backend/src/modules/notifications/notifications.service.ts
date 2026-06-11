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

  /** Emails of active users in the given roles (defaults to admins + safety officers). */
  async alertEmails(organizationId: string, roles: UserRole[] = ALERT_ROLES): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true, email: { not: null }, role: { in: roles } },
      select: { email: true },
    });
    return users.map((u) => u.email).filter((e): e is string => !!e);
  }
}
