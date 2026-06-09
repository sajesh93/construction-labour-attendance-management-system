import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface AuditEntry {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  deviceId?: string | null;
  requestId?: string | null;
}

/**
 * Append-only audit writer. Domain services call `record` explicitly for
 * meaningful actions (preferred over raw HTTP introspection).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as object),
        newValue: entry.newValue === undefined ? undefined : (entry.newValue as object),
        reason: entry.reason ?? null,
        ipAddress: entry.ipAddress ?? null,
        deviceId: entry.deviceId ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }
}
