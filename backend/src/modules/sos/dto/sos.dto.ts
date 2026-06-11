import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class TriggerSosDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @ApiProperty({ required: false, description: 'Stable device uid (helps locate the phone)' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  deviceUid?: string;

  @ApiProperty({ required: false, description: 'Known site id (e.g. last-selected site)' })
  @IsOptional()
  @IsString()
  siteId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  message?: string;
}
