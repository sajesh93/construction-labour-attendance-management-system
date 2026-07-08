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
      include: { user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    user: AuthUser,
    id: string,
    data: { status?: DeviceStatus; siteId?: string; label?: string },
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { user: { select: { role: true } } },
    });
    if (!device) throw Errors.notFound('Device');

    // An Admin's own PC/browser can only be approved (or revoked) by the
    // Super Admin — admins must not self-approve their logins.
    if (
      data.status &&
      data.status !== device.status &&
      device.user?.role === 'SITE_ADMIN' &&
      user.role !== 'SUPER_ADMIN'
    ) {
      throw Errors.forbidden("Only the Super Admin can approve an Admin's device.");
    }

    // An empty rename clears the label so the UI falls back to the device UID.
    const nextLabel = data.label !== undefined ? data.label.trim() || null : undefined;

    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        status: data.status,
        siteId: data.siteId ?? device.siteId,
        ...(nextLabel !== undefined ? { label: nextLabel } : {}),
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
      oldValue: { status: device.status, siteId: device.siteId, label: device.label },
      newValue: { status: updated.status, siteId: updated.siteId, label: updated.label },
    });

    return updated;
  }
}
