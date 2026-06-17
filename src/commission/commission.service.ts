import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionService {
  private cachedConfig: { percentage: number; updatedAt: number } | null = null;
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getActiveCommissionConfig() {
    if (this.cachedConfig && Date.now() - this.cachedConfig.updatedAt < this.cacheTtlMs) {
      return { percentage: this.cachedConfig.percentage };
    }

    const config = await this.prisma.commissionConfig.findFirst({
      where: { isActive: true },
      select: { percentage: true },
      orderBy: { createdAt: 'desc' },
    });

    const activeConfig = config ?? { percentage: 5 };
    this.cachedConfig = { percentage: activeConfig.percentage, updatedAt: Date.now() };
    return activeConfig;
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
