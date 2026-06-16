import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType, FundsStatus, OrderStatus, PaymentOption, PaymentStatus, Prisma, Role, SaleStatus } from '@prisma/client';
import { CommissionService } from '../commission/commission.service';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { PaymentStrategyService } from '../payments/payment-strategy.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutOrderDto } from './dto/checkout-order.dto';

@Injectable()
export class OrdersService {
  private readonly devTimers = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionService: CommissionService,
    private readonly paymentStrategy: PaymentStrategyService,
  ) {}

  async findMyOrders(userId: string, query: SmallPaginationQueryDto) {
    this.timeStart('orders-findMy');
    const { page, limit, skip } = getPagination(query.page, query.limit ?? 5);
    const where: Prisma.OrderWhereInput = { customerId: userId };

    try {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.order.findMany({
          where,
          include: this.orderInclude(),
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.order.count({ where }),
      ]);

      return paginatedResponse(items, total, page, limit);
    } finally {
      this.timeEnd('orders-findMy');
    }
  }

  async findOne(id: string, actor: { sub: string; role: string }) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: this.orderInclude(),
    });

    if (actor.role === Role.CLIENT && order.customerId !== actor.sub) {
      throw new ForbiddenException('No puedes ver este pedido.');
    }

    return order;
  }

  async tracking(id: string, actor: { sub: string; role: string }) {
    this.timeStart('tracking-findByOrder');
    try {
      const order = await this.findOne(id, actor);

      return {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        total: order.total,
        paidAmount: order.paidAmount,
        remainingAmount: order.remainingAmount,
        paymentOption: order.paymentOption,
        paymentStatus: order.paymentStatus,
        fundsStatus: order.fundsStatus,
        items: order.items,
        groups: order.sales.map((sale) => ({
          ...sale,
          producerName: sale.producer.businessName,
        })),
      };
    } finally {
      this.timeEnd('tracking-findByOrder');
    }
  }

  async checkoutCart(customerId: string, dto: CheckoutOrderDto) {
    this.timeStart('checkout-total');
    const paymentOption = dto.paymentOption ?? PaymentOption.FULL_PAYMENT;

    try {
      this.timeStart('checkout-fetch-cart');
      const cartItems = await this.prisma.cartItem.findMany({
        where: { userId: customerId },
        select: {
          id: true,
          productId: true,
          quantity: true,
          product: {
            select: {
              id: true,
              producerId: true,
              title: true,
              price: true,
              stock: true,
              isActive: true,
              availabilityType: true,
              requiresConfirmation: true,
              estimatedDispatchDays: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      this.timeEnd('checkout-fetch-cart');

      const directItems = cartItems.filter((item) =>
        item.product.isActive
        && item.product.availabilityType === AvailabilityType.IN_STOCK
        && item.product.requiresConfirmation === false,
      );

      if (!directItems.length) {
        throw new BadRequestException('No hay productos de compra directa en el carrito.');
      }

      for (const item of directItems) {
        if (item.product.stock === null || item.product.stock < item.quantity) {
          throw new BadRequestException(`Stock insuficiente para ${item.product.title}.`);
        }
      }

      const total = Number(directItems.reduce((sum, item) => (
        sum + Number(item.product.price) * item.quantity
      ), 0).toFixed(2));
      const payment = this.paymentStrategy.calculate(total, paymentOption);
      const estimatedDeliveryDate = this.calculateEstimatedDeliveryDate(directItems);
      const commissionConfig = await this.commissionService.getActiveCommissionConfig();

      this.timeStart('checkout-transaction');
      const order = await this.prisma.$transaction(async (tx) => {
        this.timeStart('checkout-create-order');
        const createdOrder = await tx.order.create({
          data: {
            customerId,
            total: new Prisma.Decimal(total),
            paymentOption,
            paidAmount: new Prisma.Decimal(payment.paidAmount),
            remainingAmount: new Prisma.Decimal(payment.remainingAmount),
            paymentStatus: payment.paymentStatus,
            fundsStatus: FundsStatus.HELD,
            status: payment.paymentStatus === PaymentStatus.PARTIALLY_PAID
              ? OrderStatus.PAYMENT_PARTIAL
              : OrderStatus.PAYMENT_COMPLETED,
            estimatedDeliveryDate,
            items: {
              create: directItems.map((item) => ({
                productId: item.productId,
                producerId: item.product.producerId,
                quantity: item.quantity,
                unitPrice: item.product.price,
                totalPrice: new Prisma.Decimal(Number(item.product.price) * item.quantity),
              })),
            },
          },
        });
        this.timeEnd('checkout-create-order');

        this.timeStart('checkout-create-sales');
        const producerIds = Array.from(new Set(directItems.map((item) => item.product.producerId)));
        for (const producerId of producerIds) {
          const producerItems = directItems.filter((item) => item.product.producerId === producerId);
          const gross = Number(producerItems.reduce((sum, item) => (
            sum + Number(item.product.price) * item.quantity
          ), 0).toFixed(2));
          const commissionAmount = Number((gross * (Number(commissionConfig.percentage) / 100)).toFixed(2));
          const netAmount = Number((gross - commissionAmount).toFixed(2));

          await tx.sale.create({
            data: {
              orderId: createdOrder.id,
              producerId,
              grossAmount: new Prisma.Decimal(gross),
              commissionAmount: new Prisma.Decimal(commissionAmount),
              netAmount: new Prisma.Decimal(netAmount),
              paymentStatus: payment.paymentStatus,
              fundsStatus: FundsStatus.HELD,
              status: SaleStatus.NEW_SALE,
              items: {
                create: producerItems.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.product.price,
                  totalPrice: new Prisma.Decimal(Number(item.product.price) * item.quantity),
                })),
              },
            },
          });
        }
        this.timeEnd('checkout-create-sales');

        this.timeStart('checkout-stock-update');
        await Promise.all(directItems.map((item) => tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })));
        this.timeEnd('checkout-stock-update');

        this.timeStart('checkout-clear-cart');
        await tx.cartItem.deleteMany({
          where: { id: { in: directItems.map((item) => item.id) } },
        });
        this.timeEnd('checkout-clear-cart');

        return createdOrder;
      });
      this.timeEnd('checkout-transaction');

      return this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: this.orderInclude(),
      });
    } finally {
      this.timeEnd('checkout-total');
    }
  }

  async markDelivered(id: string, actor: { sub: string; role: string }) {
    await this.findOne(id, actor);
    return this.prisma.order.update({ where: { id }, data: { status: OrderStatus.DELIVERED } });
  }

  async close(id: string, actor: { sub: string; role: string }) {
    await this.findOne(id, actor);
    return this.prisma.order.update({ where: { id }, data: { status: OrderStatus.CLOSED } });
  }

  private calculateEstimatedDeliveryDate(
    items: Array<{ product: { estimatedDispatchDays: number | null } }>,
  ) {
    const maxDispatchDays = Math.max(
      0,
      ...items.map((item) => item.product.estimatedDispatchDays ?? 0),
    );
    const estimated = new Date();
    estimated.setDate(estimated.getDate() + maxDispatchDays + 2);
    return estimated;
  }

  private orderInclude() {
    return {
      items: {
        include: {
          product: { select: { id: true, title: true, imageUrl: true, producerId: true } },
          producer: { select: { id: true, businessName: true } },
        },
      },
      sales: {
        include: {
          items: {
            include: {
              product: { select: { id: true, title: true } },
            },
          },
          producer: { select: { id: true, businessName: true } },
        },
      },
    } satisfies Prisma.OrderInclude;
  }

  private timeStart(label: string) {
    if (process.env.NODE_ENV === 'production') return;
    const stack = this.devTimers.get(label) ?? [];
    stack.push(performance.now());
    this.devTimers.set(label, stack);
  }

  private timeEnd(label: string) {
    if (process.env.NODE_ENV === 'production') return;
    const stack = this.devTimers.get(label);
    const startedAt = stack?.pop();

    if (startedAt === undefined) return;
    if (!stack?.length) {
      this.devTimers.delete(label);
    }

    const duration = performance.now() - startedAt;
    console.log(`${label}: ${duration.toFixed(3)}ms`);
  }
}
