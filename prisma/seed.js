const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample data...');

  // Seed only data that does not depend on demo users.
  // This avoids creating fake accounts while keeping a useful baseline dataset.

  // 1. สร้าง Slots (แผงค้าโซน A-F)
  const slotsData = [
    // Zone A: แฟชั่นและอาหาร
    { slotNumber: 'A-01', zone: 'A', price: 150 },
    { slotNumber: 'A-02', zone: 'A', price: 150 },
    { slotNumber: 'A-03', zone: 'A', price: 150 },
    { slotNumber: 'A-04', zone: 'A', price: 150 },
    { slotNumber: 'A-05', zone: 'A', price: 150 },
    // Zone B: อาหาร
    { slotNumber: 'B-01', zone: 'B', price: 180 },
    { slotNumber: 'B-02', zone: 'B', price: 180 },
    { slotNumber: 'B-03', zone: 'B', price: 180 },
    // Zone C: แฟชั่น
    { slotNumber: 'C-01', zone: 'C', price: 200 },
    { slotNumber: 'C-02', zone: 'C', price: 200 },
    // Zone D: ฟู้ดทรัค
    { slotNumber: 'D-01', zone: 'D', price: 250 },
    { slotNumber: 'D-02', zone: 'D', price: 250 },
    // Zone E: แฟชั่น
    { slotNumber: 'E-01', zone: 'E', price: 200 },
    { slotNumber: 'E-02', zone: 'E', price: 200 },
    // Zone F: อาหาร
    { slotNumber: 'F-01', zone: 'F', price: 180 },
    { slotNumber: 'F-02', zone: 'F', price: 180 },
    { slotNumber: 'F-03', zone: 'F', price: 180 },
  ];

  await prisma.slot.createMany({
    data: slotsData.map((slot, idx) => ({
      ...slot,
      isAvailable: idx % 2 === 0, // สลับ available/not available
    })),
    skipDuplicates: true,
  });

  console.log('✅ Slots created');

  // 2. สร้าง Booking Requests (รออนุมัติ)
  await prisma.bookingRequest.createMany({
    data: [
      {
        productName: 'ลูกชิ้นปิ้งกังสดาล',
        description: 'ลูกชิ้นหมูแท้ น้ำจิ้มรสเด็ด สูตรดั้งเดิม',
        sellerName: 'คุณสมชาย มั่นสุข',
        phone: '089-111-2222',
        zone: 'A',
        status: 'PENDING',
      },
      {
        productName: 'ข้าวแกงเพื่อสุขภาพ',
        description: 'ข้าวแกงสูตรท้องถิ่น ทำจากวัตถุดิบคุณภาพสูง',
        sellerName: 'คุณนางสาวกัญญา ใจดี',
        phone: '089-333-4444',
        zone: 'B',
        status: 'PENDING',
      },
      {
        productName: 'เสื้อผ้าสไตล์ street wear',
        description: 'เสื้อผ้า แอคเซสซอรี่ สไตล์สมัยใหม่',
        sellerName: 'คุณวิชญา ศิลปกร',
        phone: '089-555-6666',
        zone: 'C',
        status: 'APPROVED',
      },
      {
        productName: 'ฟู้ดทรัคอาหารหลากหลาย',
        description: 'อาหารไทยและต่างประเทศ ความคุณภาพสูง',
        sellerName: 'คุณสะเดิดสุข ปรุงอาหาร',
        phone: '089-777-8888',
        zone: 'D',
        status: 'REJECTED',
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Booking requests created');

  // ═══════════════════════════════════════════════════════════
  // สรุป
  // ═══════════════════════════════════════════════════════════
  console.log('✅ ✅ ✅ Seed data added successfully! ✅ ✅ ✅');
  console.log('\n📋 Data Summary:');
  console.log(`- Slots: 17 slots (A-F zones)`);
  console.log(`- Booking Requests: 4 requests (1 APPROVED, 2 PENDING, 1 REJECTED)\n`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });