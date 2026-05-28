import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findMyCart(@CurrentUser() user: { sub: string }) {
    return this.cartService.findMyCart(user.sub);
  }

  @Post('items')
  addItem(@CurrentUser() user: { sub: string }, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.sub, dto);
  }

  @Patch('items/:id')
  updateItem(@CurrentUser() user: { sub: string }, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(user.sub, id, dto);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.cartService.removeItem(user.sub, id);
  }

  @Delete('clear')
  clear(@CurrentUser() user: { sub: string }) {
    return this.cartService.clear(user.sub);
  }
}
