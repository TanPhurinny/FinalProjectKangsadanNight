// Backfill ครั้งเดียว: Stall ที่ status=BOOKED แต่ bookingStartDate/bookingEndDate เป็น null (บั๊กเดิมใน
// confirmBookingStall ที่ไม่เคยเขียนวันที่ลง Stall เลย ดู controllers/approvalController.js) — หาระยะเวลา
// เช่าจริงจาก Slot.slotNumber(=stallCode) -> Booking ล่าสุดที่ยังไม่ถูกปฏิเสธ แล้วเติมกลับเข้า Stall
// ไม่แตะ Stall ที่มีวันที่อยู่แล้ว (แก้แค่ null เท่านั้น) และไม่แตะ Booking/BookingRequest ใดๆ
// รัน: node scripts/backfill-stall-booking-dates.js [--apply]   (ไม่ใส่ --apply = dry-run แค่พิมพ์ดูก่อน)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const apply = process.argv.includes('--apply');

    const stalls = await prisma.stall.findMany({
        where: { status: 'BOOKED', bookingEndDate: null },
        select: { id: true, stallCode: true }
    });

    if (!stalls.length) {
        console.log('ไม่มีล็อกที่ต้อง backfill (ทุกล็อกที่ BOOKED มีวันที่ครบแล้ว)');
        return;
    }

    console.log(`เจอ ${stalls.length} ล็อกที่ BOOKED แต่ไม่มีวันที่ — กำลังหาระยะเวลาเช่าจริงจาก Booking...`);

    let fixed = 0;
    let noBooking = 0;

    for (const stall of stalls) {
        const slot = await prisma.slot.findUnique({
            where: { slotNumber: stall.stallCode },
            select: {
                bookings: {
                    where: { status: { in: ['IN_PROGRESS', 'SUCCESS', 'APPROVED'] } },
                    orderBy: { id: 'desc' },
                    take: 1,
                    select: { rentalStartDate: true, rentalEndDate: true }
                }
            }
        });
        const booking = slot?.bookings[0];
        if (!booking || !booking.rentalEndDate) {
            noBooking += 1;
            console.log(`  ${stall.stallCode}: ไม่พบ Booking ที่มีวันที่ผูกกับล็อกนี้ — ข้าม (ต้องเช็คมือ)`);
            continue;
        }

        console.log(`  ${stall.stallCode}: เจอวันที่ ${booking.rentalStartDate?.toISOString().slice(0, 10)} - ${booking.rentalEndDate.toISOString().slice(0, 10)}${apply ? ' — บันทึกแล้ว' : ' (dry-run, ยังไม่บันทึก)'}`);
        if (apply) {
            await prisma.stall.update({
                where: { id: stall.id },
                data: { bookingStartDate: booking.rentalStartDate, bookingEndDate: booking.rentalEndDate }
            });
        }
        fixed += 1;
    }

    console.log(`\nสรุป: แก้ได้ ${fixed} ล็อก, หา Booking ไม่เจอ ${noBooking} ล็อก (ต้องเช็คมือ)`);
    if (!apply) console.log('นี่คือ dry-run เท่านั้น รันใหม่พร้อม --apply เพื่อบันทึกจริง');
}

run()
    .catch((err) => {
        console.error('ผิดพลาด:', err.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
