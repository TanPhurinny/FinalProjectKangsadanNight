// สคริปต์จำลองข้อมูลจริงใน DB dev เพื่อดูฟีเจอร์เตือนระยะห่างล็อก (utils/stallSpacing.js) บนหน้าเว็บจริง
// สร้าง 3 เคส:
//   1) แฟชั่น (โซน B แถว B6, เกณฑ์ 3 ล็อก) — occupant เดียวที่ B603 ขาย "หมวกแก๊ป/หมวกสาน"
//   2) อาหาร (โซน F แถว F1, เกณฑ์ 5 ล็อก) — occupant 2 จุด (F103, F111) ขาย "ไก่ทอด" ให้เห็นแพทเทิร์นสลับส้ม/เขียว
//   3) subtype ไม่ตรงกันเลย (โซน B แถว B6 เดิม) — applicant ขอ "รองเท้าแตะ" ทั้งที่ B603 ขายหมวกอยู่ติดกัน
//      ควรเขียวหมดทั้งแถว (ไม่เตือน เพราะคนละสินค้า)
//
// รัน:     node scripts/demo-stall-spacing-seed.js
// ลบล้าง:  node scripts/demo-stall-spacing-seed.js --cleanup
//
// ทุก record ที่สร้างมีแท็ก DEMO_SPACING_SEED กำกับ (username ขึ้นต้น demo_spacing_, description มี
// [DEMO_SPACING_SEED]) เพื่อให้ --cleanup หาแล้วลบล้างคืนสภาพเดิมได้ปลอดภัย ไม่กระทบข้อมูลจริง
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TAG = '[DEMO_SPACING_SEED]';
const DEMO_STALL_CODES = ['B603', 'F103', 'F111'];

