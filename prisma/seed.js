const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample data...');

  // ═══════════════════════════════════════════════════════════
  // 1. สร้าง Users (Admin, Sellers, Customers)
  // ═══════════════════════════════════════════════════════════
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123',
      name: 'ผู้บริหารระบบ',
      phoneNumber: '081-234-5678',
      role: 'ADMIN',
    },
  });

  // สร้าง Sellers
  const sellers = await Promise.all([
    prisma.user.upsert({
      where: { username: 'seller_food1' },
      update: {},
      create: {
        username: 'seller_food1',
        email: 'seller1@example.com',
        password: 'password123',
        name: 'คุณสมชาย มั่นสุข',
        phoneNumber: '089-111-2222',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_food2' },
      update: {},
      create: {
        username: 'seller_food2',
        email: 'seller2@example.com',
        password: 'password123',
        name: 'คุณนางสาวกัญญา ใจดี',
        phoneNumber: '089-333-4444',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_fashion' },
      update: {},
      create: {
        username: 'seller_fashion',
        email: 'seller3@example.com',
        password: 'password123',
        name: 'คุณวิชญา ศิลปกร',
        phoneNumber: '089-555-6666',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_truck' },
      update: {},
      create: {
        username: 'seller_truck',
        email: 'seller4@example.com',
        password: 'password123',
        name: 'คุณสะเดิดสุข ปรุงอาหาร',
        phoneNumber: '089-777-8888',
        role: 'SELLER',
      },
    }),
    // Sellers เพิ่มเติม
    prisma.user.upsert({
      where: { username: 'seller_food3' },
      update: {},
      create: {
        username: 'seller_food3',
        email: 'seller5@example.com',
        password: 'password123',
        name: 'คุณสุนีย์ ปราณีต',
        phoneNumber: '089-999-0000',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_fashion2' },
      update: {},
      create: {
        username: 'seller_fashion2',
        email: 'seller6@example.com',
        password: 'password123',
        name: 'คุณจิรา อารมณ์ดี',
        phoneNumber: '089-101-1111',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_food4' },
      update: {},
      create: {
        username: 'seller_food4',
        email: 'seller7@example.com',
        password: 'password123',
        name: 'คุณเสนห์ ผลิตผล',
        phoneNumber: '089-121-2121',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_food5' },
      update: {},
      create: {
        username: 'seller_food5',
        email: 'seller8@example.com',
        password: 'password123',
        name: 'คุณทิม ทรัพย์ดี',
        phoneNumber: '089-131-3131',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_fashion3' },
      update: {},
      create: {
        username: 'seller_fashion3',
        email: 'seller9@example.com',
        password: 'password123',
        name: 'คุณสุภา กลิ่นหอม',
        phoneNumber: '089-141-4141',
        role: 'SELLER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'seller_truck2' },
      update: {},
      create: {
        username: 'seller_truck2',
        email: 'seller10@example.com',
        password: 'password123',
        name: 'คุณนรินทร์ อร่อยชิด',
        phoneNumber: '089-151-5151',
        role: 'SELLER',
      },
    }),
  ]);

  // สร้าง Customers
  const customers = await Promise.all([
    prisma.user.upsert({
      where: { username: 'customer1' },
      update: {},
      create: {
        username: 'customer1',
        email: 'customer1@example.com',
        password: 'password123',
        name: 'สุขกับหมู่บ้าน',
        phoneNumber: '088-111-1111',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'customer2' },
      update: {},
      create: {
        username: 'customer2',
        email: 'customer2@example.com',
        password: 'password123',
        name: 'นิศาชล หนองม่วง',
        phoneNumber: '088-222-2222',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'customer3' },
      update: {},
      create: {
        username: 'customer3',
        email: 'customer3@example.com',
        password: 'password123',
        name: 'สมหญิง เสยะชาต',
        phoneNumber: '088-333-3333',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'customer4' },
      update: {},
      create: {
        username: 'customer4',
        email: 'customer4@example.com',
        password: 'password123',
        name: 'อัมพร สุขใจ',
        phoneNumber: '088-444-4444',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'customer5' },
      update: {},
      create: {
        username: 'customer5',
        email: 'customer5@example.com',
        password: 'password123',
        name: 'วิไลพร ชาติชาย',
        phoneNumber: '088-555-5555',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.upsert({
      where: { username: 'customer6' },
      update: {},
      create: {
        username: 'customer6',
        email: 'customer6@example.com',
        password: 'password123',
        name: 'ณภาณ สถาน',
        phoneNumber: '088-666-6666',
        role: 'CUSTOMER',
      },
    }),
  ]);

  console.log('✅ Users created');

  // ═══════════════════════════════════════════════════════════
  // 2. สร้าง Shop Details
  // ═══════════════════════════════════════════════════════════
  await prisma.shopDetail.createMany({
    data: [
      {
        shopName: 'ลูกชิ้นปิ้งกังสดาล',
        productType: 'อาหาร',
        productDetail: 'ลูกชิ้นหมูแท้ ปิ้งสด น้ำจิ้มรสเด็ด',
        userId: sellers[0].id,
      },
      {
        shopName: 'ข้าวแกงเพื่อสุขภาพ',
        productType: 'อาหาร',
        productDetail: 'ข้าวแกงสูตรท้องถิ่น ทำจากวัตถุดิบคุณภาพสูง',
        userId: sellers[1].id,
      },
      {
        shopName: 'ร้านเสื้อสไตล์สตรีท',
        productType: 'แฟชั่น',
        productDetail: 'เสื้อผ้า แอคเซสซอรี่ สไตล์ street wear',
        userId: sellers[2].id,
      },
      {
        shopName: 'ฟู้ดทรัค หลากหลายอาหาร',
        productType: 'อาหาร',
        productDetail: 'ฟู้ดทรัคอาหารหลากหลาย ทั้งไทยและต่างประเทศ',
        userId: sellers[3].id,
      },
      {
        shopName: 'สุกี้มันต้อง',
        productType: 'อาหาร',
        productDetail: 'สุกี้ย่าง หลากรส อร่อยแน่นอน',
        userId: sellers[4].id,
      },
      {
        shopName: 'กระเป๋าสตรี Modern Style',
        productType: 'แฟชั่น',
        productDetail: 'กระเป๋า กระเป๋าถือ สตรี สไตล์ทันสมัย',
        userId: sellers[5].id,
      },
      {
        shopName: 'ลอดช่อง ทำส่วน',
        productType: 'อาหาร',
        productDetail: 'ลอดช่อง ไส้สด ใหม่ทุกวัน',
        userId: sellers[6].id,
      },
      {
        shopName: 'ปลาทูอบเตาไฟฟ้า',
        productType: 'อาหาร',
        productDetail: 'ปลาทูอบสด ๆ ทุกวัน เนื้อนุ่มไม่มีคาว',
        userId: sellers[7].id,
      },
      {
        shopName: 'จิมชี่ หนึ่งแม่ค้า',
        productType: 'แฟชั่น',
        productDetail: 'เครื่องประดับ นาฬิกา อยุธยา สินค้าแท้',
        userId: sellers[8].id,
      },
      {
        shopName: 'ข้าวขาหมู ต้นตำรับ',
        productType: 'อาหาร',
        productDetail: 'ข้าวขาหมู หมูร่วม ทำสูตรดั้งเดิมกำลังวัฒนา',
        userId: sellers[9].id,
      },
    ],
  });

  console.log('✅ Shop details created');

  // ═══════════════════════════════════════════════════════════
  // 3. สร้าง Slots (แผงค้าโซน A-F)
  // ═══════════════════════════════════════════════════════════
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

  // ดึง slots เพื่อสร้าง bookings
  const slots = await prisma.slot.findMany();

  console.log('✅ Slots created');

  // ═══════════════════════════════════════════════════════════
  // 4. สร้าง Bookings
  // ═══════════════════════════════════════════════════════════
  const approvedSlot = slots.find((s) => s.slotNumber === 'A-01');
  const pendingSlot = slots.find((s) => s.slotNumber === 'B-01');
  const rejectedSlot = slots.find((s) => s.slotNumber === 'C-01');

  if (approvedSlot && pendingSlot && rejectedSlot) {
    await prisma.booking.createMany({
      data: [
        {
          slotId: approvedSlot.id,
          userId: sellers[0].id,
          status: 'APPROVED',
        },
        {
          slotId: pendingSlot.id,
          userId: sellers[1].id,
          status: 'PENDING',
        },
        {
          slotId: rejectedSlot.id,
          userId: sellers[2].id,
          status: 'REJECTED',
        },
      ],
      skipDuplicates: true,
    });
  }

  console.log('✅ Bookings created');

  // ═══════════════════════════════════════════════════════════
  // 5. สร้าง Booking Requests (รออนุมัติ)
  // ═══════════════════════════════════════════════════════════
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
  // 6. สร้าง Announcements (ประกาศ)
  // ═══════════════════════════════════════════════════════════
  await prisma.announcement.createMany({
    data: [
      {
        title: 'ยินดีต้อนรับสู่ตลาดกลางคืนกังสดาล',
        content: 'ตลาดกลางคืนกังสดาลเปิดทำการทุกวันศุกร์-อาทิตย์ เวลา 18.00-23.00 น.',
        category: 'ทั่วไป',
        targetRole: 'CUSTOMER',
        authorId: admin.id,
      },
      {
        title: 'ประกาศปิดปรับปรุงบริเวณโซน D',
        content: 'ตลาดกลางคืนจะปิดปรับปรุงบริเวณโซน D ระหว่างวันที่ 1-5 เมษายน',
        category: 'ประกาศสำคัญ',
        targetRole: 'CUSTOMER',
        authorId: admin.id,
      },
      {
        title: 'แนวทางการจองแผงค้าใหม่',
        content: 'ผู้ประกอบการที่ต้องการจองแผงค้าสามารถสมัครออนไลน์ได้ที่ระบบนี้',
        category: 'คำแนะนำ',
        targetRole: 'SELLER',
        authorId: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Announcements created');

  // ═══════════════════════════════════════════════════════════
  // 7. สร้าง Maintenance Reports (แจ้งซ่อม)
  // ═══════════════════════════════════════════════════════════
  await prisma.maintenanceReport.createMany({
    data: [
      {
        location: 'A-03',
        category: 'ไฟฟ้า',
        description: 'หลอดไฟในแผง A-03 ขาดหลายดวง ต้องการการซ่อมแซมด่วน',
        status: 'PENDING',
        userId: sellers[0].id,
      },
      {
        location: 'B-01',
        category: 'โครงสร้าง',
        description: 'พื้นบริเวณแผง B-01 มีรอยแตกราว ประเมินความเสี่ยง',
        status: 'IN_PROGRESS',
        userId: sellers[1].id,
      },
      {
        location: 'D-02',
        category: 'อื่นๆ',
        description: 'ท่อน้ำประปาแผง D-02 รั่ว ต้องการซ่อม',
        status: 'PENDING',
        userId: sellers[3].id,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Maintenance reports created');

  // ═══════════════════════════════════════════════════════════
  // สรุป
  // ═══════════════════════════════════════════════════════════
  console.log('✅ ✅ ✅ Seed data added successfully! ✅ ✅ ✅');
  console.log('\n📋 Data Summary:');
  console.log(`- Users: 1 Admin + 10 Sellers + 6 Customers = 17 users`);
  console.log(`- Shops: 10 shops`);
  console.log(`- Slots: 17 slots (A-F zones)`);
  console.log(`- Bookings: 3 bookings (1 APPROVED, 1 PENDING, 1 REJECTED)`);
  console.log(`- Booking Requests: 4 requests (1 APPROVED, 2 PENDING, 1 REJECTED)`);
  console.log(`- Announcements: 3 announcements`);
  console.log(`- Maintenance Reports: 3 reports (1 PENDING, 1 IN_PROGRESS)\n`);
  console.log('👤 Test Credentials:');
  console.log(`- Admin: admin / password123`);
  console.log(`- Seller: seller_food1 / password123`);
  console.log(`- Customer: customer1 / password123`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });