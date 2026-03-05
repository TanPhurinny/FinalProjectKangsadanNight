const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. เพิ่มข้อมูลผู้ใช้งานตัวอย่าง
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: 'password123', // ในระบบจริงต้อง Hash รหัสผ่าน
      name: 'Phurin Admin',
      phoneNumber: '081-234-5678',
      birthDate: new Date('1995-05-20'),
      role: 'ADMIN',
    },
  });

  // 2. เพิ่มข้อมูลแผงค้า (Slots) เพื่อให้หน้า Dashboard มีตัวเลข
  await prisma.slot.createMany({
    data: [
      { slotNumber: 'A-01', zone: 'FOOD', price: 150, isAvailable: true },
      { slotNumber: 'A-02', zone: 'FOOD', price: 150, isAvailable: false },
      { slotNumber: 'B-01', zone: 'FASHION', price: 200, isAvailable: true },
    ],
    skipDuplicates: true,
  });

  // 3. เพิ่มรายการรออนุมัติ (BookingRequest) สำหรับหน้า Approvals
  await prisma.bookingRequest.create({
    data: {
      productName: 'ลูกชิ้นปิ้งกังสดาล',
      description: 'ลูกชิ้นหมูแท้ น้ำจิ้มรสเด็ด สูตรดั้งเดิม',
      sellerName: 'คุณสมชาย',
      phone: '099-888-7777',
      zone: 'FOOD',
      status: 'PENDING',
    },
  });

  // 4. เพิ่มรายการแจ้งซ่อม (MaintenanceReport)
  await prisma.maintenanceReport.create({
    data: {
      location: 'A-03',
      category: 'ไฟฟ้า',
      description: 'หลดไฟฟ้าชำรุด ต้องการการซ่อมแซมด่วน',
      status: 'PENDING',
      userId: admin.id,
    },
  });

  console.log('Seed data added successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });