import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentStrategyService } from './payment-strategy.service';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentStrategyService],
  exports: [PaymentStrategyService, PaymentsService],
})
export class PaymentsModule {}
