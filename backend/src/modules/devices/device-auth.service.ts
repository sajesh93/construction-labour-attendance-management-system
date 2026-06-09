import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { Errors } from '../../common/errors/app.exception';

@Injectable()
export class DeviceAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** App self-registers; admin must AUTHORIZE before attendance is accepted. */
  async register(organizationId: string, deviceUid: string, platform?: string, label?: string) {
    const device = await this.prisma.device.upsert({
      where: { organizationId_deviceUid: { organizationId, deviceUid } },
      update: { platform, label, lastSeenAt: new Date() },
      create: { organizationId, deviceUid, platform, label, status: 'PENDING' },
    });
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
