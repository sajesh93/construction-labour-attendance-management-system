import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@RequirePermissions(Permission.ORG_MANAGE)
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  list() {
    return this.orgs.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orgs.get(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    return this.orgs.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgs.update(user, id, dto);
  }
}
