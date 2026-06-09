import { Module } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { AuditQueryController } from './audit-query.controller';

@Module({
  providers: [AuditQueryService],
  controllers: [AuditQueryController],
})
export class AuditQueryModule {}
