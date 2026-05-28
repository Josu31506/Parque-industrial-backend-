import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(Role.CLIENT)
  @Get('my')
  my(@CurrentUser() user: { sub: string }) {
    return this.ordersService.findMyOrders(user.sub);
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

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Patch(':id/mark-delivered')
  delivered(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.markDelivered(id, user);
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Patch(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.ordersService.close(id, user);
  }
}
