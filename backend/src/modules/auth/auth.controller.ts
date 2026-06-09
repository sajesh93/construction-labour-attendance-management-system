import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { DeviceAuthService } from '../devices/device-auth.service';
import { DeviceRegisterDto, DeviceTokenDto, LoginDto, LogoutDto, RefreshDto } from './dto/auth.dto';
import { Public } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly deviceAuth: DeviceAuthService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, req.ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser('userId') userId: string) {
    return this.auth.me(userId);
  }

  @ApiBearerAuth()
  @Post('device/register')
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: DeviceRegisterDto) {
    return this.deviceAuth.register(user.organizationId, dto.deviceUid, dto.platform, dto.label);
  }

  @ApiBearerAuth()
  @Post('device/token')
  deviceToken(@CurrentUser() user: AuthUser, @Body() dto: DeviceTokenDto) {
    return this.deviceAuth.issueToken(user.organizationId, dto.deviceId);
  }
}
