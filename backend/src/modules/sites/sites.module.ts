import { Module } from '@nestjs/common';
import { SitesService } from './sites.service';
import { SitesController } from './sites.controller';
import { ShiftsController } from './shifts.controller';

@Module({
  providers: [SitesService],
  controllers: [SitesController, ShiftsController],
  exports: [SitesService],
})
export class SitesModule {}
