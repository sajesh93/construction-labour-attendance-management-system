import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationProfileDto,
} from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** The caller's own organization (company profile for the ID card). */
  getCurrent(user: AuthUser) {
    return this.get(user.organizationId);
  }

  /** Update the caller's own company profile. Editable by Super + Site Admin. */
  async updateProfile(user: AuthUser, dto: UpdateOrganizationProfileDto) {
    const before = await this.get(user.organizationId);
    // Blank strings clear the field; undefined leaves it untouched; numbers pass through.
    const data: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      data[k] = typeof v === 'string' && v.trim() === '' ? null : v;
    }
    const org = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'ORG_PROFILE_UPDATE',
      entityType: 'Organization',
      entityId: user.organizationId,
      oldValue: before,
      newValue: org,
    });
    return org;
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
