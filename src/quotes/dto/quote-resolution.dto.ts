import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowInfinity: false, allowNaN: false })
  @Min(0.01)
  @Max(999999.99)
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
