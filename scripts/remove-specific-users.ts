import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const emails = [
  'josue.hernandez@utec.edu.pe',
  'josuhernandeyataco@gmail.com',
];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, isActive: true },
  });

  if (users.length === 0) {
    console.log('No se encontraron usuarios para desactivar.');
    return;
  }

  const result = await prisma.user.updateMany({
    where: { email: { in: emails } },
    data: { isActive: false },
  });

  console.log(`Usuarios desactivados: ${result.count}`);
  users.forEach((user) => {
    console.log(`- ${user.email} (${user.isActive ? 'activo' : 'ya inactivo'})`);
  });
}

main()
  .catch((error) => {
    console.error('No se pudieron desactivar los usuarios indicados.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
