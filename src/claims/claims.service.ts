import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClaimStatus, FundsStatus, OrderStatus, Role, SaleStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClaimDto } from './dto/create-claim.dto';

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(customerId: string, dto: CreateClaimDto) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: dto.orderId } });
    if (order.customerId !== customerId) throw new ForbiddenException('No puedes reclamar este pedido.');

    const claim = await this.prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({ data: { ...dto, customerId } });
      await tx.order.update({
        where: { id: dto.orderId },
        data: { fundsStatus: FundsStatus.HELD_BY_CLAIM, status: OrderStatus.IN_CLAIM },
      });
      await tx.sale.updateMany({
        where: { orderId: dto.orderId },
        data: { fundsStatus: FundsStatus.HELD_BY_CLAIM, status: SaleStatus.HELD_BY_CLAIM },
      });
      return created;
    });

    await this.notifications.createForRole(Role.ADMIN, 'Nuevo reclamo', 'Hay un reclamo abierto para revisar.', 'CLAIM', claim.id);
    await this.notifications.createForRole(Role.ADVISOR, 'Nuevo reclamo', 'Hay un reclamo abierto para atender.', 'CLAIM', claim.id);
    return claim;
  }

  my(customerId: string) {
    return this.prisma.claim.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } });
  }

  findAll() {
    return this.prisma.claim.findMany({ include: { order: true, customer: true }, orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.claim.findUniqueOrThrow({ where: { id }, include: { order: true, customer: true } });
  }

  updateStatus(id: string, status: ClaimStatus) {
    return this.prisma.claim.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === ClaimStatus.RESOLVED || status === ClaimStatus.REJECTED ? new Date() : undefined,
      },
    });
  }
}
