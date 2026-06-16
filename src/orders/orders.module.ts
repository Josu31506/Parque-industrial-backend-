import { Module } from '@nestjs/common';
import { CommissionModule } from '../commission/commission.module';
import { MailModule } from '../mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CommissionModule, PaymentsModule, MailModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
