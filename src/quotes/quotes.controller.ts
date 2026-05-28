import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuoteStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteResolutionDto } from './dto/quote-resolution.dto';
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
  my(@CurrentUser() user: { sub: string }) {
    return this.quotesService.my(user.sub);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Get()
  all() {
    return this.quotesService.findAll();
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Get(':id')
  one(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Patch(':id/status')
  status(@Param('id') id: string, @Body('status') status: QuoteStatus) {
    return this.quotesService.updateStatus(id, status);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Post(':id/resolution')
  resolution(@Param('id') id: string, @Body() dto: QuoteResolutionDto) {
    return this.quotesService.addResolution(id, dto);
  }

  @Roles(Role.CLIENT)
  @Post(':id/add-to-cart')
  addToCart(@Param('id') id: string) {
    return this.quotesService.addToCart(id);
  }
}
