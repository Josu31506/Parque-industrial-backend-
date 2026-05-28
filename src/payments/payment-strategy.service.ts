import { Injectable } from '@nestjs/common';
import { PaymentOption, PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentStrategyService {
  calculate(total: number, option: PaymentOption) {
    if (option === PaymentOption.HALF_ADVANCE) {
      return {
        paidAmount: Number((total * 0.5).toFixed(2)),
        remainingAmount: Number((total * 0.5).toFixed(2)),
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
      };
    }

    return {
      paidAmount: total,
      remainingAmount: 0,
      paymentStatus: PaymentStatus.FULLY_PAID,
    };
  }
}
