import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CredentialKind, PersonCategory, WorkerStatus } from '@prisma/client';
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
  @ApiProperty({ required: false, description: 'Auto-generated when omitted (W-/S-/V- prefix)' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  workerCode?: string;

  @ApiProperty({
    required: false,
    enum: PersonCategory,
    description: 'WORKER (default) | STAFF | VISITOR',
  })
  @IsOptional()
  @IsEnum(PersonCategory)
  category?: PersonCategory;

  @ApiProperty({ required: false, description: 'Designation id (see /designations)' })
  @IsOptional()
  @IsString()
  designationId?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fatherName?: string;

  @ApiProperty({ required: false, description: 'M / F / OTHER' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nomineeName?: string;

  @ApiProperty({ required: false, description: 'Relation to nominee, e.g. Wife' })
  @IsOptional()
  @IsString()
  nomineeRelation?: string;

  @ApiProperty({ required: false, description: 'Nature of contractor / work, e.g. D&B' })
  @IsOptional()
  @IsString()
  natureOfContractor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ifscCode?: string;

  @ApiProperty({ required: false, description: 'Government ID type, e.g. Aadhaar' })
  @IsOptional()
  @IsString()
  govIdType?: string;

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

  @ApiProperty({
    required: false,
    description: 'Government ID number (e.g. Aadhaar); encrypted at rest, never returned',
  })
  @IsOptional()
  @Matches(/^[0-9 ]{6,24}$/, { message: 'ID number must be 6-24 digits/spaces' })
  aadhaar?: string;

  @ApiProperty({
    required: false,
    description: 'PAN card number (ABCDE1234F); encrypted at rest, never returned',
  })
  @IsOptional()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, { message: 'PAN must look like ABCDE1234F' })
  pan?: string;

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
