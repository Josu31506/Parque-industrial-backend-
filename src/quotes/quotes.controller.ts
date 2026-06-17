import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteResolutionDto } from './dto/quote-resolution.dto';
import { RespondQuoteDto } from './dto/respond-quote.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Roles(Role.CLIENT)
  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(user.sub, dto);
  }

  @Roles(Role.CLIENT)
  @Get('my')
  my(@CurrentUser() user: { sub: string }, @Query() query: SmallPaginationQueryDto) {
    return this.quotesService.my(user.sub, query);
  }

  @Roles(Role.ADMIN)
  @Get()
  all(@Query() query: SmallPaginationQueryDto) {
    return this.quotesService.findAll(query);
  }

  @Roles(Role.ADVISOR, Role.ADMIN)
  @Get('image')
  imageQuotes(@Query() query: SmallPaginationQueryDto) {
    return this.quotesService.findImageQuotes(query);
  }

  @Roles(Role.SELLER)
  @Get('seller')
  sellerQuotes(@CurrentUser() user: { sub: string }, @Query() query: SmallPaginationQueryDto) {
    return this.quotesService.findSellerQuotes(user.sub, query);
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Get(':id')
  one(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.quotesService.findOne(id, user);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: UpdateQuoteStatusDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.quotesService.updateStatus(id, dto.status, user);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Post(':id/resolution')
  resolution(@Param('id') id: string, @Body() dto: QuoteResolutionDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.quotesService.addResolution(id, dto, user);
  }

  @Roles(Role.SELLER)
  @Patch(':id/respond')
  respond(@Param('id') id: string, @Body() dto: RespondQuoteDto, @CurrentUser() user: { sub: string }) {
    return this.quotesService.respond(id, dto, user.sub);
  }

  @Roles(Role.CLIENT)
  @Post(':id/add-to-cart')
  addToCart(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.quotesService.addToCart(id, user.sub);
  }
}
