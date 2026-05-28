import { CommissionService } from './commission.service';

describe('CommissionService', () => {
  it('calcula comision y neto', async () => {
    const service = new CommissionService({
      commissionConfig: {
        findFirst: jest.fn().mockResolvedValue({ percentage: 10 }),
      },
    } as never);

    await expect(service.calculateCommission(1000)).resolves.toEqual({
      percentage: 10,
      commissionAmount: 100,
      netAmount: 900,
    });
  });
});
