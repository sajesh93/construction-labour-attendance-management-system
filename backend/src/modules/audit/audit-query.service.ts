import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    // BigInt id → string for JSON safety.
    const data = rows.slice(0, limit).map((r) => ({ ...r, id: r.id.toString() }));
    return { data, nextCursor };
  }
}
