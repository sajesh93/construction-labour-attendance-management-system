import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/report.dto';
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
