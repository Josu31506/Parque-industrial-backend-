import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteType } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({ enum: QuoteType })
  @IsEnum(QuoteType)
  type: QuoteType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestedDimensions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestedMaterial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestedColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestedFinish?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryDistrict?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  referenceImages?: string[];
}
