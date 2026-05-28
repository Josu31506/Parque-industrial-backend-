import { ApiProperty } from '@nestjs/swagger';
import { PaymentOption } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class PayPurchaseRequestDto {
  @ApiProperty({ enum: PaymentOption })
  @IsEnum(PaymentOption)
  paymentOption: PaymentOption;
}
