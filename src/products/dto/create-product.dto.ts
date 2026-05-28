import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityType, ProductType } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class CreateProductDto {
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
  @IsNumber()
  @Min(0)
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
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimatedDispatchDays?: number;

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
}
