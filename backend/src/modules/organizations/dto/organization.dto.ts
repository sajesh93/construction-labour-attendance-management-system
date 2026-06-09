import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 40)
  code!: string;

  @ApiProperty({ default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
