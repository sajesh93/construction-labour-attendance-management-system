import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@clams.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
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
