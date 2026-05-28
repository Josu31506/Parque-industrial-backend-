import { Injectable } from '@nestjs/common';
import { PurchaseRequestGroupStatus, PurchaseRequestStatus } from '@prisma/client';

@Injectable()
export class PurchaseRequestStatusService {
  calculate(groupStatuses: PurchaseRequestGroupStatus[]): PurchaseRequestStatus {
    const confirmed = groupStatuses.filter((status) => status === PurchaseRequestGroupStatus.CONFIRMED).length;
    const rejected = groupStatuses.filter((status) => status === PurchaseRequestGroupStatus.REJECTED).length;
    const pending = groupStatuses.filter((status) => status === PurchaseRequestGroupStatus.PENDING).length;

    if (pending === 0 && rejected === 0) return PurchaseRequestStatus.READY_TO_PAY;
    if (confirmed > 0 && rejected > 0) return PurchaseRequestStatus.PARTIALLY_REJECTED;
    if (confirmed > 0) return PurchaseRequestStatus.PARTIALLY_CONFIRMED;
    if (rejected > 0) return PurchaseRequestStatus.PARTIALLY_REJECTED;
    return PurchaseRequestStatus.PENDING_PRODUCER_CONFIRMATION;
  }
}
