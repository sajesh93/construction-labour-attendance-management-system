import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw Errors.notFound('Organization');
    return org;
  }

  async create(user: AuthUser, dto: CreateOrganizationDto) {
    const org = await this.prisma.organization.create({ data: dto });
    await this.audit.record({
      organizationId: org.id,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'ORG_CREATE',
      entityType: 'Organization',
      entityId: org.id,
      newValue: org,
    });
    return org;
  }

  async update(user: AuthUser, id: string, dto: UpdateOrganizationDto) {
    const before = await this.get(id);
    const org = await this.prisma.organization.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId: id,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'ORG_UPDATE',
      entityType: 'Organization',
      entityId: id,
      oldValue: before,
      newValue: org,
    });
    return org;
  }
}
