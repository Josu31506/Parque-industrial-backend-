import { PaymentOption, PaymentStatus } from '@prisma/client';
import { PaymentStrategyService } from './payment-strategy.service';

describe('PaymentStrategyService', () => {
  it('calcula adelanto 50%', () => {
    const service = new PaymentStrategyService();
    expect(service.calculate(1000, PaymentOption.HALF_ADVANCE)).toEqual({
      paidAmount: 500,
      remainingAmount: 500,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
    });
  });
});
