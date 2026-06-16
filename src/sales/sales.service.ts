import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, Role, SaleStatus } from '@prisma/client';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async findMySales(userId: string, role: string, query: SmallPaginationQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    if (role === Role.ADMIN) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.sale.findMany({
          include: { items: { include: { product: true } }, producer: true },
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
        include: { items: { include: { product: true } }, order: true },
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
    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        status,
        items: { updateMany: { where: {}, data: { status: this.mapSaleStatusToItemStatus(status) } } },
      },
      include: { order: true, items: true },
    });

    if (status === SaleStatus.READY_FOR_DISPATCH) {
      const orderSales = await this.prisma.sale.findMany({ where: { orderId: sale.orderId } });
      const allReady = orderSales.every((entry) => entry.status === SaleStatus.READY_FOR_DISPATCH || entry.id === id);
      if (allReady) {
        await this.prisma.order.update({
          where: { id: sale.orderId },
          data: { status: OrderStatus.READY_FOR_DISPATCH },
        });
      }
    }

    if (status === SaleStatus.DISPATCHED) {
      const orderSales = await this.prisma.sale.findMany({ where: { orderId: sale.orderId } });
      const allDispatched = orderSales.every((entry) => entry.status === SaleStatus.DISPATCHED || entry.id === id);
      if (allDispatched) {
        await this.prisma.order.update({
          where: { id: sale.orderId },
          data: { status: OrderStatus.DISPATCHED },
        });
        void this.mail.sendOrderDispatchedEmail({
          to: sale.order.customer.email,
          customerName: sale.order.customer.name,
          orderCode: sale.order.id,
        });
      }
    }

    return updated;
  }

  private findSaleWithRelations(id: string) {
    return this.prisma.sale.findUniqueOrThrow({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            customer: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        producer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  private mapSaleStatusToItemStatus(status: SaleStatus) {
    if (status === SaleStatus.READY_FOR_DISPATCH) return 'READY_FOR_DISPATCH';
    if (status === SaleStatus.DISPATCHED) return 'DISPATCHED';
    if (status === SaleStatus.DELIVERED) return 'DELIVERED';
    return 'IN_PREPARATION';
  }
}
