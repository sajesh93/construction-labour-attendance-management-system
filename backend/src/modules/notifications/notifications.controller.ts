import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Polled by the admin panel and the mobile app (any authenticated user). */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('since') since?: string,
    @Query('type') type?: string,
  ) {
    return this.notifications.list(user, since, type);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }
}
