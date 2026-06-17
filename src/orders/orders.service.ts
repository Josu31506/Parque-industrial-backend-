import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AvailabilityType, ClaimStatus, FundsStatus, OrderItemStatus, OrderStatus, PaymentOption, PaymentStatus, Prisma, Role, SaleStatus } from '@prisma/client';
import { CommissionService } from '../commission/commission.service';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { PaymentStrategyService } from '../payments/payment-strategy.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutOrderDto } from './dto/checkout-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly devTimers = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionService: CommissionService,
    private readonly paymentStrategy: PaymentStrategyService,
    private readonly mail: MailService,
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
        orderNumber: order.orderNumber,
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
          quoteId: true,
          titleSnapshot: true,
          quotedPriceSnapshot: true,
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
          quote: {
            select: {
              id: true,
              producerId: true,
              title: true,
              quotedPrice: true,
              quotedDeliveryDays: true,
              product: { select: { producerId: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      this.timeEnd('checkout-fetch-cart');

      const directItems = cartItems.filter((item) =>
        (
          item.product?.isActive
          && item.product.availabilityType === AvailabilityType.IN_STOCK
          && item.product.requiresConfirmation === false
        )
        || (
          item.quoteId
          && item.quote
          && item.quotedPriceSnapshot
        ),
      );

      if (!directItems.length) {
        throw new BadRequestException('No hay productos de compra directa en el carrito.');
      }

      for (const item of directItems) {
        if (item.product && (item.product.stock === null || item.product.stock < item.quantity)) {
          throw new BadRequestException(`Stock insuficiente para ${item.product.title}.`);
        }
      }

      const total = Number(directItems.reduce((sum, item) => (
        sum + this.getCartCheckoutUnitPrice(item) * item.quantity
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
                quoteId: item.quoteId,
                titleSnapshot: item.titleSnapshot ?? item.quote?.product?.title ?? item.quote?.title,
                producerId: this.getCartCheckoutProducerId(item),
                quantity: item.quantity,
                unitPrice: new Prisma.Decimal(this.getCartCheckoutUnitPrice(item)),
                totalPrice: new Prisma.Decimal(this.getCartCheckoutUnitPrice(item) * item.quantity),
              })),
            },
          },
        });
        this.timeEnd('checkout-create-order');

        this.timeStart('checkout-create-sales');
        const itemsByProducer = directItems.reduce((groups, item) => {
          const producerId = this.getCartCheckoutProducerId(item);
          const currentItems = groups.get(producerId) ?? [];
          currentItems.push(item);
          groups.set(producerId, currentItems);
          return groups;
        }, new Map<string, typeof directItems>());

        for (const [producerId, producerItems] of itemsByProducer.entries()) {
          const gross = Number(producerItems.reduce((sum, item) => (
            sum + this.getCartCheckoutUnitPrice(item) * item.quantity
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
                  quoteId: item.quoteId,
                  titleSnapshot: item.titleSnapshot ?? item.quote?.product?.title ?? item.quote?.title,
                  quantity: item.quantity,
                  unitPrice: new Prisma.Decimal(this.getCartCheckoutUnitPrice(item)),
                  totalPrice: new Prisma.Decimal(this.getCartCheckoutUnitPrice(item) * item.quantity),
                })),
              },
            },
          });
        }
        this.timeEnd('checkout-create-sales');

        this.timeStart('checkout-stock-update');
        await Promise.all(directItems
          .filter((item) => Boolean(item.productId && item.product))
          .map((item) => tx.product.update({
          where: { id: item.productId! },
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

      const createdOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: this.orderResponseSelect(),
      });
      this.sendOrderStatusEmailInBackground(createdOrder.id, {
        statusLabel: 'Pedido confirmado',
        title: 'Pedido confirmado',
        intro: 'Tu pedido fue registrado correctamente y el pago quedará retenido por la plataforma hasta la entrega conforme.',
      });

      return createdOrder;
    } finally {
      this.timeEnd('checkout-total');
    }
  }

  async markDelivered(id: string, actor: { sub: string; role: string }) {
    const order = await this.findOne(id, actor);

    if (actor.role === Role.CLIENT && order.status !== OrderStatus.DISPATCHED) {
      throw new BadRequestException('Solo puedes confirmar recepcion cuando el pedido esta en camino.');
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimDeadline = new Date(now);
      claimDeadline.setDate(claimDeadline.getDate() + 3);
      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: now,
          completedAt: now,
          claimDeadlineAt: claimDeadline,
          fundsReleasedAt: now,
          fundsStatus: FundsStatus.RELEASED,
        },
      });

      await tx.sale.updateMany({
        where: { orderId: id },
        data: { status: SaleStatus.DELIVERED, fundsStatus: FundsStatus.RELEASED, releasedAt: now },
      });

      await tx.saleItem.updateMany({
        where: { sale: { orderId: id } },
        data: { status: OrderItemStatus.DELIVERED },
      });

      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: { status: OrderItemStatus.DELIVERED },
      });

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: this.orderInclude(),
      });
    });

    if (order.status !== OrderStatus.DELIVERED) {
      this.sendOrderStatusEmailInBackground(id, {
        statusLabel: 'Entregado',
        title: 'Pedido entregado',
        intro: 'Gracias por confirmar la recepción de tu pedido.',
      });
    }

    return updatedOrder;
  }

  async close(id: string, actor: { sub: string; role: string }) {
    await this.findOne(id, actor);
    return this.prisma.order.update({ where: { id }, data: { status: OrderStatus.CLOSED } });
  }

  async releaseExpiredClaims() {
    const now = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        fundsStatus: FundsStatus.HELD,
        claimDeadlineAt: { lte: now },
        claims: {
          none: { status: { in: [ClaimStatus.OPEN, ClaimStatus.IN_REVIEW] } },
        },
      },
      select: { id: true },
    });

    if (!orders.length) return { count: 0 };

    const orderIds = orders.map((order) => order.id);
    await this.prisma.$transaction([
      this.prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { fundsStatus: FundsStatus.RELEASED, fundsReleasedAt: now },
      }),
      this.prisma.sale.updateMany({
        where: { orderId: { in: orderIds } },
        data: { fundsStatus: FundsStatus.RELEASED, releasedAt: now },
      }),
    ]);

    return { count: orderIds.length };
  }

  private calculateEstimatedDeliveryDate(
    items: Array<{ product: { estimatedDispatchDays: number | null } | null; quote?: { quotedDeliveryDays: number | null } | null }>,
  ) {
    const maxDispatchDays = Math.max(
      0,
      ...items.map((item) => item.product?.estimatedDispatchDays ?? item.quote?.quotedDeliveryDays ?? 0),
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
          quote: { select: { id: true, title: true, quotedPrice: true } },
          producer: { select: { id: true, businessName: true } },
        },
      },
      sales: {
        include: {
          items: {
            include: {
              product: { select: { id: true, title: true } },
              quote: { select: { id: true, title: true, quotedPrice: true } },
            },
          },
          producer: { select: { id: true, businessName: true } },
        },
      },
    } satisfies Prisma.OrderInclude;
  }

  private orderResponseSelect() {
    return {
      id: true,
      orderNumber: true,
      customerId: true,
      status: true,
      total: true,
      paymentOption: true,
      paidAmount: true,
      remainingAmount: true,
      paymentStatus: true,
      fundsStatus: true,
      estimatedDeliveryDate: true,
      deliveredAt: true,
      claimDeadlineAt: true,
      completedAt: true,
      fundsReleasedAt: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          orderId: true,
          productId: true,
          quoteId: true,
          titleSnapshot: true,
          producerId: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          status: true,
          product: { select: { id: true, title: true, imageUrl: true, producerId: true } },
          quote: { select: { id: true, title: true, quotedPrice: true } },
          producer: { select: { id: true, businessName: true } },
        },
      },
      sales: {
        select: {
          id: true,
          orderId: true,
          producerId: true,
          status: true,
          grossAmount: true,
          commissionAmount: true,
          netAmount: true,
          paymentStatus: true,
          fundsStatus: true,
          readyDate: true,
          releasedAt: true,
          paidAt: true,
          createdAt: true,
          producer: { select: { id: true, businessName: true } },
          items: {
            select: {
              id: true,
              saleId: true,
              productId: true,
              quoteId: true,
              titleSnapshot: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              status: true,
              product: { select: { id: true, title: true } },
              quote: { select: { id: true, title: true, quotedPrice: true } },
            },
          },
        },
      },
    } satisfies Prisma.OrderSelect;
  }

  private async getOrderEmailSummary(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        estimatedDeliveryDate: true,
        total: true,
        customer: { select: { name: true, email: true } },
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: { select: { title: true } },
            quote: { select: { title: true } },
            producer: { select: { businessName: true } },
          },
        },
      },
    });

    return {
      to: order.customer.email,
      customerName: order.customer.name,
      orderId: order.id,
      orderNumber: order.orderNumber,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      total: String(order.total),
      items: order.items.map((item) => ({
        title: item.product?.title ?? item.quote?.title ?? 'Producto cotizado',
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        totalPrice: String(item.totalPrice),
        producerName: item.producer.businessName,
      })),
    };
  }

  private getCartCheckoutUnitPrice(item: {
    product?: { price: Prisma.Decimal | number | string } | null;
    quotedPriceSnapshot?: Prisma.Decimal | null;
    quote?: { quotedPrice?: Prisma.Decimal | null } | null;
  }) {
    return Number(item.quotedPriceSnapshot ?? item.quote?.quotedPrice ?? item.product?.price ?? 0);
  }

  private getCartCheckoutProducerId(item: {
    product?: { producerId: string } | null;
    quote?: { producerId: string | null; product?: { producerId: string } | null } | null;
  }) {
    const producerId = item.product?.producerId ?? item.quote?.producerId ?? item.quote?.product?.producerId;
    if (!producerId) throw new BadRequestException('La cotizacion no tiene productora asociada.');
    return producerId;
  }

  private sendOrderStatusEmailInBackground(
    orderId: string,
    message: { statusLabel: string; title: string; intro: string },
  ) {
    void this.getOrderEmailSummary(orderId)
      .then((summary) => this.mail.sendOrderStatusChangedEmail({
        ...summary,
        ...message,
        trackingUrl: this.frontendUrl('/orders'),
      }))
      .catch((error) => this.logger.error(
        `No se pudo enviar correo de estado para pedido ${orderId}.`,
        error instanceof Error ? error.message : String(error),
      ));
  }

  private frontendUrl(path: string): string {
    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
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
