// สร้างข้อมูลตัวอย่าง (mock) เฉพาะตารางคอมมูนิตี้ (CommunityPost/Image/Like/Comment)
// แยกจาก prisma/seed.js เพราะ seed.js หลักผูกกับ user ที่สร้างไว้ตอนแรกเท่านั้น
// ส่วนสคริปต์นี้ดึงผู้ใช้ SELLER/CUSTOMER ที่มีอยู่จริงในฐานข้อมูลมาผูกโพสต์แทน
// จะได้ไม่ไปสร้าง/ชนข้อมูล user ซ้ำกับของจริงที่ทีมใช้งานอยู่
// รันด้วย: node prisma/seedCommunity.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const COMMUNITY_POSTS_SEED = [
  {
    category: 'แนะนำร้าน-บริการ',
    content: 'ลูกชิ้นปิ้งกังสดาลค่ะ 🍢\nลูกชิ้นหมูแท้ ปิ้งสดใหม่ทุกไม้ น้ำจิ้มสูตรเด็ด\nแวะมาชิมกันได้ทุกเย็นนะคะ',
    images: ['https://picsum.photos/seed/kang-skewer1/600/400'],
  },
  {
    category: 'โปรโมทร้านค้าของคุณ',
    content: 'ข้าวแกงเพื่อสุขภาพ วันนี้มีเมนูใหม่! 🥗\nแกงป่าไก่ + ผัดผักรวม ราคาเดียวกันทั้งจาน\nรับรองอิ่มท้อง ดีต่อสุขภาพแน่นอนค่ะ',
    images: ['https://picsum.photos/seed/kang-food1/600/400', 'https://picsum.photos/seed/kang-food2/600/400'],
  },
  {
    category: 'โปรโมทร้านค้าของคุณ',
    content: 'เสื้อผ้าสไตล์ street wear ลอตใหม่มาแล้ว! 👕\nไซซ์ครบ S-XXL ราคาเริ่มต้น 199 บาท\nมาลองก่อนใครที่ร้านได้เลยค่ะ',
    images: ['https://picsum.photos/seed/kang-fashion1/600/400', 'https://picsum.photos/seed/kang-fashion2/600/400', 'https://picsum.photos/seed/kang-fashion3/600/400'],
  },
  {
    category: 'เรื่องทั่วไป',
    content: 'ฟู้ดทรัคหลากหลายอาหารวันนี้เปิดตามปกติค่ะ 🚚\nจอดอยู่โซน D เหมือนเดิม แวะมาอุดหนุนกันได้นะครับ',
    images: [],
  },
  {
    category: 'แนะนำร้าน-บริการ',
    content: 'สุกี้มันต้อง น้ำซุปเข้มข้น 🍲\nวันนี้มีของสดใหม่เข้าเพิ่ม กุ้ง หมึก ครบเครื่อง\nนั่งทานที่ร้านหรือสั่งกลับบ้านก็ได้ค่ะ',
    images: ['https://picsum.photos/seed/kang-suki1/600/400'],
  },
  {
    category: 'เรื่องทั่วไป',
    content: 'ลอดช่องทำสดวันนี้หมดเร็วมากค่ะ 🙏\nพรุ่งนี้จะเพิ่มจำนวนให้มากขึ้น ขอบคุณทุกคนที่อุดหนุนนะคะ',
    images: [],
  },
  {
    category: 'ของหายได้คืน',
    content: '📣 แจ้งของหาย\nพบกระเป๋าสตางค์สีน้ำตาลตกอยู่แถวหน้าร้าน\nใครทำหายติดต่อรับคืนได้ที่ร้านเลยนะคะ',
    images: [],
  },
  {
    category: 'โปรโมทร้านค้าของคุณ',
    content: 'ข้าวขาหมูต้นตำรับ วันนี้ตุ๋นขาหมูเสร็จพอดี 🍖\nเนื้อนุ่ม หนังเด้ง ราดข้าวร้อนๆ อร่อยสุดๆ ลองเลยค่ะ',
    images: ['https://picsum.photos/seed/kang-khakmoo1/600/400'],
  },
];

async function main() {
  console.log('🌱 Seeding community feed sample data...');

  const existingCommunityPostCount = await prisma.communityPost.count();
  if (existingCommunityPostCount > 0) {
    console.log(`ℹ️ พบโพสต์คอมมูนิตี้อยู่แล้ว ${existingCommunityPostCount} รายการ ข้ามการสร้างข้อมูลใหม่`);
    return;
  }

  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER' },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });

  if (sellers.length === 0) {
    console.log('⚠️ ไม่พบผู้ใช้ role SELLER ในฐานข้อมูล จึงไม่สามารถสร้างโพสต์ตัวอย่างได้');
    return;
  }

  const createdCommunityPosts = [];
  for (let i = 0; i < COMMUNITY_POSTS_SEED.length; i += 1) {
    const postSeed = COMMUNITY_POSTS_SEED[i];
    const seller = sellers[i % sellers.length];

    const createdPost = await prisma.communityPost.create({
      data: {
        userId: seller.id,
        category: postSeed.category,
        content: postSeed.content,
        images: {
          create: postSeed.images.map((imageUrl) => ({ imageUrl })),
        },
      },
    });
    createdCommunityPosts.push(createdPost);
  }

  console.log(`✅ สร้างโพสต์คอมมูนิตี้ตัวอย่างแล้ว ${createdCommunityPosts.length} รายการ`);

  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    orderBy: { id: 'asc' },
    take: 6,
    select: { id: true },
  });

  if (customers.length > 0) {
    const likeData = [];
    createdCommunityPosts.forEach((post, postIndex) => {
      customers.forEach((customer, customerIndex) => {
        if ((postIndex + customerIndex) % 2 === 0) {
          likeData.push({ postId: post.id, userId: customer.id });
        }
      });
    });

    await prisma.communityLike.createMany({
      data: likeData,
      skipDuplicates: true,
    });

    const commentTargets = createdCommunityPosts.slice(0, Math.min(3, createdCommunityPosts.length));
    const commentData = commentTargets.map((post, index) => ({
      postId: post.id,
      userId: customers[index % customers.length].id,
      content: ['น่าอร่อยมากค่ะ เดี๋ยวแวะไปชิมนะคะ', 'ร้านนี้ดีจริง ไปอุดหนุนมาหลายรอบแล้ว', 'มีขายพรุ่งนี้อีกไหมคะ'][index % 3],
    }));

    await prisma.communityComment.createMany({ data: commentData });

    console.log(`✅ สร้างไลก์ ${likeData.length} รายการ และคอมเมนต์ ${commentData.length} รายการ`);
  } else {
    console.log('ℹ️ ไม่พบผู้ใช้ role CUSTOMER จึงข้ามการสร้างไลก์/คอมเมนต์ตัวอย่าง');
  }

  console.log('✅ ✅ ✅ Seed community feed เสร็จสมบูรณ์ ✅ ✅ ✅');
}

main()
  .catch((error) => {
    console.error('Error during community seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
