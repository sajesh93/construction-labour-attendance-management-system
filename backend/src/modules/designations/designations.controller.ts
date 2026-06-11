import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DesignationsService } from './designations.service';
import { CreateDesignationDto, UpdateDesignationDto } from './dto/designation.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('designations')
@ApiBearerAuth()
@Controller('designations')
export class DesignationsController {
  constructor(private readonly designations: DesignationsService) {}

  // Readable by app roles too (worker form dropdown).
  @Get()
  @RequirePermissions(Permission.WORKER_VIEW_LIMITED)
  list(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.designations.list(user, all === 'true');
  }

  @Post()
  @RequirePermissions(Permission.WORKER_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDesignationDto) {
    return this.designations.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.WORKER_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDesignationDto) {
    return this.designations.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.WORKER_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.designations.remove(user, id);
  }
}
