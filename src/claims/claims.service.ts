import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ClaimStatus, FundsStatus, OrderStatus, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClaimDto } from './dto/create-claim.dto';

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, dto: CreateClaimDto) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: dto.orderId },
      include: { claims: { select: { status: true } } },
    });
    if (order.customerId !== customerId) throw new ForbiddenException('No puedes reclamar este pedido.');
    if (!this.canCreateClaim(order)) {
      throw new BadRequestException('El plazo para reportar un problema ha vencido o el pedido ya fue verificado.');
    }

    const claim = await this.prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({
        data: {
          orderId: dto.orderId,
          customerId,
          reason: dto.reason,
          description: dto.description,
          evidenceImages: dto.evidenceImages ?? Prisma.JsonNull,
        },
      });
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

    return claim;
  }

  my(customerId: string) {
    return this.prisma.claim.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } });
  }

  findAll() {
    return this.prisma.claim.findMany({
      include: { order: true, customer: { select: this.safeCustomerSelect() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.claim.findUniqueOrThrow({
      where: { id },
      include: { order: true, customer: { select: this.safeCustomerSelect() } },
    });
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

  private safeCustomerSelect() {
    return {
      id: true,
      name: true,
      email: true,
      phone: true,
    };
  }

  private canCreateClaim(order: {
    status: OrderStatus;
    deliveredAt: Date | null;
    claimDeadlineAt: Date | null;
    fundsStatus: FundsStatus;
    claims?: Array<{ status: ClaimStatus }>;
  }) {
    if (
      order.status === OrderStatus.VERIFIED
      || order.status === OrderStatus.CLOSED
      || order.status !== OrderStatus.DELIVERED
      || order.fundsStatus === FundsStatus.RELEASED
    ) {
      return false;
    }

    const hasOpenClaim = order.claims?.some((claim) => (
      claim.status === ClaimStatus.OPEN || claim.status === ClaimStatus.IN_REVIEW
    ));

    if (hasOpenClaim) return false;
    if (!order.claimDeadlineAt) return false;

    return new Date() <= order.claimDeadlineAt;
  }
}
