const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const username = process.argv[2];
    const password = process.argv[3];
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      console.log(JSON.stringify({ found: false }, null, 2));
      return;
    }

    const compareResult = await bcrypt.compare(password, user.password).catch((error) => ({ error: error.message }));
    console.log(JSON.stringify({
      found: true,
      username: user.username,
      email: user.email,
      role: user.role,
      passwordLength: user.password ? user.password.length : 0,
      passwordPrefix: user.password ? user.password.slice(0, 12) : null,
      bcryptCompare: compareResult
    }, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();
