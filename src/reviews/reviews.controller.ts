import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @Get('product/:productId/eligibility')
  eligibility(
    @Param('productId') productId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.reviewsService.eligibility(productId, user.sub);
  }

  @Get('product/:productId')
  listForProduct(@Param('productId') productId: string, @Query() query: SmallPaginationQueryDto) {
    return this.reviewsService.listForProduct(productId, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.sub, dto);
  }
}
