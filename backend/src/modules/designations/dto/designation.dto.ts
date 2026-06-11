import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateDesignationDto {
  @ApiProperty({ description: 'Designation name, e.g. Mason, Electrician' })
  @IsString()
  @Length(2, 80)
  name!: string;
}

export class UpdateDesignationDto extends PartialType(CreateDesignationDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
