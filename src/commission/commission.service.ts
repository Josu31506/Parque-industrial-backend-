import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveCommissionConfig() {
    const config = await this.prisma.commissionConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return config ?? { percentage: 10 };
  }

  async calculateCommission(grossAmount: number) {
    const config = await this.getActiveCommissionConfig();
    const commissionAmount = Number((grossAmount * (config.percentage / 100)).toFixed(2));

    return {
      percentage: config.percentage,
      commissionAmount,
      netAmount: Number((grossAmount - commissionAmount).toFixed(2)),
    };
  }
}
