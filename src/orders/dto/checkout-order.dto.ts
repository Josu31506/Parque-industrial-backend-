import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentOption } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class CheckoutOrderDto {
  @ApiPropertyOptional({ enum: PaymentOption, default: PaymentOption.FULL_PAYMENT })
  @IsOptional()
  @IsEnum(PaymentOption)
  paymentOption?: PaymentOption;
}
