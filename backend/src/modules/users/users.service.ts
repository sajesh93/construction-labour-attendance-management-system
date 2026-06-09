import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { CreateUserDto, SetSiteScopesDto, UpdateUserDto } from './dto/user.dto';

const PUBLIC_SELECT = {
  id: true,
  role: true,
  fullName: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  organizationId: true,
  siteScopes: { select: { siteId: true } },
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const found = await this.prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
      select: PUBLIC_SELECT,
    });
    if (!found) throw Errors.notFound('User');
    return found;
  }

  async create(user: AuthUser, dto: CreateUserDto) {
    const passwordHash = await this.crypto.hashPassword(dto.password);
    const created = await this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        role: dto.role,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        siteScopes: dto.siteIds?.length
          ? { create: dto.siteIds.map((siteId) => ({ siteId })) }
          : undefined,
      },
      select: PUBLIC_SELECT,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: created.id,
      newValue: { role: created.role, email: created.email },
    });
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateUserDto) {
    await this.get(user, id);
    const data: Record<string, unknown> = {
      role: dto.role,
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      isActive: dto.isActive,
    };
    if (dto.password) data.passwordHash = await this.crypto.hashPassword(dto.password);

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: PUBLIC_SELECT,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: id,
      newValue: { role: updated.role, isActive: updated.isActive },
    });
    return updated;
  }

  async setSiteScopes(user: AuthUser, id: string, dto: SetSiteScopesDto) {
    await this.get(user, id);
    await this.prisma.$transaction([
      this.prisma.userSiteScope.deleteMany({ where: { userId: id } }),
      this.prisma.userSiteScope.createMany({
        data: dto.siteIds.map((siteId) => ({ userId: id, siteId })),
        skipDuplicates: true,
      }),
    ]);
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'USER_SCOPES_SET',
      entityType: 'User',
      entityId: id,
      newValue: { siteIds: dto.siteIds },
    });
    return this.get(user, id);
  }
}
