import { Module } from '@nestjs/common';
import { CommissionModule } from '../commission/commission.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CommissionModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
