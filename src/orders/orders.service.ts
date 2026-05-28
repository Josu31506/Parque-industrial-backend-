import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { customerId: userId },
      include: { items: { include: { product: true, producer: true } }, sales: { include: { items: { include: { product: true } }, producer: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: { sub: string; role: string }) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true, producer: true } }, sales: { include: { items: { include: { product: true } }, producer: true } } },
    });

    if (actor.role === Role.CLIENT && order.customerId !== actor.sub) {
      throw new ForbiddenException('No puedes ver este pedido.');
    }

    return order;
  }

  async tracking(id: string, actor: { sub: string; role: string }) {
    const order = await this.findOne(id, actor);

    return {
      id: order.id,
      status: order.status,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      total: order.total,
      paidAmount: order.paidAmount,
      remainingAmount: order.remainingAmount,
      paymentStatus: order.paymentStatus,
      fundsStatus: order.fundsStatus,
      groups: order.sales.map((sale) => ({
        producerId: sale.producerId,
        producerName: sale.producer.businessName,
        status: sale.status,
        readyDate: sale.readyDate,
        items: sale.items,
      })),
    };
  }

  async markDelivered(id: string, actor: { sub: string; role: string }) {
    await this.findOne(id, actor);
    return this.prisma.order.update({ where: { id }, data: { status: OrderStatus.DELIVERED } });
  }

  async close(id: string, actor: { sub: string; role: string }) {
    await this.findOne(id, actor);
    return this.prisma.order.update({ where: { id }, data: { status: OrderStatus.CLOSED } });
  }
}
