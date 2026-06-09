import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { assertSiteInScope, siteScopeFilter } from '../../common/auth/scope.util';
import { Errors } from '../../common/errors/app.exception';
import { isOvernight, parseTimeOfDay } from '../../common/time/time.util';
import {
  CreateShiftDto,
  CreateSiteDto,
  UpdateShiftDto,
  UpdateSiteDto,
  UpdateSiteSettingsDto,
} from './dto/site.dto';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, active?: boolean) {
    return this.prisma.site.findMany({
      where: {
        organizationId: user.organizationId,
        ...siteScopeFilter(user),
        ...(active === undefined ? {} : { isActive: active }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    assertSiteInScope(user, id);
    const site = await this.prisma.site.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { settings: true },
    });
    if (!site) throw Errors.notFound('Site');
    return site;
  }

  async create(user: AuthUser, dto: CreateSiteDto) {
    const site = await this.prisma.site.create({
      data: { ...dto, organizationId: user.organizationId },
    });
    // Create default settings row.
    await this.prisma.siteSettings.create({ data: { siteId: site.id } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'SITE_CREATE',
      entityType: 'Site',
      entityId: site.id,
      newValue: site,
    });
    return site;
  }

  async update(user: AuthUser, id: string, dto: UpdateSiteDto) {
    const before = await this.get(user, id);
    const site = await this.prisma.site.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'SITE_UPDATE',
      entityType: 'Site',
      entityId: id,
      oldValue: before,
      newValue: site,
    });
    return site;
  }

  async getSettings(user: AuthUser, siteId: string) {
    await this.get(user, siteId);
    const settings = await this.prisma.siteSettings.findUnique({ where: { siteId } });
    return settings ?? this.prisma.siteSettings.create({ data: { siteId } });
  }

  async updateSettings(user: AuthUser, siteId: string, dto: UpdateSiteSettingsDto) {
    await this.get(user, siteId);
    const before = await this.prisma.siteSettings.findUnique({ where: { siteId } });
    const settings = await this.prisma.siteSettings.upsert({
      where: { siteId },
      update: { ...dto },
      create: { siteId, ...dto },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'SITE_SETTINGS_UPDATE',
      entityType: 'SiteSettings',
      entityId: siteId,
      oldValue: before,
      newValue: settings,
    });
    return settings;
  }

  listShifts(user: AuthUser, siteId: string) {
    assertSiteInScope(user, siteId);
    return this.prisma.shift.findMany({ where: { siteId }, orderBy: { startTime: 'asc' } });
  }

  async createShift(user: AuthUser, siteId: string, dto: CreateShiftDto) {
    await this.get(user, siteId);
    const start = parseTimeOfDay(dto.startTime);
    const end = parseTimeOfDay(dto.endTime);
    const shift = await this.prisma.shift.create({
      data: {
        siteId,
        name: dto.name,
        startTime: start,
        endTime: end,
        isOvernight: isOvernight(start, end),
        lateGraceMinutes: dto.lateGraceMinutes ?? 0,
        earlyGraceMinutes: dto.earlyGraceMinutes ?? 0,
        otThresholdMinutes: dto.otThresholdMinutes ?? 0,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'SHIFT_CREATE',
      entityType: 'Shift',
      entityId: shift.id,
      newValue: shift,
    });
    return shift;
  }

  async updateShift(user: AuthUser, shiftId: string, dto: UpdateShiftDto) {
    const existing = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!existing) throw Errors.notFound('Shift');
    assertSiteInScope(user, existing.siteId);

    const start = dto.startTime ? parseTimeOfDay(dto.startTime) : existing.startTime;
    const end = dto.endTime ? parseTimeOfDay(dto.endTime) : existing.endTime;

    const shift = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        name: dto.name,
        startTime: start,
        endTime: end,
        isOvernight: isOvernight(start, end),
        lateGraceMinutes: dto.lateGraceMinutes,
        earlyGraceMinutes: dto.earlyGraceMinutes,
        otThresholdMinutes: dto.otThresholdMinutes,
        isActive: dto.isActive,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'SHIFT_UPDATE',
      entityType: 'Shift',
      entityId: shiftId,
      oldValue: existing,
      newValue: shift,
    });
    return shift;
  }
}
