import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { CreateDesignationDto, UpdateDesignationDto } from './dto/designation.dto';

@Injectable()
export class DesignationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, includeInactive = false) {
    return this.prisma.designation.findMany({
      where: {
        organizationId: user.organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreateDesignationDto) {
    const existing = await this.prisma.designation.findFirst({
      where: { organizationId: user.organizationId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) throw Errors.conflict(`Designation "${dto.name}" already exists`);

    const designation = await this.prisma.designation.create({
      data: { organizationId: user.organizationId, name: dto.name.trim() },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'DESIGNATION_CREATE',
      entityType: 'Designation',
      entityId: designation.id,
      newValue: designation,
    });
    return designation;
  }

  async update(user: AuthUser, id: string, dto: UpdateDesignationDto) {
    const before = await this.prisma.designation.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!before) throw Errors.notFound('Designation');

    const designation = await this.prisma.designation.update({
      where: { id },
      data: { ...(dto.name ? { name: dto.name.trim() } : {}), isActive: dto.isActive },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'DESIGNATION_UPDATE',
      entityType: 'Designation',
      entityId: id,
      oldValue: before,
      newValue: designation,
    });
    return designation;
  }

  /** Hard-delete when unused; otherwise deactivate so history stays intact. */
  async remove(user: AuthUser, id: string) {
    const designation = await this.prisma.designation.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!designation) throw Errors.notFound('Designation');

    const inUse = await this.prisma.worker.count({
      where: { designationId: id, deletedAt: null },
    });

    if (inUse > 0) {
      await this.prisma.designation.update({ where: { id }, data: { isActive: false } });
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'DESIGNATION_DEACTIVATE',
        entityType: 'Designation',
        entityId: id,
        oldValue: designation,
        reason: `${inUse} worker(s) still assigned`,
      });
      return { deleted: false, deactivated: true, workersAssigned: inUse };
    }

    await this.prisma.designation.delete({ where: { id } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'DESIGNATION_DELETE',
      entityType: 'Designation',
      entityId: id,
      oldValue: designation,
    });
    return { deleted: true };
  }
}
