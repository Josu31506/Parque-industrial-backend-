import { ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityType, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryProductsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  producerId?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ enum: AvailabilityType })
  @IsOptional()
  @IsEnum(AvailabilityType)
  availabilityType?: AvailabilityType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 12;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;
}
