import { CommissionService } from './commission.service';

describe('CommissionService', () => {
  it('calcula comision y neto', async () => {
    const service = new CommissionService({
      commissionConfig: {
        findFirst: jest.fn().mockResolvedValue({ percentage: 5 }),
      },
    } as never);

    await expect(service.calculateCommission(1000)).resolves.toEqual({
      percentage: 5,
      commissionAmount: 50,
      netAmount: 950,
    });
  });
});
