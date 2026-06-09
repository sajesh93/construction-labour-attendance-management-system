import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkersService } from './workers.service';
import {
  AssignSiteDto,
  BindCredentialDto,
  CreateWorkerDto,
  ExitWorkerDto,
  RehireWorkerDto,
  UpdateWorkerDto,
} from './dto/worker.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('workers')
@ApiBearerAuth()
@Controller('workers')
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  // Specific routes first so they are not shadowed by ':id'.
  @Get('lookup')
  @RequirePermissions(Permission.WORKER_VIEW_LIMITED)
  lookup(
    @CurrentUser() user: AuthUser,
    @Query('uid') uid?: string,
    @Query('qr') qr?: string,
    @Query('code') code?: string,
  ) {
    return this.workers.lookup(user, { uid, qr, code });
  }

  @Get('search')
  @RequirePermissions(Permission.WORKER_VIEW_LIMITED)
  search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.workers.search(user, q);
  }

  @Get(':id/emergency')
  @RequirePermissions(Permission.EMERGENCY_VIEW)
  emergency(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workers.emergency(user, id);
  }

  @Get()
  @RequirePermissions(Permission.WORKER_MANAGE)
  list(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId?: string,
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.workers.list(user, {
      siteId,
      vendorId,
      status,
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.WORKER_MANAGE)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reveal') reveal?: string) {
    // Aadhaar reveal additionally requires the sensitive permission.
    const wantsReveal = reveal === 'true';
    if (wantsReveal && user.role !== 'SUPER_ADMIN' && user.role !== 'SITE_ADMIN') {
      return this.workers.get(user, id, false);
    }
    return this.workers.get(user, id, wantsReveal);
  }

  @Post()
  @RequirePermissions(Permission.WORKER_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkerDto) {
    return this.workers.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.WORKER_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWorkerDto) {
    return this.workers.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.WORKER_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workers.softDelete(user, id);
  }

  @Post(':id/credentials')
  @RequirePermissions(Permission.WORKER_MANAGE)
  bind(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BindCredentialDto) {
    return this.workers.bindCredential(user, id, dto);
  }

  @Post(':id/assign-site')
  @RequirePermissions(Permission.WORKER_MANAGE)
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignSiteDto) {
    return this.workers.assignSite(user, id, dto);
  }

  @Post(':id/exit')
  @RequirePermissions(Permission.WORKER_MANAGE)
  exit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExitWorkerDto) {
    return this.workers.exit(user, id, dto);
  }

  @Post(':id/rehire')
  @RequirePermissions(Permission.WORKER_MANAGE)
  rehire(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RehireWorkerDto) {
    return this.workers.rehire(user, id, dto);
  }
}
