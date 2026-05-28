import { PurchaseRequestGroupStatus, PurchaseRequestStatus } from '@prisma/client';
import { PurchaseRequestStatusService } from './purchase-request-status.service';

describe('PurchaseRequestStatusService', () => {
  it('marca ready to pay cuando todos confirman', () => {
    const service = new PurchaseRequestStatusService();
    expect(service.calculate([PurchaseRequestGroupStatus.CONFIRMED])).toBe(PurchaseRequestStatus.READY_TO_PAY);
  });
});
