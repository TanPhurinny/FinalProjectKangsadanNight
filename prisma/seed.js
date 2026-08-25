const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample data...');

  // Seed only data that does not depend on demo users.
  // This avoids creating fake accounts while keeping a useful baseline dataset.

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
        shopSummary: 'ร้านอาหารทานง่ายที่เน้นเมนูปิ้งย่างสดใหม่ พร้อมเสิร์ฟรวดเร็วสำหรับลูกค้ายามเย็น',
        shopCoverImage: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Preferred Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'ปิ้งย่าง,อาหารพร้อมทาน,ขายดี',
        isVerified: true,
        userId: sellers[0].id,
      },
      {
        shopName: 'ข้าวแกงเพื่อสุขภาพ',
        productType: 'อาหาร',
        productDetail: 'ข้าวแกงสูตรท้องถิ่น ทำจากวัตถุดิบคุณภาพสูง',
        shopSummary: 'ข้าวแกงสูตรโฮมเมด เน้นวัตถุดิบคุณภาพและเมนูสุขภาพสำหรับลูกค้าทุกวัย',
        shopCoverImage: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Preferred Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'อาหารสุขภาพ,ข้าวแกง,เมนูประจำวัน',
        isVerified: true,
        userId: sellers[1].id,
      },
      {
        shopName: 'ร้านเสื้อสไตล์สตรีท',
        productType: 'แฟชั่น',
        productDetail: 'เสื้อผ้า แอคเซสซอรี่ สไตล์ street wear',
        shopSummary: 'ร้านแฟชั่นสตรีทที่รวมเสื้อผ้าและแอคเซสซอรี่สไตล์โดดเด่นสำหรับวัยรุ่น',
        shopCoverImage: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Trend Seller',
        shopZoneLabel: 'โซนแฟชั่น',
        shopTags: 'เสื้อผ้า,สตรีทแฟชั่น,แอคเซสซอรี่',
        isVerified: true,
        userId: sellers[2].id,
      },
      {
        shopName: 'ฟู้ดทรัค หลากหลายอาหาร',
        productType: 'อาหาร',
        productDetail: 'ฟู้ดทรัคอาหารหลากหลาย ทั้งไทยและต่างประเทศ',
        shopSummary: 'ฟู้ดทรัคที่รวมเมนูไทยและนานาชาติ พร้อมเสิร์ฟในรูปแบบทันสมัยเหมาะกับลูกค้าสายกิน',
        shopCoverImage: 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Preferred Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'ฟู้ดทรัค,อาหารนานาชาติ,เมนูฮิต',
        isVerified: true,
        userId: sellers[3].id,
      },
      {
        shopName: 'สุกี้มันต้อง',
        productType: 'อาหาร',
        productDetail: 'สุกี้ย่าง หลากรส อร่อยแน่นอน',
        shopSummary: 'สุกี้ย่างรสเข้มข้น พร้อมเมนูน้ำจิ้มสูตรเฉพาะและวัตถุดิบสดใหม่ทุกวัน',
        shopCoverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Preferred Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'สุกี้,ปิ้งย่าง,เมนูครอบครัว',
        isVerified: true,
        userId: sellers[4].id,
      },
      {
        shopName: 'กระเป๋าสตรี Modern Style',
        productType: 'แฟชั่น',
        productDetail: 'กระเป๋า กระเป๋าถือ สตรี สไตล์ทันสมัย',
        shopSummary: 'ร้านกระเป๋าแฟชั่นสำหรับผู้หญิง เน้นดีไซน์ร่วมสมัยและแมตช์ได้หลายลุค',
        shopCoverImage: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Trend Seller',
        shopZoneLabel: 'โซนแฟชั่น',
        shopTags: 'กระเป๋า,แฟชั่นผู้หญิง,ดีไซน์ทันสมัย',
        isVerified: true,
        userId: sellers[5].id,
      },
      {
        shopName: 'ลอดช่อง ทำส่วน',
        productType: 'อาหาร',
        productDetail: 'ลอดช่อง ไส้สด ใหม่ทุกวัน',
        shopSummary: 'ขนมหวานไทยทำสดใหม่ทุกวัน เน้นรสชาติดั้งเดิมและวัตถุดิบคุณภาพ',
        shopCoverImage: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'General Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'ขนมไทย,ลอดช่อง,หวานเย็น',
        isVerified: true,
        userId: sellers[6].id,
      },
      {
        shopName: 'ปลาทูอบเตาไฟฟ้า',
        productType: 'อาหาร',
        productDetail: 'ปลาทูอบสด ๆ ทุกวัน เนื้อนุ่มไม่มีคาว',
        shopSummary: 'ร้านอาหารทะเลพร้อมทาน เน้นเมนูอบสดใหม่และรสชาติแบบบ้าน ๆ',
        shopCoverImage: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'General Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'อาหารทะเล,อบสด,เมนูพื้นบ้าน',
        isVerified: true,
        userId: sellers[7].id,
      },
      {
        shopName: 'จิมชี่ หนึ่งแม่ค้า',
        productType: 'แฟชั่น',
        productDetail: 'เครื่องประดับ นาฬิกา อยุธยา สินค้าแท้',
        shopSummary: 'ร้านเครื่องประดับและนาฬิกาที่เน้นสินค้าคุณภาพ พร้อมตัวเลือกสำหรับสายแฟชั่น',
        shopCoverImage: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Trend Seller',
        shopZoneLabel: 'โซนแฟชั่น',
        shopTags: 'เครื่องประดับ,นาฬิกา,ของขวัญ',
        isVerified: true,
        userId: sellers[8].id,
      },
      {
        shopName: 'ข้าวขาหมู ต้นตำรับ',
        productType: 'อาหาร',
        productDetail: 'ข้าวขาหมู หมูร่วม ทำสูตรดั้งเดิมกำลังวัฒนา',
        shopSummary: 'ร้านข้าวขาหมูสูตรต้นตำรับที่เน้นรสชาติกลมกล่อมและบริการรวดเร็ว',
        shopCoverImage: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=1400&auto=format&fit=crop',
        sellerTier: 'Preferred Seller',
        shopZoneLabel: 'โซนอาหาร',
        shopTags: 'ข้าวขาหมู,สูตรต้นตำรับ,อาหารพร้อมทาน',
        isVerified: true,
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
    // Zone X: อาหาร (แผงพิเศษขนาดใหญ่ X101-X106)
    { slotNumber: 'X-01', zone: 'X', price: 300 },
    { slotNumber: 'X-02', zone: 'X', price: 300 },
    { slotNumber: 'X-03', zone: 'X', price: 300 },
    { slotNumber: 'X-04', zone: 'X', price: 300 },
    { slotNumber: 'X-05', zone: 'X', price: 300 },
    { slotNumber: 'X-06', zone: 'X', price: 300 },
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

  // แบนเนอร์คอมมูนิตี้เริ่มต้น (แก้ไข/เพิ่ม/ลบได้ที่หน้าแอดมินหลังจากนี้ — seed แค่ครั้งแรกตอน DB ว่าง)
  const bannerCount = await prisma.communityBanner.count();
  if (bannerCount === 0) {
    await prisma.communityBanner.createMany({
      data: [
        { imageUrl: '/img/banner.png', sortOrder: 0, isActive: true },
        { imageUrl: '/img/kang.jpg', sortOrder: 1, isActive: true },
      ],
    });
    console.log('✅ Community banners created');
  }

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