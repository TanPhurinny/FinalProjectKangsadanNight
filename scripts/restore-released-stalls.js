// กู้คืนล็อกที่ job ตัดสิทธิ์ (utils/stallRenewal.js → releaseLapsedStalls) ปล่อยไปโดยไม่ตั้งใจ
// เวอร์ชันแรกของ job เคลียร์ bookingStartDate/EndDate ทิ้งด้วย จึงกู้คืนจากวันเช่าใน Booking ล่าสุดของล็อกนั้น
//
//   node scripts/restore-released-stalls.js                 dry-run: แสดงรายการล็อกที่เข้าข่ายกู้คืน (ไม่เขียน DB)
//   node scripts/restore-released-stalls.js --apply F632 F601 ...   กู้คืนเฉพาะรหัสที่ระบุ
//
// เข้าข่าย = Stall ว่าง (AVAILABLE) ไม่มี bookingEndDate แต่ Booking ล่าสุดของ Slot เลขเดียวกันเป็น
// IN_PROGRESS/SUCCESS/APPROVED และมี rentalEndDate — ตรวจแล้วเลือกรหัสเองเสมอ ไม่กู้คืนทั้งหมดอัตโนมัติ
// เพราะล็อกที่แอดมินปล่อยเองด้วยมือ/หมดสัญญานานแล้วก็หน้าตาเหมือนกัน
const prisma = require('../config/prismaClient');

const ACTIVE_STATUSES = ['IN_PROGRESS', 'SUCCESS', 'APPROVED'];

async function findCandidates() {
    const slots = await prisma.slot.findMany({
        where: { bookings: { some: { status: { in: ACTIVE_STATUSES }, rentalEndDate: { not: null } } } },
        select: {
            slotNumber: true,
            bookings: {
                where: { status: { in: ACTIVE_STATUSES }, rentalEndDate: { not: null } },
                orderBy: { id: 'desc' },
                take: 1,
                select: { id: true, status: true, rentalStartDate: true, rentalEndDate: true }
            }
        }
    });
    const stalls = await prisma.stall.findMany({
        where: { stallCode: { in: slots.map((s) => s.slotNumber) }, status: 'AVAILABLE', bookingEndDate: null }
    });
    const stallByCode = new Map(stalls.map((s) => [s.stallCode, s]));
    return slots
        .filter((s) => stallByCode.has(s.slotNumber))
        .map((s) => ({ stall: stallByCode.get(s.slotNumber), booking: s.bookings[0] }))
        .sort((a, b) => a.booking.rentalEndDate - b.booking.rentalEndDate);
}

(async () => {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const codes = args.filter((a) => !a.startsWith('--')).map((c) => c.toUpperCase());
    try {
        const candidates = await findCandidates();
        if (!apply) {
            console.log('เข้าข่ายกู้คืน (ยังไม่เขียน DB):');
            console.table(candidates.map(({ stall, booking }) => ({
                stall: stall.stallCode,
                booking: booking.id,
                status: booking.status,
                start: booking.rentalStartDate?.toDateString(),
                end: booking.rentalEndDate.toDateString()
            })));
            console.log('กู้คืน: node scripts/restore-released-stalls.js --apply <รหัสล็อก...>');
            return;
        }
        if (!codes.length) throw new Error('ระบุรหัสล็อกที่จะกู้คืนด้วย เช่น --apply F632 F601');
        const chosen = candidates.filter(({ stall }) => codes.includes(stall.stallCode));
        const missing = codes.filter((c) => !chosen.some(({ stall }) => stall.stallCode === c));
        if (missing.length) console.warn('ไม่เข้าข่าย/ข้าม:', missing.join(', '));

        for (const { stall, booking } of chosen) {
            await prisma.$transaction([
                prisma.stall.update({
                    where: { id: stall.id },
                    data: { status: 'BOOKED', isAvailable: false, bookingStartDate: booking.rentalStartDate, bookingEndDate: booking.rentalEndDate }
                }),
                prisma.slot.updateMany({ where: { slotNumber: stall.stallCode }, data: { isAvailable: false } })
            ]);
            console.log(`กู้คืน ${stall.stallCode}: BOOKED ถึง ${booking.rentalEndDate.toDateString()} (booking #${booking.id})`);
        }
    } catch (error) {
        console.error('ผิดพลาด:', error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
})();
