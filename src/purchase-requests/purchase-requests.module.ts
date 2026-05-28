import { Module } from '@nestjs/common';
import { CommissionModule } from '../commission/commission.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { DeliveryDateCalculator } from './delivery-date-calculator.service';
import { PurchaseRequestFactory } from './purchase-request.factory';
import { PurchaseRequestStatusService } from './purchase-request-status.service';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';

@Module({
  imports: [CommissionModule, NotificationsModule, PaymentsModule],
  controllers: [PurchaseRequestsController],
  providers: [
    PurchaseRequestsService,
    PurchaseRequestFactory,
    PurchaseRequestStatusService,
    DeliveryDateCalculator,
  ],
  exports: [PurchaseRequestStatusService, DeliveryDateCalculator],
})
export class PurchaseRequestsModule {}
