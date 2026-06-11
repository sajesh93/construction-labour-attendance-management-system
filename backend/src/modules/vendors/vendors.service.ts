import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!vendor) throw Errors.notFound('Vendor');
    return vendor;
  }

  async create(user: AuthUser, dto: CreateVendorDto) {
    const vendor = await this.prisma.vendor.create({
      data: { ...dto, organizationId: user.organizationId },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'VENDOR_CREATE',
      entityType: 'Vendor',
      entityId: vendor.id,
      newValue: vendor,
    });
    return vendor;
  }

  async update(user: AuthUser, id: string, dto: UpdateVendorDto) {
    const before = await this.get(user, id);
    const vendor = await this.prisma.vendor.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'VENDOR_UPDATE',
      entityType: 'Vendor',
      entityId: id,
      oldValue: before,
      newValue: vendor,
    });
    return vendor;
  }

  /** Hard-delete when unreferenced; otherwise deactivate so history stays intact. */
  async remove(user: AuthUser, id: string) {
    const vendor = await this.get(user, id);

    const [workers, assignments] = await Promise.all([
      this.prisma.worker.count({ where: { vendorId: id, deletedAt: null } }),
      this.prisma.workerSiteAssignment.count({ where: { vendorId: id } }),
    ]);

    if (workers > 0 || assignments > 0) {
      await this.prisma.vendor.update({ where: { id }, data: { isActive: false } });
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'VENDOR_DEACTIVATE',
        entityType: 'Vendor',
        entityId: id,
        oldValue: vendor,
        reason: `${workers} worker(s) / ${assignments} assignment(s) still reference this vendor`,
      });
      return { deleted: false, deactivated: true, workersAssigned: workers };
    }

    await this.prisma.vendor.delete({ where: { id } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'VENDOR_DELETE',
      entityType: 'Vendor',
      entityId: id,
      oldValue: vendor,
    });
    return { deleted: true };
  }
}
