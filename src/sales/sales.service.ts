import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, Role, SaleStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findMySales(userId: string, role: string) {
    if (role === Role.ADMIN) {
      return this.prisma.sale.findMany({ include: { items: { include: { product: true } }, producer: true }, orderBy: { createdAt: 'desc' } });
    }

    const producer = await this.prisma.producer.findUniqueOrThrow({ where: { userId } });
    return this.prisma.sale.findMany({
      where: { producerId: producer.id },
      include: { items: { include: { product: true } }, order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const sale = await this.prisma.sale.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true } }, producer: true },
    });
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
      await this.notifications.createForUser(sale.order.customerId, 'Venta lista para despacho', 'Un productor marco productos listos para despacho.', 'ORDER', sale.orderId);
    }

    return updated;
  }

  private mapSaleStatusToItemStatus(status: SaleStatus) {
    if (status === SaleStatus.READY_FOR_DISPATCH) return 'READY_FOR_DISPATCH';
    if (status === SaleStatus.DISPATCHED) return 'DISPATCHED';
    if (status === SaleStatus.DELIVERED) return 'DELIVERED';
    return 'IN_PREPARATION';
  }
}
