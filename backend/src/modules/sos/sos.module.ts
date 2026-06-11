import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SosController],
  providers: [SosService],
})
export class SosModule {}
