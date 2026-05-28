import { Injectable } from '@nestjs/common';

@Injectable()
export class DeliveryDateCalculator {
  calculate(readyDates: Date[], deliveryDays: number): Date | null {
    if (!readyDates.length) return null;
    const maxReadyDate = new Date(Math.max(...readyDates.map((date) => date.getTime())));
    maxReadyDate.setDate(maxReadyDate.getDate() + deliveryDays);
    return maxReadyDate;
  }
}
