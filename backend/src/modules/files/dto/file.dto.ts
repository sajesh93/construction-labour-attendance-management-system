import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class UploadFileDto {
  @ApiProperty({ description: 'Base64-encoded image bytes (no data: prefix)' })
  @IsString()
  dataBase64!: string;

  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsIn(ALLOWED_IMAGE_TYPES)
  mimeType!: string;
}
