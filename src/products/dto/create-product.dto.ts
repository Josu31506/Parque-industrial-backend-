import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityType, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class CreateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty()
  @IsString()
  producerId: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowInfinity: false, allowNaN: false })
  @Min(0.01)
  @Max(999999.99)
  numericPrice: number;

  @ApiProperty()
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badge?: string;

  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiProperty({ enum: AvailabilityType })
  @IsEnum(AvailabilityType)
  availabilityType: AvailabilityType;

  @ApiPropertyOptional()
  @ValidateIf((dto: CreateProductDto) => dto.availabilityType === AvailabilityType.IN_STOCK)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedDispatchDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dimensions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  materials?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finish?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  customizable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
