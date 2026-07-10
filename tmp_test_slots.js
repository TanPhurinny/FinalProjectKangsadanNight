const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    const slots = await prisma.slot.findMany({
      where: { zone: { in: ['A', 'B', 'C', 'D', 'E', 'F'] } },
      orderBy: { id: 'asc' },
      take: 20,
    });

    console.log(JSON.stringify(slots.map(s => ({
      id: s.id,
      slotNumber: s.slotNumber,
      zone: s.zone,
      price: s.price,
      isAvailable: s.isAvailable,
    })), null, 2));

    const users = await prisma.user.findMany({
      where: { role: 'SELLER' },
      include: { shop: true },
    });

    console.log('SELLERS');
    console.log(JSON.stringify(users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      productType: u.shop?.productType,
    })), null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
