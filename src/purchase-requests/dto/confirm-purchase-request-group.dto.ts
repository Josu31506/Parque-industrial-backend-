import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class ConfirmPurchaseRequestGroupDto {
  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  readyDate: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observation?: string;
}
