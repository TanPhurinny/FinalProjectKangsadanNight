// เติม BookingRequest.userId ให้คำขอที่ยังไม่มี (คำขอก่อนมีคอลัมน์นี้ หรือสร้างจากโค้ด branch อื่นที่ยังไม่เติมให้)
// รันซ้ำได้ แตะเฉพาะแถวที่ userId ยังเป็น null
//
//   node scripts/backfill-booking-request-user.js           dry-run: แสดงว่าจะเติมกี่แถว แถวไหนหาเจ้าของไม่เจอ (ไม่เขียน DB)
//   node scripts/backfill-booking-request-user.js --apply   เขียนจริง
//
// ลำดับการหาเจ้าของ:
//   1. Booking ที่ผูกกับคำขอ (storeDetailSnapshot ขึ้นต้นด้วย [BOOKING_REQUEST_ID:<id>]) — Booking.userId คือคนที่กดจองจริง
//   2. ชื่อผู้ขาย (sellerName) ที่ตรงกับ User.name เพียงคนเดียว — ชื่อซ้ำกันข้าม ไม่เดาให้
const prisma = require('../config/prismaClient');

const REQUEST_TAG_REGEX = /^\[BOOKING_REQUEST_ID:(\d+)\]/;

async function main() {
    const apply = process.argv.includes('--apply');

    const requests = await prisma.bookingRequest.findMany({
        where: { userId: null },
        select: { id: true, sellerName: true, status: true }
    });
    if (!requests.length) {
        console.log('ทุกคำขอมี userId แล้ว');
        return;
    }

    const userIdsByRequestId = new Map();
    const bookings = await prisma.booking.findMany({
        where: { storeDetailSnapshot: { startsWith: '[BOOKING_REQUEST_ID:' } },
        select: { userId: true, storeDetailSnapshot: true }
    });
    bookings.forEach((booking) => {
        const match = REQUEST_TAG_REGEX.exec(String(booking.storeDetailSnapshot || ''));
        if (!match) return;
        const requestId = Number(match[1]);
        if (!userIdsByRequestId.has(requestId)) userIdsByRequestId.set(requestId, new Set());
        userIdsByRequestId.get(requestId).add(booking.userId);
    });

    const users = await prisma.user.findMany({ select: { id: true, name: true } });
    const usersByName = new Map();
    users.forEach((user) => {
        const name = String(user.name || '').trim();
        if (!name) return;
        if (!usersByName.has(name)) usersByName.set(name, []);
        usersByName.get(name).push(user.id);
    });

    const updates = [];
    const unresolved = [];
    requests.forEach((request) => {
        const fromBooking = userIdsByRequestId.get(request.id);
        if (fromBooking && fromBooking.size === 1) {
            updates.push({ id: request.id, userId: [...fromBooking][0], source: 'booking' });
            return;
        }
        const byName = usersByName.get(String(request.sellerName || '').trim()) || [];
        if (byName.length === 1) {
            updates.push({ id: request.id, userId: byName[0], source: 'name' });
            return;
        }
        unresolved.push({ id: request.id, sellerName: request.sellerName, status: request.status, reason: byName.length > 1 ? 'ชื่อซ้ำหลายบัญชี' : 'ไม่พบผู้ใช้' });
    });

    console.log(`คำขอที่ยังไม่มี userId: ${requests.length}`);
    console.log(`  เติมได้จาก Booking: ${updates.filter((u) => u.source === 'booking').length}`);
    console.log(`  เติมได้จากชื่อผู้ขาย: ${updates.filter((u) => u.source === 'name').length}`);
    console.log(`  หาเจ้าของไม่เจอ: ${unresolved.length}`);
    unresolved.forEach((row) => console.log(`    #${row.id} ${row.sellerName || '-'} (${row.status}) — ${row.reason}`));

    if (!apply) {
        console.log('\n(dry-run) ใส่ --apply เพื่อเขียนจริง');
        return;
    }

    for (const update of updates) {
        await prisma.bookingRequest.updateMany({
            where: { id: update.id, userId: null },
            data: { userId: update.userId }
        });
    }
    console.log(`\nเติม userId แล้ว ${updates.length} แถว`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
