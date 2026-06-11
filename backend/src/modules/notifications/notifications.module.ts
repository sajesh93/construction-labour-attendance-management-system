import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ForgotLogoutMonitor } from './forgot-logout.monitor';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ForgotLogoutMonitor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
