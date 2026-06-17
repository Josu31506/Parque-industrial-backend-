import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(Role.CLIENT)
  @Get('my')
  my(@CurrentUser() user: { sub: string }, @Query() query: SmallPaginationQueryDto) {
    return this.ordersService.findMyOrders(user.sub, query);
  }

  @Roles(Role.CLIENT)
  @Post('checkout')
  checkout(@CurrentUser() user: { sub: string }, @Body() dto: CheckoutOrderDto) {
    return this.ordersService.checkoutCart(user.sub, dto);
  }

  @Roles(Role.ADMIN)
  @Post('release-expired-claims')
  releaseExpiredClaims() {
    return this.ordersService.releaseExpiredClaims();
  }

  @Roles(Role.ADMIN)
  @Post('auto-mark-delivered')
  autoMarkDelivered() {
    return this.ordersService.autoMarkDelivered();
  }

  @Roles(Role.ADMIN)
  @Post('auto-verify-delivered')
  autoVerifyDelivered() {
    return this.ordersService.autoVerifyDelivered();
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Get(':id')
  one(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.findOne(id, user);
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Get(':id/tracking')
  tracking(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.tracking(id, user);
  }

  @Roles(Role.CLIENT, Role.ADMIN)
  @Patch(':id/mark-delivered')
  delivered(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.markDelivered(id, user);
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Patch(':id/verify')
  verify(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.verify(id, user);
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Patch(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.close(id, user);
  }
}
