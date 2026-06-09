import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import {
  CreateShiftDto,
  CreateSiteDto,
  UpdateShiftDto,
  UpdateSiteDto,
  UpdateSiteSettingsDto,
} from './dto/site.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('sites')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @RequirePermissions(Permission.SITE_MANAGE)
  list(@CurrentUser() user: AuthUser, @Query('active') active?: string) {
    return this.sites.list(user, active === undefined ? undefined : active === 'true');
  }

  @Get(':id')
  @RequirePermissions(Permission.SITE_MANAGE)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sites.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.SITE_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSiteDto) {
    return this.sites.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SITE_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sites.update(user, id, dto);
  }

  @Get(':id/settings')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  getSettings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sites.getSettings(user, id);
  }

  @Put(':id/settings')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSiteSettingsDto,
  ) {
    return this.sites.updateSettings(user, id, dto);
  }

  @Get(':id/shifts')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  listShifts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sites.listShifts(user, id);
  }

  @Post(':id/shifts')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  createShift(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateShiftDto,
  ) {
    return this.sites.createShift(user, id, dto);
  }
}
