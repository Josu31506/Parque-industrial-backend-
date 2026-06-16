import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

const cartItemSummarySelect = {
  id: true,
  userId: true,
  productId: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
} as const;

const cartItemWithProductSelect = {
  ...cartItemSummarySelect,
  product: {
    select: {
      id: true,
      title: true,
      price: true,
      numericPrice: true,
      imageUrl: true,
      stock: true,
      availabilityType: true,
      requiresConfirmation: true,
      producerId: true,
      categoryId: true,
      producer: {
        select: {
          id: true,
          businessName: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyCart(userId: string) {
    const endServiceTimer = startDevTimer('cart-service-find-my-cart');
    try {
      const endPrismaTimer = startDevTimer('prisma-cart-findMany');
      try {
        return await this.prisma.cartItem.findMany({
          where: { userId },
          select: cartItemWithProductSelect,
          orderBy: { createdAt: 'desc' },
        });
      } finally {
        endPrismaTimer();
      }
    } finally {
      endServiceTimer();
    }
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const endServiceTimer = startDevTimer('cart-service-add-item');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const endProductTimer = startDevTimer('prisma-cart-product-findFirst');
        const product = await tx.product.findFirstOrThrow({
          where: { id: dto.productId, isActive: true },
          select: {
            id: true,
            stock: true,
            availabilityType: true,
          },
        }).finally(endProductTimer);

        if (product.availabilityType === AvailabilityType.IN_STOCK && (product.stock === null || dto.quantity > product.stock)) {
          throw new BadRequestException('Stock insuficiente.');
        }

        const endUpsertTimer = startDevTimer('prisma-cart-upsert');
        const item = await tx.cartItem.upsert({
          where: { userId_productId: { userId, productId: dto.productId } },
          create: { userId, productId: dto.productId, quantity: dto.quantity },
          update: { quantity: { increment: dto.quantity } },
          select: cartItemSummarySelect,
        }).finally(endUpsertTimer);

        if (product.availabilityType === AvailabilityType.IN_STOCK && item.quantity > (product.stock ?? 0)) {
          throw new BadRequestException('Stock insuficiente.');
        }

        return item;
      });
    } finally {
      endServiceTimer();
    }
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const endServiceTimer = startDevTimer('cart-service-update-item');
    try {
      const endFindTimer = startDevTimer('prisma-cart-findUnique-for-update');
      const item = await this.prisma.cartItem.findUniqueOrThrow({
        where: { id: itemId },
        select: {
          id: true,
          userId: true,
          product: {
            select: {
              stock: true,
              availabilityType: true,
            },
          },
        },
      }).finally(endFindTimer);
      if (item.userId !== userId) throw new ForbiddenException('No puedes modificar este item.');
      if (item.product.availabilityType === AvailabilityType.IN_STOCK && (item.product.stock === null || dto.quantity > item.product.stock)) {
        throw new BadRequestException('Stock insuficiente.');
      }

      const endUpdateTimer = startDevTimer('prisma-cart-update');
      return await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity },
        select: cartItemSummarySelect,
      }).finally(endUpdateTimer);
    } finally {
      endServiceTimer();
    }
  }

  async removeItem(userId: string, itemId: string) {
    const endServiceTimer = startDevTimer('cart-service-remove-item');
    try {
      const endDeleteTimer = startDevTimer('prisma-cart-deleteMany');
      const result = await this.prisma.cartItem.deleteMany({
        where: {
          id: itemId,
          userId,
        },
      })
        .finally(endDeleteTimer);

      if (result.count === 0) {
        throw new ForbiddenException('No puedes eliminar este item.');
      }

      return { id: itemId, deleted: true };
    } finally {
      endServiceTimer();
    }
  }

  clear(userId: string) {
    return this.prisma.cartItem.deleteMany({ where: { userId } });
  }
}
