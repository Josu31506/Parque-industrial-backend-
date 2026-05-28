import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentOption } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class SimulatePaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purchaseRequestId?: string;

  @ApiProperty({ enum: PaymentOption })
  @IsEnum(PaymentOption)
  paymentOption: PaymentOption;
}
