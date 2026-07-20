import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import archiver from 'archiver';
import { WorkersService } from './workers.service';
import {
  AssignSiteDto,
  BindCredentialDto,
  CreateWorkerDto,
  ExitWorkerDto,
  ExportDocumentsDto,
  RehireWorkerDto,
  UpdateWorkerDto,
} from './dto/worker.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission, roleHasPermission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('workers')
@ApiBearerAuth()
@Controller('workers')
export class WorkersController {
  private readonly logger = new Logger(WorkersController.name);

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

  // Watchman/supervisor warm their offline cache from this scoped, limited list.
  @Get('by-site')
  @RequirePermissions(Permission.WORKER_VIEW_LIMITED)
  bySite(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.workers.listBySite(user, siteId);
  }

  // Safety officer bulk badge printing: records I touched today.
  @Get('my-recent')
  @RequirePermissions(Permission.WORKER_MANAGE)
  myRecent(@CurrentUser() user: AuthUser) {
    return this.workers.myRecent(user);
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
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.workers.list(user, {
      siteId,
      vendorId,
      status,
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
      category,
      sortBy,
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.WORKER_MANAGE)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reveal') reveal?: string) {
    // Aadhaar reveal additionally requires the sensitive permission. Ask the
    // role table rather than naming roles here — the Safety Officer (SUPERVISOR)
    // holds WORKER_VIEW_SENSITIVE because they capture these details at
    // registration, and a hardcoded list silently masked them.
    const wantsReveal =
      reveal === 'true' && roleHasPermission(user.role, Permission.WORKER_VIEW_SENSITIVE);
    return this.workers.get(user, id, wantsReveal);
  }

  /**
   * Streams a zip of the selected people's photos and ID cards, one folder per
   * person. POST (not GET) because the id list can be long, and it keeps the
   * ids out of access logs — these downloads are audited on the way through.
   */
  @Post('documents')
  @RequirePermissions(Permission.WORKER_MANAGE)
  async documents(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExportDocumentsDto,
    @Res() res: Response,
  ) {
    const archive = archiver('zip', {
      // The payload is JPEG: already compressed, so deflate would burn CPU to
      // save almost nothing. Store and let it stream.
      store: true,
    });
    archive.on('warning', (e) => this.logger.warn(`Zip warning: ${String(e)}`));
    archive.on('error', (e) => {
      this.logger.error(`Zip failed: ${String(e)}`);
      res.destroy(e);
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.zip"');
    res.setHeader('Cache-Control', 'no-store');
    archive.pipe(res);

    try {
      for await (const file of this.workers.documentFiles(user, dto.ids)) {
        archive.append(file.data, { name: file.path });
      }
    } catch (e) {
      // Headers are already sent, so the usual exception filter cannot turn
      // this into a JSON error. Abort the stream: the client sees a truncated
      // download rather than a zip that silently omits people.
      this.logger.error(`Document export failed: ${String(e)}`);
      archive.abort();
      res.destroy(e as Error);
      return;
    }
    await archive.finalize();
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
