import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Current DB usage + per-site freeable-space breakdown (oldest site first). */
  @Get('usage')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  usage(@CurrentUser() user: AuthUser) {
    return this.storage.usage(user);
  }

  /**
   * Build a multi-sheet XLSX backup of a site's data (SUPER_ADMIN only) and
   * return it as base64 so it passes through the admin's JSON-only BFF.
   */
  @Get('sites/:id/backup')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async backup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { filename, buffer } = await this.storage.backup(user, id);
    return {
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: buffer.toString('base64'),
    };
  }

  /** Clear a site's attendance + exclusive images to free space (SUPER_ADMIN;
   * requires a fresh backup taken via the endpoint above). */
  @Post('sites/:id/purge')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  purge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storage.purge(user, id);
  }
}
