import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { NotificationsService } from '../notifications/notifications.service';
import { distanceMeters } from '../attendance/engine/tap-decision';
import { TriggerSosDto } from './dto/sos.dto';

const MAX_SITE_MATCH_METERS = 10_000; // GPS → nearest site within 10 km

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * PUBLIC endpoint — works without login so the SOS button is usable from the
   * app's login screen. Site is resolved from (1) the phone's last-selected
   * siteId, then (2) GPS proximity to site coordinates, then (3) the device's
   * registered site.
   */
  async trigger(dto: TriggerSosDto) {
    // Per-device cooldown on top of the global rate limit: one SOS per minute
    // per phone, so a stuck/abused button can't flood alerts.
    if (dto.deviceUid) {
      const recent = await this.prisma.sosEvent.findFirst({
        where: { deviceUid: dto.deviceUid, createdAt: { gt: new Date(Date.now() - 60_000) } },
        select: { id: true },
      });
      if (recent) throw Errors.rateLimited();
    }

    let site: { id: string; name: string; organizationId: string } | null = null;

    if (dto.siteId) {
      site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, isActive: true },
        select: { id: true, name: true, organizationId: true },
      });
    }

    if (!site && dto.latitude != null && dto.longitude != null) {
      const candidates = await this.prisma.site.findMany({
        where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
        select: { id: true, name: true, organizationId: true, latitude: true, longitude: true },
      });
      let best: { site: (typeof candidates)[number]; dist: number } | null = null;
      for (const c of candidates) {
        const dist = distanceMeters(c.latitude!, c.longitude!, dto.latitude, dto.longitude);
        if (dist <= MAX_SITE_MATCH_METERS && (!best || dist < best.dist)) best = { site: c, dist };
      }
      if (best) site = best.site;
    }

    let device: { organizationId: string; siteId: string | null } | null = null;
    if (!site && dto.deviceUid) {
      device = await this.prisma.device.findFirst({
        where: { deviceUid: dto.deviceUid },
        select: { organizationId: true, siteId: true },
      });
      if (device?.siteId) {
        site = await this.prisma.site.findFirst({
          where: { id: device.siteId },
          select: { id: true, name: true, organizationId: true },
        });
      }
    }

    const organizationId =
      site?.organizationId ??
      device?.organizationId ??
      (
        await this.prisma.organization.findFirst({
          where: { isActive: true },
          select: { id: true },
        })
      )?.id;
    if (!organizationId) throw Errors.notFound('Organization');

    const event = await this.prisma.sosEvent.create({
      data: {
        organizationId,
        siteId: site?.id ?? null,
        siteName: site?.name ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geoAccuracyM: dto.accuracyM,
        deviceUid: dto.deviceUid,
        deviceName: dto.deviceName,
        senderName: dto.senderName,
        senderRole: dto.senderRole,
        senderEmail: dto.senderEmail,
        message: dto.message,
      },
    });

    const where = site?.name ?? 'Unknown location';
    const mapsLink =
      dto.latitude != null && dto.longitude != null
        ? `https://maps.google.com/?q=${dto.latitude},${dto.longitude}`
        : null;

    // "Sent by Ramu (Safety Officer, ramu@x.com)" when logged in; otherwise the
    // phone is all we know.
    const roleLabel = dto.senderRole === 'SUPERVISOR' ? 'Safety Officer' : dto.senderRole;
    const senderLine = dto.senderName
      ? `Sent by: ${dto.senderName}` +
        (roleLabel || dto.senderEmail
          ? ` (${[roleLabel, dto.senderEmail].filter(Boolean).join(', ')})`
          : '')
      : `Sent from a logged-out device`;
    const phoneLine = dto.deviceName ? `Phone: ${dto.deviceName}` : null;

    await this.notifications.create({
      organizationId,
      type: 'SOS',
      title: `🚨 SOS — ${where}`,
      body: [
        `Emergency reported at ${where}.`,
        senderLine,
        phoneLine,
        mapsLink ? `Location: ${mapsLink}` : null,
        dto.message ? `Message: ${dto.message}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      siteId: site?.id ?? null,
      data: { sosEventId: event.id },
    });

    // Email all admins + safety officers; never block the SOS response on it.
    void (async () => {
      const emails = await this.notifications.alertEmails(organizationId);
      await this.mail.send(
        emails,
        `🚨 CLAMS SOS — ${where}`,
        [
          `An SOS was triggered at ${new Date().toISOString()}.`,
          `Site: ${where}`,
          senderLine,
          phoneLine,
          mapsLink ? `Location: ${mapsLink}` : 'Location: not available',
          dto.message ? `Message: ${dto.message}` : null,
          dto.deviceUid ? `Device UID: ${dto.deviceUid}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    })().catch((e) => this.logger.error(`SOS email failed: ${(e as Error).message}`));

    return { ok: true, sosEventId: event.id, site: site?.name ?? null };
  }

  list(user: AuthUser) {
    return this.prisma.sosEvent.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async acknowledge(user: AuthUser, id: string) {
    const event = await this.prisma.sosEvent.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!event) throw Errors.notFound('SOS event');
    return this.prisma.sosEvent.update({
      where: { id },
      data: { acknowledgedBy: user.userId, acknowledgedAt: new Date() },
    });
  }
}
