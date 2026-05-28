import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.productsService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.productsService.update(id, dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.productsService.remove(id, user);
  }
}
