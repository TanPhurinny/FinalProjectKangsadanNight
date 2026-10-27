// ใส่รีวิวทดสอบให้ร้านหนึ่งร้าน ไว้ดูหน้าตาตอนร้านมีรีวิวเยอะ (การ์ดร้านบนผังตลาด / ร้านค้าของฉัน / หน้าแจ้งเตือน)
// รีวิวมาจากบัญชีทดสอบ 30 บัญชี (username test-review-01..30, ชื่อขึ้นต้น "ทดสอบ-" เป็นคำเดียวให้ displayName แสดงเต็ม, บทบาท CUSTOMER, รหัสผ่านสุ่มที่ไม่มีใครรู้ — ล็อกอินไม่ได้)
// ไม่ใช้บัญชีจริงของใครรีวิว — DB ใช้ร่วมกันทั้งทีม ทุกคนจะเห็นรีวิวพวกนี้จนกว่าจะรัน --cleanup
//
//   node scripts/seed-test-reviews.js --shop <username>            dry-run: บอกว่าจะใส่ให้ร้านไหน กี่รีวิว (ไม่เขียน DB)
//   node scripts/seed-test-reviews.js --shop <username> --apply    เขียนจริง (รันซ้ำได้ — อัปเดตรีวิวเดิมของบัญชีทดสอบ ไม่สร้างซ้ำ)
//   node scripts/seed-test-reviews.js --cleanup                    dry-run ของการลบ
//   node scripts/seed-test-reviews.js --cleanup --apply            ลบบัญชีทดสอบทั้งหมด (รีวิวของบัญชีพวกนี้ถูกลบตามด้วย onDelete: Cascade)
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/prismaClient');

const USERNAME_PREFIX = 'test-review-';
const H = 60 * 60 * 1000;

// [ดาว, ชื่อ, ความเห็น, ผ่านมากี่ชม., คำตอบร้าน, สถานะพิเศษ]
const REVIEWS = [
    [5, 'นิดา', 'หมูปิ้งนุ่มมาก หมักถึง น้ำจิ้มแจ่วเด็ดสุด มาทุกวันศุกร์เลยค่ะ', 0.3],
    [5, 'ต้น', 'ร้านเปิดตรงเวลา แม่ค้าใจดี ให้ข้าวเหนียวเพิ่มด้วย', 1.2],
    [4, 'แอน', 'อร่อยแต่คิวยาวช่วงสองทุ่ม รอประมาณ 15 นาที', 3],
    [5, 'บอส', null, 5],
    [3, 'มายด์', 'วันนี้ไหม้ไปหน่อย ปกติอร่อยกว่านี้', 9],
    [5, 'พี่เก่ง', 'เครื่องดื่มเข้มข้นมาก ราคาไม่แพง', 20],
    [4, 'ฝน', 'รสชาติดี อยากให้มีแบบไม่หวานด้วย', 26, 'ขอบคุณค่ะ เดี๋ยวลองทำสูตรไม่หวานขายดูนะคะ'],
    [5, 'เจมส์', 'ร้านประจำตั้งแต่ปีที่แล้ว ไม่เคยผิดหวัง', 30, 'ขอบคุณที่อุดหนุนมาตลอดนะคะ'],
    [2, 'กอล์ฟ', 'สั่งไปแล้วได้ของไม่ครบ ขาดน้ำจิ้ม', 40, 'ขออภัยค่ะ ครั้งหน้าแวะมาบอกได้เลย แถมให้'],
    [5, 'ปลา', 'ชิ้นใหญ่ คุ้มมาก', 50],
    [4, 'มิว', null, 60],
    [5, 'โอ๊ต', 'ตลาดนี้ต้องแวะร้านนี้ก่อนเลย', 72, 'ขอบคุณมากค่ะ'],
    [1, 'สแปม', 'ร้านห่วย ไม่ต้องมากิน (ตัวอย่างรีวิวที่แอดมินซ่อน)', 80, null, 'hidden'],
    [5, 'เบล', 'ชาไทยหอม หวานกำลังดี', 96],
    [4, 'กิ๊ฟ', 'ที่นั่งน้อยไปหน่อย แต่ของอร่อยโอเค', 110, 'ตอนนี้เพิ่มโต๊ะอีก 2 ตัวแล้วนะคะ'],
    [5, 'ภูมิ', 'จำได้ว่าเราไม่ทานผัก น่ารักมาก', 130],
    [3, 'ดาว', 'กลางๆ ราคาขึ้นจากเดิมนิดนึง', 150, null, 'reported'],
    [5, 'อาร์ม', 'คอมโบที่ดีที่สุดในตลาด', 170, 'ขอบคุณค่ะ'],
    [4, 'ตาล', null, 200],
    [5, 'นัท', 'มากับครอบครัว ลูกชอบมาก', 230, 'ขอบคุณค่ะ ฝากหอมแก้มน้องด้วยนะคะ'],
    [5, 'บี', 'สะอาด ใส่ถุงมือทุกครั้ง', 260],
    [4, 'จูน', 'อร่อย แต่อยากให้รับโอนได้ด้วย', 300, 'ตอนนี้รับพร้อมเพย์แล้วค่ะ สแกน QR หน้าร้านได้เลย'],
    [5, 'เอ็ม', 'ซื้อไปฝากที่ทำงาน ทุกคนชม', 340],
    [2, 'พลอย', 'รอนานมาก เกือบ 30 นาที', 380, 'ขออภัยค่ะ วันนั้นคนช่วยลาไป ตอนนี้มีคนช่วยสองคนแล้ว'],
    [5, 'ไผ่', 'นุ่ม ไม่เหนียว', 420],
    [4, 'แพร', 'น้ำจิ้มอร่อยมาก ขอสูตรได้มั้ย 555', 470, 'ความลับค่ะ'],
    [5, 'ต่อ', null, 520],
    [5, 'ณัฐ', 'ไม่เคยผิดหวังสักครั้ง', 580, 'ขอบคุณค่ะ'],
    [3, 'ฟ้า', 'วันนี้ของหมดเร็ว มาสามทุ่มไม่ทันแล้ว', 640],
    [5, 'ปอนด์', 'ร้านดีที่สุดในโซนนี้', 700, 'ขอบคุณค่ะ']
];

