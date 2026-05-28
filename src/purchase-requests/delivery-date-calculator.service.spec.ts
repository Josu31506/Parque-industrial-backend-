import { DeliveryDateCalculator } from './delivery-date-calculator.service';

describe('DeliveryDateCalculator', () => {
  it('usa la fecha maxima y suma delivery', () => {
    const service = new DeliveryDateCalculator();
    const result = service.calculate([new Date('2026-06-10'), new Date('2026-06-12')], 2);

    expect(result?.toISOString().slice(0, 10)).toBe('2026-06-14');
  });
});
