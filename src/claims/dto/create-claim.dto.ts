import { ApiProperty } from '@nestjs/swagger';
import { ClaimReason } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateClaimDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty({ enum: ClaimReason })
  @IsEnum(ClaimReason)
  reason: ClaimReason;

  @ApiProperty()
  @IsString()
  description: string;
}
