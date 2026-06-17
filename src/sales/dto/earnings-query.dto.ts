import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { SmallPaginationQueryDto } from '../../common/dto/small-pagination-query.dto';

export class EarningsQueryDto extends SmallPaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}
