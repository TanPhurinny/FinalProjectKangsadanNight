const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.slot.createMany({
    data: [
      { slotNumber: 'A01', zone: 'Food', price: 150, isAvailable: true },
      { slotNumber: 'A02', zone: 'Food', price: 150, isAvailable: false, merchant: 'ร้านส้มตำป้าหมาย' },
      { slotNumber: 'B01', zone: 'Fashion', price: 200, isAvailable: true },
    ],
  });
  console.log('เพิ่มข้อมูลเริ่มต้นเรียบร้อยแล้ว!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());