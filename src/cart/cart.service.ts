import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  findMyCart(userId: string) {
    return this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: { include: { producer: true, category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findFirstOrThrow({
      where: { id: dto.productId, isActive: true },
    });

    if (product.availabilityType === AvailabilityType.IN_STOCK && product.stock !== null && dto.quantity > product.stock) {
      throw new BadRequestException('Stock insuficiente.');
    }

    return this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId: dto.productId } },
      create: { userId, productId: dto.productId, quantity: dto.quantity },
      update: { quantity: { increment: dto.quantity } },
      include: { product: true },
    });
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findUniqueOrThrow({ where: { id: itemId } });
    if (item.userId !== userId) throw new ForbiddenException('No puedes modificar este item.');

    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
      include: { product: true },
    });
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUniqueOrThrow({ where: { id: itemId } });
    if (item.userId !== userId) throw new ForbiddenException('No puedes eliminar este item.');

    return this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  clear(userId: string) {
    return this.prisma.cartItem.deleteMany({ where: { userId } });
  }
}
