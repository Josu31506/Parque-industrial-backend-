import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

const REVIEWABLE_ORDER_STATUSES: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CLOSED];

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(productId: string, query: SmallPaginationQueryDto) {
    await this.ensureProductExists(productId);

    const { page, limit, skip } = getPagination(query.page, query.limit ?? 5);
    const where: Prisma.ReviewWhereInput = { productId };

    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          productId: true,
          orderId: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);

    return {
      ...paginatedResponse(items, total, page, limit),
      summary: {
        averageRating: summary._avg.rating,
        totalReviews: total,
      },
    };
  }

  async eligibility(productId: string, customerId: string) {
    await this.ensureProductExists(productId);

    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        items: { some: { productId } },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveredAt: true,
        createdAt: true,
        reviews: {
          where: { productId, customerId },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const deliveredOrders = orders.filter((order) => REVIEWABLE_ORDER_STATUSES.includes(order.status));
    const eligibleOrders = deliveredOrders
      .filter((order) => order.reviews.length === 0)
      .map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveredAt: order.deliveredAt,
        createdAt: order.createdAt,
      }));

    if (eligibleOrders.length > 0) {
      return { canReview: true, eligibleOrders };
    }

    const reason = orders.length === 0
      ? 'Solo puedes reseñar productos comprados y entregados.'
      : deliveredOrders.length === 0
        ? 'Podrás reseñar este producto cuando completes una compra entregada.'
        : 'Ya registraste una reseña para este producto en tus pedidos entregados.';

    return { canReview: false, reason, eligibleOrders: [] };
  }

  async create(customerId: string, dto: CreateReviewDto) {
    await this.ensureProductExists(dto.productId);

    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        customerId,
        status: { in: REVIEWABLE_ORDER_STATUSES },
        items: { some: { productId: dto.productId } },
      },
      select: { id: true },
    });

    if (!order) {
      throw new BadRequestException('Solo puedes reseñar productos comprados y entregados.');
    }

    const duplicated = await this.prisma.review.findUnique({
      where: {
        productId_customerId_orderId: {
          productId: dto.productId,
          customerId,
          orderId: dto.orderId,
        },
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException('Ya registraste una reseña para este producto y pedido.');
    }

    return this.prisma.review.create({
      data: {
        productId: dto.productId,
        customerId,
        orderId: dto.orderId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
      select: {
        id: true,
        productId: true,
        orderId: true,
        rating: true,
        comment: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });
  }

  private async ensureProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado.');
    }
  }
}
