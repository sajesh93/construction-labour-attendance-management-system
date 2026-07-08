import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { MailService } from '../../common/mail/mail.service';
import { PushService } from '../../common/push/push.service';
import { Errors } from '../../common/errors/app.exception';

@Injectable()
export class DeviceAuthService {
  private readonly logger = new Logger(DeviceAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  /** App/browser self-registers; an admin must AUTHORIZE before it can be used. */
  async register(
    organizationId: string,
    deviceUid: string,
    platform?: string,
    label?: string,
    userId?: string,
    userRole?: UserRole,
    userName?: string,
  ) {
    const existing = await this.prisma.device.findUnique({
      where: { organizationId_deviceUid: { organizationId, deviceUid } },
    });
    // On re-register we deliberately DO NOT overwrite `label`: the device sends its
    // phone make/model as the initial name, but an admin may have renamed it in the
    // panel (e.g. "Gate 1 tablet") — that rename must stick across app restarts.
    const device = await this.prisma.device.upsert({
      where: { organizationId_deviceUid: { organizationId, deviceUid } },
      update: { platform, lastSeenAt: new Date(), ...(userId ? { userId } : {}) },
      create: { organizationId, deviceUid, platform, label, status: 'PENDING', userId },
    });

    // First sighting of a pending device → tell the people who can approve it.
    if (!existing && device.status === 'PENDING') {
      void this.notifyApprovers(organizationId, device.id, label ?? deviceUid, userRole, userName);
    }
    return { deviceId: device.id, status: device.status };
  }

  /**
   * Alert the roles allowed to approve this device: an Admin's PC needs the
   * Super Admin; watchman/safety-officer devices can be approved by either.
   */
  private async notifyApprovers(
    organizationId: string,
    deviceId: string,
    label: string,
    ownerRole?: UserRole,
    ownerName?: string,
  ) {
    try {
      const approverRoles: UserRole[] =
        ownerRole === 'SITE_ADMIN' ? ['SUPER_ADMIN'] : ['SUPER_ADMIN', 'SITE_ADMIN'];
      const title = 'New device awaiting approval';
      const body = `${ownerName ?? 'A user'} signed in on "${label}" — approve it in Devices to let them continue.`;

      await this.prisma.notification.create({
        data: {
          organizationId,
          type: 'DEVICE_PENDING',
          title,
          body,
          data: { deviceId, ownerRole: ownerRole ?? null },
        },
      });

      const approvers = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          deletedAt: null,
          role: { in: approverRoles },
        },
        select: { id: true, email: true },
      });
      const emails = approvers.map((u) => u.email).filter((e): e is string => !!e);
      await this.mail.send(emails, `CLAMS: ${title}`, body);

      const tokens = await this.prisma.pushToken.findMany({
        where: { organizationId, userId: { in: approvers.map((u) => u.id) } },
        select: { token: true },
      });
      const stale = await this.push.sendAlert(
        tokens.map((t) => t.token),
        { title, body, data: { deviceId } },
      );
      if (stale.length) {
        await this.prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
      }
    } catch (e) {
      this.logger.error(`Device-pending alert failed: ${(e as Error).message}`);
    }
  }

  /** Current approval status for a device UID (polled by pending screens). */
  async status(organizationId: string, deviceUid: string) {
    const device = await this.prisma.device.findUnique({
      where: { organizationId_deviceUid: { organizationId, deviceUid } },
      select: { id: true, status: true },
    });
    if (!device) return { deviceId: null, status: 'UNREGISTERED' as const };
    return { deviceId: device.id, status: device.status };
  }

  /** Issue a device token once the device is AUTHORIZED. Only the hash is stored. */
  async issueToken(organizationId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) throw Errors.notFound('Device');
    if (device.status !== 'AUTHORIZED') throw Errors.deviceNotAuthorized();

    const token = `${deviceId}.${randomUUID()}`;
    const tokenHash = await this.crypto.hashToken(token);
    await this.prisma.device.update({ where: { id: deviceId }, data: { tokenHash } });
    return { deviceToken: token };
  }

  /** Validate a presented device token (used by the device guard). */
  async validateToken(deviceId: string, token: string): Promise<boolean> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.status !== 'AUTHORIZED' || !device.tokenHash) return false;
    const ok = await this.crypto.verifyToken(device.tokenHash, token);
    if (ok) {
      await this.prisma.device.update({
        where: { id: deviceId },
        data: { lastSeenAt: new Date() },
      });
    }
    return ok;
  }
}
