import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto, PreviewReportDto } from './dto/report.dto';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @RequirePermissions(Permission.REPORTS_ALL)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user, dto);
  }

  // Runs the report and returns rows as JSON without persisting a job, so the
  // admin can review the output before downloading.
  @Post('preview')
  @RequirePermissions(Permission.REPORTS_ALL)
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewReportDto) {
    return this.reports.preview(user, dto.reportType, dto.params ?? {});
  }

  @Get()
  @RequirePermissions(Permission.REPORTS_ALL)
  list(@CurrentUser() user: AuthUser, @Query('type') type?: string) {
    return this.reports.list(user, type);
  }

  @Get(':id')
  @RequirePermissions(Permission.REPORTS_ALL)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.get(user, id);
  }
}