async function cleanup() {
    console.log('ลบข้อมูลจำลอง...');

    const requests = await prisma.bookingRequest.findMany({ where: { description: { contains: TAG } } });
    for (const r of requests) {
        await prisma.bookingRequest.delete({ where: { id: r.id } });
    }

    const users = await prisma.user.findMany({
        where: { username: { startsWith: 'demo_spacing_' } },
        select: { id: true }
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length) {
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.sellerApplication.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.shopDetail.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    // คืนล็อกจำลองทั้งหมดให้ว่างเหมือนเดิม
    await prisma.stall.updateMany({
        where: { stallCode: { in: DEMO_STALL_CODES } },
        data: { isAvailable: true, status: 'AVAILABLE' }
    });
    await prisma.slot.updateMany({
        where: { slotNumber: { in: DEMO_STALL_CODES } },
        data: { isAvailable: true }
    });

    console.log(`ลบแล้ว: BookingRequest ${requests.length} แถว, User ${userIds.length} คน, คืนล็อก ${DEMO_STALL_CODES.join(', ')} เป็นว่าง`);
}

// จองล็อกให้ occupant คนหนึ่งด้วย subtype ที่กำหนด (ใช้ซ้ำได้หลายเคส)
async function occupyStall({ stallCode, username, shopName, productType, productSubtype, phone }) {
    const user = await prisma.user.create({
        data: {
            username,
            password: 'demo-not-a-real-password',
            name: shopName,
            role: 'CUSTOMER',
            phoneNumber: phone
        }
    });
    await prisma.shopDetail.create({
        data: { userId: user.id, shopName, productType, productSubtype }
    });

    const stall = await prisma.stall.findUnique({ where: { stallCode } });
    if (!stall) throw new Error(`ไม่พบล็อก ${stallCode} ในระบบ — เช็คว่ามีข้อมูลผังตลาดจริงในโซนนี้แล้วหรือยัง`);

    await prisma.stall.update({ where: { id: stall.id }, data: { isAvailable: false, status: 'BOOKED' } });

    const slot = await prisma.slot.upsert({
        where: { slotNumber: stallCode },
        update: { isAvailable: false },
        create: { slotNumber: stallCode, zone: stallCode.replace(/[0-9].*$/, ''), price: stall.basePrice || 200, isAvailable: false }
    });

    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await prisma.booking.create({
        data: {
            slotId: slot.id,
            userId: user.id,
            status: 'IN_PROGRESS',
            zoneCode: stallCode.replace(/[0-9].*$/, ''),
            stallCount: 1,
            rentalStartDate: now,
            rentalEndDate: weekLater,
            rentalDays: 7,
            dailyStallPrice: stall.basePrice || 200,
            rentTotal: (stall.basePrice || 200) * 7,
            grandTotal: (stall.basePrice || 200) * 7
        }
    });
}

// สร้างคำขอใหม่ (PENDING) ให้เปิดดูใน /admin/booking-stall
async function createApplicantRequest({ username, shopName, productType, productSubtype, phone, zone, noteLabel }) {
    const applicant = await prisma.user.create({
        data: {
            username,
            password: 'demo-not-a-real-password',
            name: shopName,
            role: 'CUSTOMER',
            phoneNumber: phone
        }
    });
    await prisma.sellerApplication.create({
        data: {
            userId: applicant.id,
            shopName,
            productType,
            productSubtype,
            phoneNumber: phone,
            sellerName: shopName,
            status: 'APPROVED'
        }
    });

    return prisma.bookingRequest.create({
        data: {
            productName: shopName,
            description: `${TAG} ${noteLabel} — ข้อมูลจำลอง ลบได้ด้วย --cleanup`,
            sellerName: shopName,
            phone,
            zone,
            status: 'PENDING'
        }
    });
}

async function seed() {
    // เคส 1: แฟชั่น เกณฑ์ 3 ล็อก — occupant เดียวที่ B603
    await occupyStall({
        stallCode: 'B603',
        username: 'demo_spacing_case1_occupant',
        shopName: 'ร้านสาธิต 1 (จองแล้วที่ B603)',
        productType: 'FASHION',
        productSubtype: 'หมวกแก๊ป/หมวกสาน',
        phone: '0900000011'
    });
    const req1 = await createApplicantRequest({
        username: 'demo_spacing_case1_applicant',
        shopName: 'ร้านสาธิต 1 (ผู้ขอจองใหม่ - ขายหมวกเหมือนกัน)',
        productType: 'FASHION',
        productSubtype: 'หมวกแก๊ป/หมวกสาน',
        phone: '0900000012',
        zone: 'B',
        noteLabel: 'เคส1: แฟชั่น subtype ตรงกัน เกณฑ์ 3 ล็อก'
    });

    // เคส 2: อาหาร เกณฑ์ 5 ล็อก — occupant 2 จุดในแถวเดียวกัน (F103, F111) ให้เห็นแพทเทิร์นสลับ
    await occupyStall({
        stallCode: 'F103',
        username: 'demo_spacing_case2_occupantA',
        shopName: 'ร้านสาธิต 2A (จองแล้วที่ F103)',
        productType: 'FOOD',
        productSubtype: 'ไก่ทอด',
        phone: '0900000021'
    });
    await occupyStall({
        stallCode: 'F111',
        username: 'demo_spacing_case2_occupantB',
        shopName: 'ร้านสาธิต 2B (จองแล้วที่ F111)',
        productType: 'FOOD',
        productSubtype: 'ไก่ทอด',
        phone: '0900000022'
    });
    const req2 = await createApplicantRequest({
        username: 'demo_spacing_case2_applicant',
        shopName: 'ร้านสาธิต 2 (ผู้ขอจองใหม่ - ขายไก่ทอดเหมือนกัน)',
        productType: 'FOOD',
        productSubtype: 'ไก่ทอด',
        phone: '0900000023',
        zone: 'F',
        noteLabel: 'เคส2: อาหาร subtype ตรงกัน เกณฑ์ 5 ล็อก มี occupant 2 จุด'
    });

    // เคส 3: subtype ไม่ตรงกันเลย — ใช้ occupant เดิมของเคส 1 (B603 ขายหมวก) แต่ applicant ขอ "รองเท้าแตะ"
    const req3 = await createApplicantRequest({
        username: 'demo_spacing_case3_applicant',
        shopName: 'ร้านสาธิต 3 (ผู้ขอจองใหม่ - ขายรองเท้า คนละอย่างกับ B603)',
        productType: 'FASHION',
        productSubtype: 'รองเท้าแตะ',
        phone: '0900000031',
        zone: 'B',
        noteLabel: 'เคส3: subtype ไม่ตรงกัน ควรไม่เตือนเลยแม้อยู่ติด B603'
    });

    console.log('สร้างข้อมูลจำลองครบ 3 เคส:\n');
    console.log('เคส 1 (แฟชั่น หมวก, เกณฑ์ 3 ล็อก):');
    console.log(`  http://localhost:3000/admin/booking-stall?requestId=${req1.id}`);
    console.log('  คาดว่าเห็น: B603 เทา, B601/B602/B604/B605 กรอบส้ม, B606 ขึ้นไปกรอบเขียว\n');

    console.log('เคส 2 (อาหาร ไก่ทอด, เกณฑ์ 5 ล็อก, 2 occupant):');
    console.log(`  http://localhost:3000/admin/booking-stall?requestId=${req2.id}`);
    console.log('  คาดว่าเห็น: F103, F111 เทา, รอบๆทั้งสองจุด (ห่าง<5) กรอบส้มสลับกัน, ที่เหลือกรอบเขียว\n');

    console.log('เคส 3 (subtype ไม่ตรงกัน — รองเท้า vs หมวกที่ B603):');
    console.log(`  http://localhost:3000/admin/booking-stall?requestId=${req3.id}`);
    console.log('  คาดว่าเห็น: B603 เทา, ที่เหลือทั้งแถวกรอบเขียวหมด (ไม่มีกรอบส้มเลย)\n');

    console.log('ลบข้อมูลจำลองทีหลังด้วย: node scripts/demo-stall-spacing-seed.js --cleanup');
}

(async () => {
    try {
        if (process.argv.includes('--cleanup')) {
            await cleanup();
        } else {
            await seed();
        }
    } catch (err) {
        console.error('ผิดพลาด:', err.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
})();
