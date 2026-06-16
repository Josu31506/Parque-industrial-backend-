import { PaginationQueryDto } from './pagination-query.dto';

export class SmallPaginationQueryDto extends PaginationQueryDto {
  limit = 5;
}
