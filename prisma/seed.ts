import {
  AvailabilityType,
  Prisma,
  PrismaClient,
  ProductType,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('Admin123456', 10);
  const advisorHash = await bcrypt.hash('Asesor123456', 10);
  const clientHash = await bcrypt.hash('Cliente123456', 10);
  const sellerHash = await bcrypt.hash('Productor123456', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@parqueindustrial.com' },
    update: {
      name: 'Admin Parque Industrial',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      name: 'Admin Parque Industrial',
      email: 'admin@parqueindustrial.com',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'asesor@parqueindustrial.com' },
    update: {
      name: 'Asesor Comercial',
      passwordHash: advisorHash,
      role: Role.ADVISOR,
      isActive: true,
    },
    create: {
      name: 'Asesor Comercial',
      email: 'asesor@parqueindustrial.com',
      passwordHash: advisorHash,
      role: Role.ADVISOR,
    },
  });

  await prisma.user.upsert({
    where: { email: 'cliente@demo.com' },
    update: {
      name: 'Cliente Demo',
      passwordHash: clientHash,
      role: Role.CLIENT,
      isActive: true,
    },
    create: {
      name: 'Cliente Demo',
      email: 'cliente@demo.com',
      passwordHash: clientHash,
      role: Role.CLIENT,
    },
  });

  const seller1 = await prisma.user.upsert({
    where: { email: 'productor1@demo.com' },
    update: {
      name: 'Productor Bancos EcoPeru',
      passwordHash: sellerHash,
      role: Role.SELLER,
      isActive: true,
    },
    create: {
      name: 'Productor Bancos EcoPeru',
      email: 'productor1@demo.com',
      passwordHash: sellerHash,
      role: Role.SELLER,
    },
  });

  const seller2 = await prisma.user.upsert({
    where: { email: 'productor2@demo.com' },
    update: {
      name: 'Productora Villa Natural',
      passwordHash: sellerHash,
      role: Role.SELLER,
      isActive: true,
    },
    create: {
      name: 'Productora Villa Natural',
      email: 'productor2@demo.com',
      passwordHash: sellerHash,
      role: Role.SELLER,
    },
  });

  const bancos = await prisma.producer.upsert({
    where: { userId: seller1.id },
    update: {
      businessName: 'Bancos EcoPeru',
      type: 'Productora local',
      location: 'Parque Industrial de Villa El Salvador',
      description: 'Productora local especializada en mobiliario funcional y piezas de madera recuperada.',
      isApproved: true,
      rating: 4.8,
    },
    create: {
      userId: seller1.id,
      businessName: 'Bancos EcoPeru',
      type: 'Productora local',
      location: 'Parque Industrial de Villa El Salvador',
      description: 'Productora local especializada en mobiliario funcional y piezas de madera recuperada.',
      isApproved: true,
      rating: 4.8,
    },
  });

  const villa = await prisma.producer.upsert({
    where: { userId: seller2.id },
    update: {
      businessName: 'Villa Natural',
      type: 'Productora local',
      location: 'Villa El Salvador',
      description: 'Taller local de fibras naturales, acabados responsables y mobiliario personalizado.',
      isApproved: true,
      rating: 4.7,
    },
    create: {
      userId: seller2.id,
      businessName: 'Villa Natural',
      type: 'Productora local',
      location: 'Villa El Salvador',
      description: 'Taller local de fibras naturales, acabados responsables y mobiliario personalizado.',
      isApproved: true,
      rating: 4.7,
    },
  });

  const categoryData = [
    {
      name: 'Comedores',
      slug: 'comedores',
      description: 'Mesas, sillas y juegos de comedor para espacios familiares.',
      imageUrl: 'https://images.unsplash.com/photo-1617098900591-3f90928e8c54',
    },
    {
      name: 'Salas',
      slug: 'salas',
      description: 'Sofás, sillones y muebles para salas de distintos tamaños.',
      imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc',
    },
    {
      name: 'Dormitorios',
      slug: 'dormitorios',
      description: 'Camas, cabeceras y mobiliario para dormitorios.',
      imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85',
    },
    {
      name: 'Oficinas',
      slug: 'oficinas',
      description: 'Escritorios, estanterías y soluciones para espacios de trabajo.',
      imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
    },
    {
      name: 'Decoración',
      slug: 'decoracion',
      description: 'Piezas decorativas y complementos para personalizar ambientes.',
      imageUrl: 'https://images.unsplash.com/photo-1618220179428-22790b461013',
    },
  ];

  const categories = await Promise.all(
    categoryData.map((category) =>
      prisma.category.upsert({
        where: { slug: category.slug },
        update: category,
        create: category,
      }),
    ),
  );

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const categoryId = (slug: string) => {
    const category = categoryBySlug.get(slug);
    if (!category) throw new Error(`Categoría no encontrada: ${slug}`);
    return category.id;
  };

  const products: Prisma.ProductUncheckedCreateInput[] = [
    {
      slug: 'bancos-ecoperu-sofa-modular-lino-gris',
      producerId: bancos.id,
      categoryId: categoryId('salas'),
      title: 'Sofá modular en lino gris con base de madera',
      description: 'Sofá modular para sala familiar con estructura firme, tapizado en lino gris y base de madera.',
      price: 1890,
      numericPrice: 1890,
      imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc',
      badge: 'Nuevo',
      type: ProductType.FEATURED,
      availabilityType: AvailabilityType.MADE_TO_ORDER,
      requiresConfirmation: true,
      estimatedDispatchDays: 12,
      dimensions: '280 x 165 x 86 cm',
      materials: 'Estructura de madera, espuma de alta densidad y tapiz de lino',
      colors: ['Gris', 'Arena'],
      finish: 'Tapizado texturizado',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'bancos-ecoperu-mesa-comedor-extensible',
      producerId: bancos.id,
      categoryId: categoryId('comedores'),
      title: 'Mesa de comedor extensible para seis personas',
      description: 'Mesa extensible para reuniones familiares con acabado resistente y líneas limpias.',
      price: 1250,
      numericPrice: 1250,
      imageUrl: 'https://images.unsplash.com/photo-1617098900591-3f90928e8c54',
      badge: 'Oferta',
      type: ProductType.FEATURED,
      availabilityType: AvailabilityType.IN_STOCK,
      stock: 6,
      requiresConfirmation: false,
      estimatedDispatchDays: 4,
      dimensions: '160-210 x 90 x 76 cm',
      materials: 'Madera industrial enchapada y herrajes metálicos',
      colors: ['Nogal', 'Roble claro'],
      finish: 'Sellado mate',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'villa-natural-cama-queen-tapizada',
      producerId: villa.id,
      categoryId: categoryId('dormitorios'),
      title: 'Cama queen tapizada con cabecera acolchada',
      description: 'Cama queen personalizable con cabecera acolchada, medidas y acabados coordinados por cotización.',
      price: 2150,
      numericPrice: 2150,
      imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85',
      badge: 'Personalizable',
      type: ProductType.FEATURED,
      availabilityType: AvailabilityType.MADE_TO_ORDER,
      requiresConfirmation: true,
      estimatedDispatchDays: 16,
      dimensions: 'Según solicitud',
      materials: 'Base de madera, tapiz y espuma acolchada',
      colors: ['Beige', 'Gris humo'],
      finish: 'A elección',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'bancos-ecoperu-escritorio-ejecutivo-compacto',
      producerId: bancos.id,
      categoryId: categoryId('oficinas'),
      title: 'Escritorio ejecutivo compacto con repisas laterales',
      description: 'Escritorio compacto para trabajo diario con repisas laterales para organizar documentos y accesorios.',
      price: 760,
      numericPrice: 760,
      imageUrl: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd',
      badge: 'Oferta',
      type: ProductType.FEATURED,
      availabilityType: AvailabilityType.IN_STOCK,
      stock: 8,
      requiresConfirmation: false,
      estimatedDispatchDays: 5,
      dimensions: '140 x 60 x 75 cm',
      materials: 'Tablero melamínico y cantos reforzados',
      colors: ['Blanco', 'Nogal', 'Grafito'],
      finish: 'Melamina resistente',
      isActive: true,
    },
    {
      slug: 'bancos-ecoperu-banco-madera-recuperada',
      producerId: bancos.id,
      categoryId: categoryId('decoracion'),
      title: 'Banco de madera recuperada con acabado natural',
      description: 'Banco elaborado con madera recuperada para interiores o terrazas.',
      price: 420,
      numericPrice: 420,
      imageUrl: 'https://images.unsplash.com/photo-1503602642458-232111445657',
      badge: 'Producto Sostenible',
      type: ProductType.ECO,
      availabilityType: AvailabilityType.MADE_TO_ORDER,
      requiresConfirmation: true,
      estimatedDispatchDays: 8,
      dimensions: '120 x 38 x 45 cm',
      materials: 'Madera recuperada seleccionada',
      colors: ['Natural', 'Miel'],
      finish: 'Aceite protector natural',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'villa-natural-silla-fibras-naturales',
      producerId: villa.id,
      categoryId: categoryId('decoracion'),
      title: 'Silla artesanal con fibras naturales reforzadas',
      description: 'Silla artesanal para ambientes frescos y decoración responsable.',
      price: 310,
      numericPrice: 310,
      imageUrl: 'https://images.unsplash.com/photo-1503602642458-232111445657',
      badge: 'Producto Sostenible',
      type: ProductType.ECO,
      availabilityType: AvailabilityType.IN_STOCK,
      stock: 10,
      requiresConfirmation: false,
      estimatedDispatchDays: 3,
      dimensions: '58 x 60 x 82 cm',
      materials: 'Fibras naturales y estructura reforzada',
      colors: ['Natural', 'Verde oliva'],
      finish: 'Tejido artesanal',
      isActive: true,
    },
    {
      slug: 'bancos-ecoperu-estanteria-tableros-reciclados',
      producerId: bancos.id,
      categoryId: categoryId('oficinas'),
      title: 'Estantería modular fabricada con tableros reciclados',
      description: 'Estantería flexible para sala, estudio o espacios de exhibición.',
      price: 680,
      numericPrice: 680,
      imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7',
      badge: 'Producto Sostenible',
      type: ProductType.ECO,
      availabilityType: AvailabilityType.MADE_TO_ORDER,
      requiresConfirmation: true,
      estimatedDispatchDays: 9,
      dimensions: '90 x 32 x 170 cm',
      materials: 'Tableros reciclados y conectores metálicos',
      colors: ['Blanco', 'Natural', 'Grafito'],
      finish: 'Laminado mate',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'villa-natural-set-decorativo-pared',
      producerId: villa.id,
      categoryId: categoryId('decoracion'),
      title: 'Set decorativo de pared con piezas reutilizadas',
      description: 'Set decorativo de pared con piezas reutilizadas para dar textura y calidez a interiores.',
      price: 190,
      numericPrice: 190,
      imageUrl: 'https://images.unsplash.com/photo-1618220179428-22790b461013',
      badge: 'Producto Sostenible',
      type: ProductType.ECO,
      availabilityType: AvailabilityType.IN_STOCK,
      stock: 12,
      requiresConfirmation: false,
      estimatedDispatchDays: 3,
      dimensions: 'Set de 5 piezas variadas',
      materials: 'Retazos de madera, fibras y piezas reutilizadas',
      colors: ['Natural', 'Terracota', 'Verde suave'],
      finish: 'Artesanal protegido',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'bancos-ecoperu-comedor-roble-personalizado',
      producerId: bancos.id,
      categoryId: categoryId('comedores'),
      title: 'Comedor de roble personalizado',
      description: 'Juego de comedor configurable en medidas, número de sillas, color y acabado.',
      price: 2600,
      numericPrice: 2600,
      imageUrl: 'https://images.unsplash.com/photo-1617806118233-18e1de247200',
      badge: 'Personalizable',
      type: ProductType.FEATURED,
      availabilityType: AvailabilityType.MADE_TO_ORDER,
      requiresConfirmation: true,
      estimatedDispatchDays: 18,
      dimensions: 'Según solicitud',
      materials: 'Madera seleccionada y herrajes reforzados',
      colors: ['Roble claro', 'Nogal', 'Natural'],
      finish: 'A elección',
      customizable: true,
      isActive: true,
    },
    {
      slug: 'villa-natural-escritorio-madera-recuperada',
      producerId: villa.id,
      categoryId: categoryId('oficinas'),
      title: 'Escritorio de madera recuperada',
      description: 'Escritorio funcional elaborado con madera recuperada y acabado protector de bajo impacto.',
      price: 890,
      numericPrice: 890,
      imageUrl: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd',
      badge: 'Producto Sostenible',
      type: ProductType.ECO,
      availabilityType: AvailabilityType.MADE_TO_ORDER,
      requiresConfirmation: true,
      estimatedDispatchDays: 10,
      dimensions: '130 x 58 x 75 cm',
      materials: 'Madera recuperada seleccionada',
      colors: ['Natural', 'Miel'],
      finish: 'Aceite protector natural',
      customizable: true,
      isActive: true,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: product,
      create: product,
    });
  }

  await prisma.commissionConfig.upsert({
    where: { id: 'default-commission' },
    update: { percentage: 10, isActive: true },
    create: { id: 'default-commission', percentage: 10, isActive: true },
  });

  console.log(`Seed listo. Admin: ${admin.email}. Productos creados o actualizados: ${products.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
