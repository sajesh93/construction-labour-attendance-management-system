import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { DeviceAuthService } from '../devices/device-auth.service';
import {
  DeviceRegisterDto,
  DeviceTokenDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { Errors } from '../../common/errors/app.exception';
import { DeviceExempt, Public } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';

@ApiTags('auth')
@Controller('auth')
// Auth endpoints stay reachable from unapproved devices — otherwise a pending
// device could never register itself or poll its approval status.
@DeviceExempt()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly deviceAuth: DeviceAuthService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const identifier = (dto.identifier ?? dto.email)?.trim();
    if (!identifier) throw Errors.validation({ identifier: 'required' });
    return this.auth.login(identifier, dto.password, req.ip);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.identifier.trim());
  }

  @Public()
  @Post('forgot-password/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.identifier.trim(), dto.otp);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.resetToken, dto.newPassword);
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
    return this.deviceAuth.register(
      user.organizationId,
      dto.deviceUid,
      dto.platform,
      dto.label,
      user.userId,
      user.role,
      user.email ?? undefined,
    );
  }

  @ApiBearerAuth()
  @Get('device/status')
  deviceStatus(@CurrentUser() user: AuthUser, @Query('uid') uid: string) {
    return this.deviceAuth.status(user.organizationId, uid);
  }

  @ApiBearerAuth()
  @Post('device/token')
  deviceToken(@CurrentUser() user: AuthUser, @Body() dto: DeviceTokenDto) {
    return this.deviceAuth.issueToken(user.organizationId, dto.deviceId);
  }
}
