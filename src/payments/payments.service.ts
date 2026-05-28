import { BadRequestException, Injectable } from '@nestjs/common';
import { FundsStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { PaymentStrategyService } from './payment-strategy.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentStrategy: PaymentStrategyService,
  ) {}

  async simulate(userId: string, dto: SimulatePaymentDto) {
    if (!dto.orderId) throw new BadRequestException('Para MVP usa orderId o paga una solicitud desde purchase-requests.');
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: dto.orderId } });
    if (order.customerId !== userId) throw new BadRequestException('No puedes pagar esta orden.');

    const payment = this.paymentStrategy.calculate(Number(order.total), dto.paymentOption);
    return this.prisma.order.update({
      where: { id: dto.orderId },
      data: {
        paymentOption: dto.paymentOption,
        paidAmount: new Prisma.Decimal(payment.paidAmount),
        remainingAmount: new Prisma.Decimal(payment.remainingAmount),
        paymentStatus: payment.paymentStatus,
        fundsStatus: FundsStatus.HELD,
      },
    });
  }

  release(orderId: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        fundsStatus: FundsStatus.RELEASED,
        sales: { updateMany: { where: {}, data: { fundsStatus: FundsStatus.RELEASED } } },
      },
    });
  }

  hold(orderId: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        fundsStatus: FundsStatus.HELD_BY_CLAIM,
        sales: { updateMany: { where: {}, data: { fundsStatus: FundsStatus.HELD_BY_CLAIM } } },
      },
    });
  }
}
