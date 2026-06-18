import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { StorageMonitor } from './storage.monitor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [StorageController],
  providers: [StorageService, StorageMonitor],
  exports: [StorageService],
})
export class StorageModule {}
