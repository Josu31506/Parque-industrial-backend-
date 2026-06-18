import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Prueba de Latencia de Consultas ---');

  // Medir latencia de red base con SELECT 1
  console.log('\nEjecutando consultas raw SELECT 1...');
  for (let i = 0; i < 5; i++) {
    const rawStart = performance.now();
    await prisma.$queryRawUnsafe('SELECT 1');
    const rawDuration = performance.now() - rawStart;
    console.log(`- SELECT 1 (intento ${i + 1}): ${rawDuration.toFixed(2)} ms`);
  }

  // Buscar un usuario con órdenes en el sistema
  const sampleOrder = await prisma.order.findFirst({
    select: { customerId: true },
  });

  if (!sampleOrder) {
    console.log('No se encontraron órdenes de compra en el sistema para realizar pruebas.');
    return;
  }

  const userId = sampleOrder.customerId;
  console.log(`Usuario de prueba detectado: ${userId}`);

  // Simular la consulta del endpoint `orders/my` de forma secuencial ($transaction)
  console.log('\n[Modo Secuencial - $transaction] Ejecutando consulta de pedidos...');
  const orderStartSeq = performance.now();
  const [ordersSeq, totalSeq] = await prisma.$transaction([
    prisma.order.findMany({
      where: { customerId: userId },
      include: {
        items: {
          include: {
            product: { select: { id: true, title: true, imageUrl: true, producerId: true } },
            quote: { select: { id: true, title: true, quotedPrice: true } },
            producer: { select: { id: true, businessName: true } },
          },
        },
        sales: {
          include: {
            items: {
              include: {
                product: { select: { id: true, title: true } },
                quote: { select: { id: true, title: true, quotedPrice: true } },
              },
            },
            producer: { select: { id: true, businessName: true } },
          },
        },
        claims: { select: { id: true, status: true } },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where: { customerId: userId } }),
  ]);
  const orderDurationSeq = performance.now() - orderStartSeq;
  console.log(`- Tiempo de ejecución ($transaction): ${orderDurationSeq.toFixed(2)} ms`);

  // Simular la consulta de forma concurrente (Promise.all)
  console.log('\n[Modo Concurrente - Promise.all] Ejecutando consulta de pedidos...');
  const orderStartConc = performance.now();
  const [ordersConc, totalConc] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: userId },
      include: {
        items: {
          include: {
            product: { select: { id: true, title: true, imageUrl: true, producerId: true } },
            quote: { select: { id: true, title: true, quotedPrice: true } },
            producer: { select: { id: true, businessName: true } },
          },
        },
        sales: {
          include: {
            items: {
              include: {
                product: { select: { id: true, title: true } },
                quote: { select: { id: true, title: true, quotedPrice: true } },
              },
            },
            producer: { select: { id: true, businessName: true } },
          },
        },
        claims: { select: { id: true, status: true } },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where: { customerId: userId } }),
  ]);
  const orderDurationConc = performance.now() - orderStartConc;
  console.log(`- Tiempo de ejecución (Promise.all): ${orderDurationConc.toFixed(2)} ms`);

  // Simular la consulta de forma concurrente pero SIN RELACIONES (Promise.all sin include)
  console.log('\n[Modo Optimizado - Promise.all SIN RELACIONES] Ejecutando consulta...');
  const orderStartOpt = performance.now();
  const [ordersOpt, totalOpt] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: userId },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where: { customerId: userId } }),
  ]);
  const orderDurationOpt = performance.now() - orderStartOpt;
  console.log(`- Tiempo de ejecución (Optimizado sin relaciones): ${orderDurationOpt.toFixed(2)} ms`);

  // Simular consulta de conteo
  const countStart = performance.now();
  const count = await prisma.order.count({ where: { customerId: userId } });
  const countDuration = performance.now() - countStart;
  console.log(`Conteo de órdenes completado.`);
  console.log(`- Total de órdenes: ${count}`);
  console.log(`- Tiempo de ejecución: ${countDuration.toFixed(2)} ms`);

  // Simular consulta de solicitudes de compra `purchase-requests/my`
  console.log('\nEjecutando consulta de solicitudes de compra (findMy)...');
  const reqStart = performance.now();
  const requests = await prisma.purchaseRequest.findMany({
    where: { customerId: userId },
    include: {
      items: { include: { product: true, producer: true } },
      groups: { include: { producer: true } },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  const reqDuration = performance.now() - reqStart;
  console.log(`Consulta de solicitudes de compra completada.`);
  console.log(`- Solicitudes encontradas: ${requests.length}`);
  console.log(`- Tiempo de ejecución: ${reqDuration.toFixed(2)} ms`);

  // Simular consulta de ventas `sales/my` si existe una productora
  const sampleProducer = await prisma.producer.findFirst({
    select: { id: true },
  });
  if (sampleProducer) {
    const producerId = sampleProducer.id;
    console.log(`\nProductora de prueba detectada: ${producerId}`);
    console.log('Ejecutando consulta de ventas (findMySales)...');
    const salesStart = performance.now();
    const sales = await prisma.sale.findMany({
      where: { producerId },
      include: {
        producer: { select: { id: true, businessName: true, userId: true } },
        order: { select: { id: true, orderNumber: true, status: true, dispatchedAt: true, deliveredAt: true, verifiedAt: true, claimDeadlineAt: true } },
        items: {
          include: {
            product: { select: { id: true, title: true } },
            quote: { select: { id: true, title: true } },
          },
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    const salesDuration = performance.now() - salesStart;
    console.log(`Consulta de ventas completada.`);
    console.log(`- Ventas encontradas: ${sales.length}`);
    console.log(`- Tiempo de ejecución: ${salesDuration.toFixed(2)} ms`);
  }

  console.log('\n--- Fin de las Pruebas de Latencia ---');
}

main()
  .catch((e) => {
    console.error('Error durante la prueba de latencia:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
