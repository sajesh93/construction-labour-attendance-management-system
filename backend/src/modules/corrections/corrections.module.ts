import { Module } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { CorrectionsController } from './corrections.controller';

@Module({
  providers: [CorrectionsService],
  controllers: [CorrectionsController],
})
export class CorrectionsModule {}
