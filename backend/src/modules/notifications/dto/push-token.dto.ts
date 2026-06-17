import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @ApiProperty({ description: 'FCM device registration token' })
  @IsString()
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ required: false, description: 'Hardware/device UID (to skip the sender on SOS)' })
  @IsOptional()
  @IsString()
  deviceUid?: string;

  @ApiProperty({ required: false, description: 'android | ios' })
  @IsOptional()
  @IsString()
  platform?: string;
}
