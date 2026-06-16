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

const startDevTimer = (label: string) => {
  if (process.env.NODE_ENV === 'production') return () => undefined;
  const startedAt = performance.now();
  return () => {
    const duration = performance.now() - startedAt;
    console.log(`${label}: ${duration.toFixed(3)}ms`);
  };
};

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async findMyCart(@CurrentUser() user: { sub: string }) {
    const endTimer = startDevTimer('cart-controller-find-my-cart');
    try {
      return await this.cartService.findMyCart(user.sub);
    } finally {
      endTimer();
    }
  }

  @Post('items')
  async addItem(@CurrentUser() user: { sub: string }, @Body() dto: AddCartItemDto) {
    const endTimer = startDevTimer('cart-controller-add-item');
    try {
      return await this.cartService.addItem(user.sub, dto);
    } finally {
      endTimer();
    }
  }

  @Patch('items/:id')
  async updateItem(@CurrentUser() user: { sub: string }, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    const endTimer = startDevTimer('cart-controller-update-item');
    try {
      return await this.cartService.updateItem(user.sub, id, dto);
    } finally {
      endTimer();
    }
  }

  @Delete('items/:id')
  async removeItem(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    const endTimer = startDevTimer('cart-controller-remove-item');
    try {
      return await this.cartService.removeItem(user.sub, id);
    } finally {
      endTimer();
    }
  }

  @Delete('clear')
  clear(@CurrentUser() user: { sub: string }) {
    return this.cartService.clear(user.sub);
  }
}
