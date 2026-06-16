import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationProfileDto,
} from './dto/organization.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  // ---- Company profile for the caller's own org (used by ID-card printing) ----
  // Readable by any authenticated user (admin badges page + mobile Safety Officer
  // both stamp the company header on cards). Editable by Super + Site Admin.

  @Get('current')
  getCurrent(@CurrentUser() user: AuthUser) {
    return this.orgs.getCurrent(user);
  }

  @Patch('current')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizationProfileDto) {
    return this.orgs.updateProfile(user, dto);
  }

  // ---- Multi-tenant admin (super admin only) ----

  @Get()
  @RequirePermissions(Permission.ORG_MANAGE)
  list() {
    return this.orgs.list();
  }

  @Get(':id')
  @RequirePermissions(Permission.ORG_MANAGE)
  get(@Param('id') id: string) {
    return this.orgs.get(id);
  }

  @Post()
  @RequirePermissions(Permission.ORG_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    return this.orgs.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ORG_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgs.update(user, id, dto);
  }
}
