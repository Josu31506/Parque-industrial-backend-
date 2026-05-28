import { Injectable } from '@nestjs/common';
import { CartItem, Prisma } from '@prisma/client';

type CartItemWithProduct = CartItem & {
  product: {
    id: string;
    producerId: string;
    numericPrice: number;
  };
};

@Injectable()
export class PurchaseRequestFactory {
  buildFromCart(customerId: string, cartItems: CartItemWithProduct[], deliveryDays = 2) {
    const items = cartItems.map((item) => ({
      productId: item.productId,
      producerId: item.product.producerId,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.product.numericPrice),
      totalPrice: new Prisma.Decimal(item.product.numericPrice * item.quantity),
    }));

    const producerIds = [...new Set(items.map((item) => item.producerId))];
    const total = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    return {
      customerId,
      deliveryDays,
      total: new Prisma.Decimal(total),
      items,
      groups: producerIds.map((producerId) => ({ producerId })),
    };
  }
}
