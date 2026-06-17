import { ApiProperty } from '@nestjs/swagger';
import { ClaimReason } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClaimDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty({ enum: ClaimReason })
  @IsEnum(ClaimReason)
  reason: ClaimReason;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  evidenceImages?: string[];
}
