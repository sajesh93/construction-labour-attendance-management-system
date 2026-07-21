import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditQueryService } from './audit-query.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditQueryController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_VIEW)
  query(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('excludeActions') excludeActions?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.audit.query(user, {
      entityType,
      entityId,
      actorUserId,
      action,
      excludeActions: excludeActions
        ? excludeActions
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
        : undefined,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }
}
