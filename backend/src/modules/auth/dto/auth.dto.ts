import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class LoginDto {
  // Email OR username; the legacy `email` field is accepted as an alias so
  // older app builds keep working.
  @ApiProperty({ example: 'admin@clams.local', required: false })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiProperty({ required: false, description: 'Deprecated alias of identifier' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email or user ID' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ description: 'Email or user ID' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resetToken!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @Length(8, 128)
  newPassword!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class DeviceRegisterDto {
  @ApiProperty({ description: 'Stable hardware/install identifier from the app' })
  @IsString()
  @IsNotEmpty()
  deviceUid!: string;

  @ApiProperty({ enum: ['android', 'ios'], required: false })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;
}

export class DeviceTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deviceId!: string;
}
