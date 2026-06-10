import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional } from 'class-validator';

export enum ReportType {
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  WORKER = 'WORKER',
  VENDOR = 'VENDOR',
  SITE = 'SITE',
  OVERTIME = 'OVERTIME',
  CORRECTION = 'CORRECTION',
}

export enum ReportFormat {
  XLSX = 'XLSX',
  CSV = 'CSV',
  PDF = 'PDF',
}

export class PreviewReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType!: ReportType;

  @ApiProperty({
    description: 'Report params, e.g. { date, month, siteId, vendorId, workerId, from, to }',
  })
  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType!: ReportType;

  @ApiProperty({ enum: ReportFormat })
  @IsEnum(ReportFormat)
  format!: ReportFormat;

  @ApiProperty({
    description: 'Report params, e.g. { date, month, siteId, vendorId, workerId, from, to }',
  })
  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;
}
