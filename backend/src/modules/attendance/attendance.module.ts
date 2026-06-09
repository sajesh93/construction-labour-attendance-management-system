import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { SyncService } from './sync.service';
import { AttendanceController } from './attendance.controller';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  providers: [AttendanceService, SyncService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