function argValue(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

async function cleanup(apply) {
    const users = await prisma.user.findMany({
        where: { username: { startsWith: USERNAME_PREFIX } },
        select: { id: true }
    });
    const reviewCount = await prisma.shopReview.count({ where: { userId: { in: users.map((u) => u.id) } } });
    console.log(`บัญชีทดสอบ ${users.length} บัญชี รีวิวของบัญชีพวกนี้ ${reviewCount} รีวิว`);
    if (!apply) {
        console.log('dry-run — ใส่ --apply เพื่อลบจริง');
        return;
    }
    const result = await prisma.user.deleteMany({ where: { username: { startsWith: USERNAME_PREFIX } } });
    console.log(`ลบบัญชีทดสอบแล้ว ${result.count} บัญชี (รีวิวถูกลบตามด้วย)`);
}

async function seed(shopUsername, apply) {
    const shop = await prisma.user.findUnique({ where: { username: shopUsername }, include: { shops: { orderBy: { id: 'asc' }, take: 1 } } });
    if (!shop) throw new Error(`ไม่พบผู้ใช้ username "${shopUsername}"`);
    if (shop.role !== 'SELLER') throw new Error(`"${shopUsername}" เป็น ${shop.role} ไม่ใช่ผู้ขาย`);
    console.log(`ร้าน: ${shop.shops[0]?.shopName || '(ยังไม่ตั้งชื่อร้าน)'} — เจ้าของ ${shop.name} (id ${shop.id})`);
    console.log(`จะใส่รีวิว ${REVIEWS.length} รีวิว จากบัญชี ${USERNAME_PREFIX}01..${String(REVIEWS.length).padStart(2, '0')}`);
    if (!apply) {
        console.log('dry-run — ใส่ --apply เพื่อเขียนจริง');
        return;
    }

    const now = Date.now();
    for (let i = 0; i < REVIEWS.length; i += 1) {
        const [rating, name, comment, hoursAgo, reply, flag] = REVIEWS[i];
        const username = `${USERNAME_PREFIX}${String(i + 1).padStart(2, '0')}`;
        // รหัสผ่านสุ่มทิ้ง ไม่มีใครรู้ — บัญชีมีไว้เป็นเจ้าของรีวิวเท่านั้น ล็อกอินไม่ได้
        const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const user = await prisma.user.upsert({
            where: { username },
            update: { name: `ทดสอบ-${name}` },
            create: { username, password, name: `ทดสอบ-${name}`, role: 'CUSTOMER' }
        });

        const createdAt = new Date(now - hoursAgo * H);
        const data = {
            rating,
            comment,
            sellerReply: reply || null,
            sellerRepliedAt: reply ? new Date(createdAt.getTime() + 3 * H) : null,
            isHidden: flag === 'hidden',
            hiddenReason: flag === 'hidden' ? 'ข้อความสแปม/ไม่สุภาพ (รีวิวทดสอบ)' : null,
            hiddenAt: flag === 'hidden' ? new Date(createdAt.getTime() + H) : null,
            reportCount: flag === 'reported' ? 1 : 0,
            reportReason: flag === 'reported' ? 'ข้อมูลไม่ตรงความจริง (รีวิวทดสอบ)' : null,
            reportedAt: flag === 'reported' ? new Date(createdAt.getTime() + 2 * H) : null,
            createdAt
        };
        await prisma.shopReview.upsert({
            where: { shopUserId_userId: { shopUserId: shop.id, userId: user.id } },
            update: data,
            create: { ...data, shopUserId: shop.id, userId: user.id }
        });
    }
    console.log(`ใส่รีวิวทดสอบแล้ว ${REVIEWS.length} รีวิว — ลบออกด้วย: node scripts/seed-test-reviews.js --cleanup --apply`);
}

async function main() {
    const apply = process.argv.includes('--apply');
    if (process.argv.includes('--cleanup')) return cleanup(apply);
    const shopUsername = argValue('--shop');
    if (!shopUsername) {
        console.log('ใช้: node scripts/seed-test-reviews.js --shop <username> [--apply]  หรือ  --cleanup [--apply]');
        return;
    }
    return seed(shopUsername, apply);
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
