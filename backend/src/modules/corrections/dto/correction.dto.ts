import { ApiProperty } from '@nestjs/swagger';
import { CorrectionReason, CorrectionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CorrectionItemDto {
  @ApiProperty({ description: 'Session field to change, e.g. login_at, logout_at, site_id' })
  @IsString()
  field!: string;

  @ApiProperty({ description: 'Proposed new value (typed JSON)' })
  proposedValue!: unknown;
}

export class CreateCorrectionDto {
  @ApiProperty()
  @IsUUID()
  workerId!: string;

  @ApiProperty()
  @IsUUID()
  siteId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty()
  @IsDateString()
  workDate!: string;

  @ApiProperty({ enum: CorrectionType })
  @IsEnum(CorrectionType)
  type!: CorrectionType;

  @ApiProperty({ enum: CorrectionReason })
  @IsEnum(CorrectionReason)
  reason!: CorrectionReason;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CorrectionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectionItemDto)
  items!: CorrectionItemDto[];
}

export class ReviewCorrectionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
