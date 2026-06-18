import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const productSlugs = [
  'bancos-ecoperu-fas',
  'bancos-ecoperu-asda',
  'bancos-ecoperu-rsadsad',
  'bancos-ecoperu-dad'
];

async function main() {
  console.log('Buscando productos de prueba en la base de datos...');
  
  // Buscar por slug o por coincidencias aproximadas
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { slug: { in: productSlugs } },
        { id: { startsWith: 'cmq810mb9' } },
        { id: { startsWith: 'cmq81afgg' } },
        { id: { startsWith: 'cmq81qya9' } },
        { id: { startsWith: 'cmqho915m' } }
      ]
    }
  });

  if (products.length === 0) {
    console.log('No se encontraron productos de prueba coincidentes.');
    return;
  }

  console.log(`Se encontraron ${products.length} productos para borrar:`);
  products.forEach((p) => {
    console.log(`- [${p.id}] ${p.title} (slug: ${p.slug})`);
  });

  for (const product of products) {
    console.log(`\nIniciando eliminación en cascada para el producto: ${product.title} (${product.id})`);
    
    // 1. Borrar de CartItem
    const deletedCart = await prisma.cartItem.deleteMany({
      where: { productId: product.id }
    });
    if (deletedCart.count > 0) console.log(`  - Borrados ${deletedCart.count} items de carritos.`);

    // 2. Borrar de Review
    const deletedReviews = await prisma.review.deleteMany({
      where: { productId: product.id }
    });
    if (deletedReviews.count > 0) console.log(`  - Borradas ${deletedReviews.count} reseñas.`);

    // 3. Borrar de PurchaseRequestItem
    const deletedReqItems = await prisma.purchaseRequestItem.deleteMany({
      where: { productId: product.id }
    });
    if (deletedReqItems.count > 0) console.log(`  - Borrados ${deletedReqItems.count} items de solicitudes de compra.`);

    // 4. Borrar de OrderItem
    const deletedOrderItems = await prisma.orderItem.deleteMany({
      where: { productId: product.id }
    });
    if (deletedOrderItems.count > 0) console.log(`  - Borrados ${deletedOrderItems.count} items de pedidos.`);

    // 5. Borrar de SaleItem
    const deletedSaleItems = await prisma.saleItem.deleteMany({
      where: { productId: product.id }
    });
    if (deletedSaleItems.count > 0) console.log(`  - Borrados ${deletedSaleItems.count} items de ventas.`);

    // 6. Borrar de QuoteRequest (y resoluciones asociadas)
    const quotes = await prisma.quoteRequest.findMany({
      where: { productId: product.id },
      select: { id: true }
    });
    if (quotes.length > 0) {
      const quoteIds = quotes.map((q) => q.id);
      const deletedResolutions = await prisma.quoteResolution.deleteMany({
        where: { quoteRequestId: { in: quoteIds } }
      });
      if (deletedResolutions.count > 0) console.log(`  - Borradas ${deletedResolutions.count} resoluciones de cotización.`);

      const deletedQuotes = await prisma.quoteRequest.deleteMany({
        where: { id: { in: quoteIds } }
      });
      console.log(`  - Borradas ${deletedQuotes.count} solicitudes de cotización.`);
    }

    // 7. Borrar el producto de la tabla Product
    await prisma.product.delete({
      where: { id: product.id }
    });
    console.log(`  ✔ Producto borrado exitosamente.`);
  }

  console.log('\n¡Eliminación de productos completada con éxito!');
}

main()
  .catch((error) => {
    console.error('Error al borrar los productos de prueba:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
