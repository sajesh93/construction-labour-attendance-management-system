import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AttendanceService } from './attendance.service';
import { SyncService } from './sync.service';
import { ConfirmDto, TapDto } from './dto/attendance.dto';
import { RequirePermissions, RequiresDevice } from '../../common/rbac/rbac.decorators';
import { Permission } from '../../common/rbac/permissions';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SyncDto {
  @IsUUID()
  deviceId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TapDto)
  events!: TapDto[];
}

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly sync: SyncService,
  ) {}

  @Post('tap')
  @RequiresDevice()
  @RequirePermissions(Permission.ATTENDANCE_MARK)
  tap(@CurrentUser() user: AuthUser, @Body() dto: TapDto, @Req() req: Request) {
    return this.attendance.handleTap(user.organizationId, dto, {
      deviceId: dto.deviceId,
      ip: req.ip,
    });
  }

  @Post('confirm')
  @RequiresDevice()
  @RequirePermissions(Permission.ATTENDANCE_MARK)
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmDto, @Req() req: Request) {
    return this.attendance.confirm(user.organizationId, dto.eventId, {
      deviceId: (req.headers['x-device-id'] as string) ?? '',
      ip: req.ip,
    });
  }

  @Get('active')
  @RequirePermissions(Permission.ATTENDANCE_VIEW)
  active(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId?: string,
    @Query('category') category?: string,
  ) {
    return this.attendance.activeSessions(user, siteId, category);
  }

  @Get('dashboard-stats')
  @RequirePermissions(Permission.ATTENDANCE_VIEW)
  dashboardStats(@CurrentUser() user: AuthUser) {
    return this.attendance.dashboardStats(user);
  }

  @Get('day-summary')
  @RequirePermissions(Permission.ATTENDANCE_VIEW)
  daySummary(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId?: string,
    @Query('date') date?: string,
    @Query('category') category?: string,
  ) {
    return this.attendance.daySummary(user, siteId, date, category);
  }

  @Get('worker/:workerId/summary')
  @RequirePermissions(Permission.ATTENDANCE_VIEW)
  summary(
    @CurrentUser() user: AuthUser,
    @Param('workerId') workerId: string,
    @Query('month') month: string,
  ) {
    return this.attendance.workerSummary(user.organizationId, workerId, month);
  }

  @Post('/sync')
  @RequiresDevice()
  @RequirePermissions(Permission.ATTENDANCE_MARK)
  syncBatch(@CurrentUser() user: AuthUser, @Body() dto: SyncDto, @Req() req: Request) {
    return this.sync.ingest(user.organizationId, dto.deviceId, dto.events, {
      deviceId: dto.deviceId,
      ip: req.ip,
    });
  }
}
