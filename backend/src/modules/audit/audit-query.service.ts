import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth-user.interface';

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(user: AuthUser, q: AuditQuery) {
    const limit = Math.min(q.limit ?? 50, 200);
    const where: Prisma.AuditLogWhereInput = {
      organizationId: user.organizationId,
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: BigInt(q.cursor) }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const nextCursor = rows.length > limit ? rows[limit].id.toString() : null;
    const page = rows.slice(0, limit);
    const names = await this.resolveNames(page);

    // BigInt id → string for JSON safety; UUIDs → human names for the UI.
    const data = page.map((r) => ({
      ...r,
      id: r.id.toString(),
      actorName: r.actorUserId ? (names.users.get(r.actorUserId) ?? null) : null,
      entityName: r.entityId ? (names.byType(r.entityType)?.get(r.entityId) ?? null) : null,
    }));
    return { data, nextCursor };
  }

  /** Batch-resolve actor users + referenced entities to display names. */
  private async resolveNames(rows: AuditLog[]) {
    const idsOf = (type: string) => [
      ...new Set(
        rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId as string),
      ),
    ];
    const userIds = [
      ...new Set([
        ...(rows.map((r) => r.actorUserId).filter(Boolean) as string[]),
        ...idsOf('User'),
      ]),
    ];
    const workerIds = idsOf('Worker');
    const siteIds = idsOf('Site');
    const vendorIds = idsOf('Vendor');
    const designationIds = idsOf('Designation');
    const deviceIds = idsOf('Device');
    const correctionIds = idsOf('CorrectionRequest');
    const shiftIds = idsOf('Shift');

    const [users, workers, sites, vendors, designations, devices, corrections, shifts] =
      await Promise.all([
        userIds.length
          ? this.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, fullName: true },
            })
          : [],
        workerIds.length
          ? this.prisma.worker.findMany({
              where: { id: { in: workerIds } },
              select: { id: true, fullName: true, workerCode: true },
            })
          : [],
        siteIds.length
          ? this.prisma.site.findMany({
              where: { id: { in: siteIds } },
              select: { id: true, name: true },
            })
          : [],
        vendorIds.length
          ? this.prisma.vendor.findMany({
              where: { id: { in: vendorIds } },
              select: { id: true, name: true },
            })
          : [],
        designationIds.length
          ? this.prisma.designation.findMany({
              where: { id: { in: designationIds } },
              select: { id: true, name: true },
            })
          : [],
        deviceIds.length
          ? this.prisma.device.findMany({
              where: { id: { in: deviceIds } },
              select: { id: true, label: true, deviceUid: true },
            })
          : [],
        correctionIds.length
          ? this.prisma.correctionRequest.findMany({
              where: { id: { in: correctionIds } },
              select: { id: true, worker: { select: { fullName: true, workerCode: true } } },
            })
          : [],
        shiftIds.length
          ? this.prisma.shift.findMany({
              where: { id: { in: shiftIds } },
              select: { id: true, name: true },
            })
          : [],
      ]);

    const maps = {
      users: new Map(users.map((u) => [u.id, u.fullName])),
      workers: new Map(workers.map((w) => [w.id, `${w.fullName} (${w.workerCode})`])),
      sites: new Map(sites.map((s) => [s.id, s.name])),
      vendors: new Map(vendors.map((v) => [v.id, v.name])),
      designations: new Map(designations.map((d) => [d.id, d.name])),
      devices: new Map(devices.map((d) => [d.id, d.label ?? d.deviceUid])),
      corrections: new Map(
        corrections.map((c) => [c.id, `${c.worker.fullName} (${c.worker.workerCode})`]),
      ),
      shifts: new Map(shifts.map((s) => [s.id, s.name])),
      byType(type: string): Map<string, string> | undefined {
        switch (type) {
          case 'User':
            return this.users;
          case 'Worker':
            return this.workers;
          case 'Site':
            return this.sites;
          case 'Vendor':
            return this.vendors;
          case 'Designation':
            return this.designations;
          case 'Device':
            return this.devices;
          case 'CorrectionRequest':
            return this.corrections;
          case 'Shift':
            return this.shifts;
          default:
            return undefined;
        }
      },
    };
    return maps;
  }
}
