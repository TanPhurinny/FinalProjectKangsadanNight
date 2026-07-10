const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const u = await prisma.user.findFirst({
      where: { username: { startsWith: 'seller_auto_' } },
      orderBy: { createdAt: 'desc' }
    });
    if (!u) {
      console.log('NOT_FOUND');
    } else {
      console.log(JSON.stringify({ id: u.id, username: u.username, email: u.email }, null, 2));
    }
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
})();
