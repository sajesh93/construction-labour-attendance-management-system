import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { DeviceAuthService } from './device-auth.service';

@Module({
  providers: [DevicesService, DeviceAuthService],
  controllers: [DevicesController],
  exports: [DeviceAuthService],
})
export class DevicesModule {}
