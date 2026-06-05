import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:reset no puede ejecutarse en produccion.');
  }

  await prisma.$transaction([
    prisma.quoteResolution.deleteMany(),
    prisma.claim.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.purchaseRequestGroup.deleteMany(),
    prisma.purchaseRequestItem.deleteMany(),
    prisma.purchaseRequest.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.quoteRequest.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.product.deleteMany(),
  ]);

  console.log('Datos transaccionales y productos locales eliminados.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
