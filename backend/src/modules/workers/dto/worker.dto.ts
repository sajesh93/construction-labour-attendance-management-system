import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CredentialKind, WorkerStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateWorkerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 40)
  workerCode!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, description: 'Initial site assignment' })
  @IsOptional()
  @IsString()
  siteId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pfNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  esiNumber?: string;

  @ApiProperty({ required: false, description: '12-digit Aadhaar; encrypted at rest, never returned' })
  @IsOptional()
  @Matches(/^\d{12}$/, { message: 'aadhaar must be 12 digits' })
  aadhaar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  joinDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'NFC tag UID' })
  @IsOptional()
  @IsString()
  nfcUid?: string;

  @ApiProperty({ required: false, description: 'Opaque QR identifier (not PII)' })
  @IsOptional()
  @IsString()
  qrIdentifier?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class UpdateWorkerDto extends PartialType(CreateWorkerDto) {
  @ApiProperty({ required: false, enum: WorkerStatus })
  @IsOptional()
  @IsEnum(WorkerStatus)
  status?: WorkerStatus;
}

export class BindCredentialDto {
  @ApiProperty({ enum: CredentialKind })
  @IsEnum(CredentialKind)
  kind!: CredentialKind;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignSiteDto {
  @ApiProperty()
  @IsString()
  siteId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;
}

export class ExitWorkerDto {
  @ApiProperty()
  @IsDateString()
  exitDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RehireWorkerDto {
  @ApiProperty()
  @IsDateString()
  joinDate!: string;

  @ApiProperty()
  @IsString()
  siteId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorId?: string;
}
