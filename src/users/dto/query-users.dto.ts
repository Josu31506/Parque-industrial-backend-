import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { SmallPaginationQueryDto } from '../../common/dto/small-pagination-query.dto';

export class QueryUsersDto extends SmallPaginationQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
