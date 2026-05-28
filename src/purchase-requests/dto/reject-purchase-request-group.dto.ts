import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectPurchaseRequestGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observation?: string;
}
