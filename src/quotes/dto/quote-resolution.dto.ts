import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class QuoteResolutionDto {
  @ApiProperty()
  @IsString()
  producerId: string;

  @ApiProperty()
  @IsString()
  finalTitle: string;

  @ApiProperty()
  @IsString()
  finalDescription: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  finalPrice: number;

  @ApiProperty()
  @IsString()
  deliveryTime: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;
}
