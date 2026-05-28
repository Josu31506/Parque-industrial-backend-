import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProducerDto } from './dto/create-producer.dto';
import { UpdateProducerDto } from './dto/update-producer.dto';
import { ProducersService } from './producers.service';

@ApiTags('producers')
@Controller('producers')
export class ProducersController {
  constructor(private readonly producersService: ProducersService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProducerDto) {
    return this.producersService.create(dto);
  }

  @Get()
  findAll() {
    return this.producersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.producersService.findOne(id);
  }

  @Get(':id/products')
  products(@Param('id') id: string) {
    return this.producersService.products(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SELLER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProducerDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.producersService.update(id, dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.producersService.approve(id);
  }
}
