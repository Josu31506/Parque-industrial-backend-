import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma, Role, SaleStatus } from '@prisma/client';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async findMySales(userId: string, role: string, query: SmallPaginationQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    if (role === Role.ADMIN) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.sale.findMany({
          include: this.saleListInclude(),
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.sale.count(),
      ]);
      return paginatedResponse(items, total, page, limit);
    }

    const producer = await this.prisma.producer.findUniqueOrThrow({ where: { userId } });
    const where: Prisma.SaleWhereInput = { producerId: producer.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: this.saleListInclude(),
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return paginatedResponse(items, total, page, limit);
  }

  async findOne(id: string, userId: string, role: string) {
    const sale = await this.findSaleWithRelations(id);
    if (role !== Role.ADMIN && sale.producer.userId !== userId) {
      throw new ForbiddenException('No puedes ver esta venta.');
    }
    return sale;
  }

  markInPreparation(id: string, userId: string, role: string) {
    return this.updateSaleStatus(id, userId, role, SaleStatus.IN_PREPARATION);
  }

  markReadyForDispatch(id: string, userId: string, role: string) {
    return this.updateSaleStatus(id, userId, role, SaleStatus.READY_FOR_DISPATCH);
  }

  markDispatched(id: string, userId: string, role: string) {
    return this.updateSaleStatus(id, userId, role, SaleStatus.DISPATCHED);
  }

  markDelivered(id: string, userId: string, role: string) {
    return this.updateSaleStatus(id, userId, role, SaleStatus.DELIVERED);
  }

  private async updateSaleStatus(id: string, userId: string, role: string, status: SaleStatus) {
    const sale = await this.findOne(id, userId, role);
    this.validateSaleTransition(sale.status, status, role);

    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        status,
        items: { updateMany: { where: {}, data: { status: this.mapSaleStatusToItemStatus(status) } } },
      },
      include: this.saleListInclude(),
    });

    await this.syncOrderStatusAfterSaleUpdate(sale, status);

    return updated;
  }

  private validateSaleTransition(currentStatus: SaleStatus, nextStatus: SaleStatus, role: string) {
    if (role === Role.ADMIN) return;

    if (currentStatus === nextStatus) {
      throw new BadRequestException('La venta ya se encuentra en ese estado.');
    }

    const allowedTransitions: Record<SaleStatus, SaleStatus[]> = {
      [SaleStatus.NEW_SALE]: [SaleStatus.IN_PREPARATION],
      [SaleStatus.IN_PREPARATION]: [SaleStatus.READY_FOR_DISPATCH],
      [SaleStatus.READY_FOR_DISPATCH]: [SaleStatus.DISPATCHED],
      [SaleStatus.DISPATCHED]: [],
      [SaleStatus.DELIVERED]: [],
      [SaleStatus.IN_REVIEW]: [],
      [SaleStatus.LIQUIDATED]: [],
      [SaleStatus.HELD_BY_CLAIM]: [],
    };

    if (allowedTransitions[currentStatus].includes(nextStatus)) return;

    if (nextStatus === SaleStatus.DELIVERED) {
      throw new BadRequestException('La entrega debe ser confirmada por el cliente.');
    }

    if (currentStatus === SaleStatus.NEW_SALE && nextStatus === SaleStatus.READY_FOR_DISPATCH) {
      throw new BadRequestException('Debes marcar la venta en preparacion antes de marcarla lista para despacho.');
    }

    if (
      (currentStatus === SaleStatus.NEW_SALE || currentStatus === SaleStatus.IN_PREPARATION)
      && nextStatus === SaleStatus.DISPATCHED
    ) {
      throw new BadRequestException('Debes marcar la venta como lista para despacho antes de despacharla.');
    }

    if (currentStatus === SaleStatus.DISPATCHED || currentStatus === SaleStatus.DELIVERED) {
      throw new BadRequestException('No puedes cambiar una venta que ya fue despachada o entregada.');
    }

    throw new BadRequestException('No puedes volver a un estado anterior.');
  }

  private async syncOrderStatusAfterSaleUpdate(
    sale: Awaited<ReturnType<SalesService['findSaleWithRelations']>>,
    nextSaleStatus: SaleStatus,
  ) {
    const preparationStartStatuses: OrderStatus[] = [OrderStatus.PAYMENT_COMPLETED, OrderStatus.ORDER_CONFIRMED];
    const dispatchedTerminalStatuses: OrderStatus[] = [OrderStatus.DISPATCHED, OrderStatus.DELIVERED, OrderStatus.CLOSED];
    const readyOrTerminalStatuses: OrderStatus[] = [
      OrderStatus.READY_FOR_DISPATCH,
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
      OrderStatus.CLOSED,
    ];

    if (
      nextSaleStatus === SaleStatus.IN_PREPARATION
      && preparationStartStatuses.includes(sale.order.status)
    ) {
      await this.prisma.order.update({
        where: { id: sale.orderId },
        data: { status: OrderStatus.IN_PREPARATION },
      });
      this.sendOrderStatusEmailInBackground(sale.orderId, {
        statusLabel: 'En preparación',
        title: 'Tu pedido está en preparación',
        intro: 'Un productor ya empezó a preparar los productos de tu pedido.',
      });
      return;
    }

    const orderSales = await this.prisma.sale.findMany({
      where: { orderId: sale.orderId },
      select: { id: true, status: true },
    });
    const salesWithNextStatus = orderSales.map((entry) => (
      entry.id === sale.id ? { ...entry, status: nextSaleStatus } : entry
    ));
    const isReadyOrBeyond = (status: SaleStatus) => (
      status === SaleStatus.READY_FOR_DISPATCH
      || status === SaleStatus.DISPATCHED
      || status === SaleStatus.DELIVERED
    );
    const isDispatchedOrBeyond = (status: SaleStatus) => (
      status === SaleStatus.DISPATCHED || status === SaleStatus.DELIVERED
    );

    if (salesWithNextStatus.length > 0 && salesWithNextStatus.every((entry) => isDispatchedOrBeyond(entry.status))) {
      if (!dispatchedTerminalStatuses.includes(sale.order.status)) {
        await this.prisma.order.update({
          where: { id: sale.orderId },
          data: { status: OrderStatus.DISPATCHED },
        });
        this.sendOrderStatusEmailInBackground(sale.orderId, {
          statusLabel: 'En camino',
          title: 'Tu pedido está en camino',
          intro: 'Tu pedido fue despachado y ya se encuentra en camino.',
        });
      }
      return;
    }

    if (
      salesWithNextStatus.length > 0
      && salesWithNextStatus.every((entry) => isReadyOrBeyond(entry.status))
      && !readyOrTerminalStatuses.includes(sale.order.status)
    ) {
      await this.prisma.order.update({
        where: { id: sale.orderId },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      });
      this.sendOrderStatusEmailInBackground(sale.orderId, {
        statusLabel: 'Listo para despacho',
        title: 'Tu pedido está listo para despacho',
        intro: 'Todos los productores marcaron sus productos como listos para despacho.',
      });
    }
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
        title: item.product.title,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        totalPrice: String(item.totalPrice),
        producerName: item.producer.businessName,
      })),
    };
  }

  private sendOrderStatusEmailInBackground(
    orderId: string,
    message: { statusLabel: string; title: string; intro: string },
  ) {
    void this.getOrderEmailSummary(orderId)
      .then((summary) => this.mail.sendOrderStatusChangedEmail({
        ...summary,
        ...message,
      }))
      .catch((error) => this.logger.error(
        `No se pudo enviar correo de estado para pedido ${orderId}.`,
        error instanceof Error ? error.message : String(error),
      ));
  }

  private findSaleWithRelations(id: string) {
    return this.prisma.sale.findUniqueOrThrow({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            status: true,
            customer: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        producer: { select: { id: true, businessName: true, userId: true } },
        items: {
          include: {
            product: { select: { id: true, title: true } },
          },
        },
      },
    });
  }

  private saleListInclude() {
    return {
      producer: { select: { id: true, businessName: true, userId: true } },
      order: { select: { id: true, status: true } },
      items: {
        include: {
          product: { select: { id: true, title: true } },
        },
      },
    } satisfies Prisma.SaleInclude;
  }

  private mapSaleStatusToItemStatus(status: SaleStatus) {
    if (status === SaleStatus.READY_FOR_DISPATCH) return 'READY_FOR_DISPATCH';
    if (status === SaleStatus.DISPATCHED) return 'DISPATCHED';
    if (status === SaleStatus.DELIVERED) return 'DELIVERED';
    return 'IN_PREPARATION';
  }
}
