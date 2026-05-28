import { PrismaClient, AvailabilityType, ProductType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin123456', 10);
  const advisorHash = await bcrypt.hash('Asesor123456', 10);
  const clientHash = await bcrypt.hash('Cliente123456', 10);
  const sellerHash = await bcrypt.hash('Productor123456', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@parqueindustrial.com' },
    update: {},
    create: { name: 'Admin Parque Industrial', email: 'admin@parqueindustrial.com', passwordHash, role: Role.ADMIN },
  });
  await prisma.user.upsert({
    where: { email: 'asesor@parqueindustrial.com' },
    update: {},
    create: { name: 'Asesor Comercial', email: 'asesor@parqueindustrial.com', passwordHash: advisorHash, role: Role.ADVISOR },
  });
  await prisma.user.upsert({
    where: { email: 'cliente@demo.com' },
    update: {},
    create: { name: 'Cliente Demo', email: 'cliente@demo.com', passwordHash: clientHash, role: Role.CLIENT },
  });
  const seller1 = await prisma.user.upsert({
    where: { email: 'productor1@demo.com' },
    update: {},
    create: { name: 'Productor Bancos', email: 'productor1@demo.com', passwordHash: sellerHash, role: Role.SELLER },
  });
  const seller2 = await prisma.user.upsert({
    where: { email: 'productor2@demo.com' },
    update: {},
    create: { name: 'Productora Villa', email: 'productor2@demo.com', passwordHash: sellerHash, role: Role.SELLER },
  });

  const bancos = await prisma.producer.upsert({
    where: { userId: seller1.id },
    update: {},
    create: {
      userId: seller1.id,
      businessName: 'Bancos EcoPeru',
      type: 'Productora local',
      location: 'Parque Industrial de Villa El Salvador',
      description: 'Productora local especializada en mobiliario de madera recuperada.',
      isApproved: true,
      rating: 4.8,
    },
  });
  const villa = await prisma.producer.upsert({
    where: { userId: seller2.id },
    update: {},
    create: {
      userId: seller2.id,
      businessName: 'Villa Natural',
      type: 'Productora local',
      location: 'Villa El Salvador',
      description: 'Taller de fibras naturales y acabados responsables.',
      isApproved: true,
      rating: 4.7,
    },
  });

  const categoryNames = ['Salas', 'Dormitorios', 'Comedores', 'Oficinas', 'Decoracion'];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.upsert({
        where: { slug: name.toLowerCase() },
        update: {},
        create: { name, slug: name.toLowerCase(), description: `Categoria ${name}` },
      }),
    ),
  );
  const [salas, dormitorios, comedores, oficinas, decoracion] = categories;

  await prisma.product.createMany({
    skipDuplicates: true,
    data: [
      {
        producerId: bancos.id,
        categoryId: salas.id,
        title: 'Sofa modular en lino gris',
        description: 'Sofa modular para sala familiar con estructura firme.',
        price: 1890,
        numericPrice: 1890,
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc',
        badge: 'Nuevo',
        type: ProductType.FEATURED,
        availabilityType: AvailabilityType.MADE_TO_ORDER,
        estimatedDispatchDays: 12,
        customizable: true,
      },
      {
        producerId: bancos.id,
        categoryId: comedores.id,
        title: 'Mesa de comedor extensible',
        description: 'Mesa extensible para seis personas.',
        price: 1250,
        numericPrice: 1250,
        imageUrl: 'https://images.unsplash.com/photo-1617098900591-3f90928e8c54',
        badge: 'Oferta',
        type: ProductType.FEATURED,
        availabilityType: AvailabilityType.IN_STOCK,
        stock: 6,
        estimatedDispatchDays: 4,
      },
      {
        producerId: villa.id,
        categoryId: decoracion.id,
        title: 'Silla artesanal con fibras naturales',
        description: 'Silla artesanal con fibras naturales reforzadas.',
        price: 310,
        numericPrice: 310,
        imageUrl: 'https://images.unsplash.com/photo-1503602642458-232111445657',
        badge: 'Producto Sostenible',
        type: ProductType.ECO,
        availabilityType: AvailabilityType.IN_STOCK,
        stock: 10,
        estimatedDispatchDays: 3,
      },
      {
        producerId: villa.id,
        categoryId: dormitorios.id,
        title: 'Cama queen personalizada',
        description: 'Cama queen personalizable con acabados a pedido.',
        price: 2150,
        numericPrice: 2150,
        imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85',
        type: ProductType.FEATURED,
        availabilityType: AvailabilityType.CUSTOM_QUOTE,
        estimatedDispatchDays: 16,
        customizable: true,
      },
      {
        producerId: bancos.id,
        categoryId: oficinas.id,
        title: 'Estanteria modular reciclada',
        description: 'Estanteria modular hecha con tableros reciclados.',
        price: 680,
        numericPrice: 680,
        imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7',
        badge: 'Producto Sostenible',
        type: ProductType.ECO,
        availabilityType: AvailabilityType.MADE_TO_ORDER,
        estimatedDispatchDays: 9,
      },
    ],
  });

  await prisma.commissionConfig.upsert({
    where: { id: 'default-commission' },
    update: { percentage: 10, isActive: true },
    create: { id: 'default-commission', percentage: 10, isActive: true },
  });

  console.log(`Seed listo. Admin: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
