import { Injectable } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, siteId?: string, status?: DeviceStatus) {
    return this.prisma.device.findMany({
      where: {
        organizationId: user.organizationId,
        ...(siteId ? { siteId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    user: AuthUser,
    id: string,
    data: { status?: DeviceStatus; siteId?: string },
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!device) throw Errors.notFound('Device');

    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        status: data.status,
        siteId: data.siteId ?? device.siteId,
        ...(data.status === 'AUTHORIZED'
          ? { authorizedBy: user.userId, authorizedAt: new Date() }
          : {}),
        ...(data.status === 'REVOKED' ? { tokenHash: null } : {}),
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'DEVICE_UPDATE',
      entityType: 'Device',
      entityId: id,
      oldValue: { status: device.status, siteId: device.siteId },
      newValue: { status: updated.status, siteId: updated.siteId },
    });

    return updated;
  }
}
