// ซิงก์ Stall.status ให้ตรงกับ BookingRequest ที่มี assignedStallCode และผ่านการอนุมัติแล้ว
// (APPROVED/IN_PROGRESS/SUCCESS) — แผงเหล่านี้ค้างสถานะ AVAILABLE อยู่ ทำให้ร้านที่จองแล้ว
// ไม่ขึ้นเป็น "จองแล้ว" บนผังตลาด (/market-map, /admin/slots)
// สคริปต์นี้ idempotent ปลอดภัยที่จะรันซ้ำ
const prisma = require('../../config/prismaClient');

async function main() {
    const requests = await prisma.bookingRequest.findMany({
        where: { status: { in: ['APPROVED', 'IN_PROGRESS', 'SUCCESS'] }, assignedStallCode: { not: null } },
        select: { assignedStallCode: true }
    });
    const codes = [...new Set(requests.map((r) => r.assignedStallCode))];

    const result = await prisma.stall.updateMany({
        where: { stallCode: { in: codes }, status: 'AVAILABLE' },
        data: { status: 'BOOKED' }
    });
    console.log('Synced Stall.status to BOOKED:', result.count);
}

main()
    .catch((error) => {
        console.error('Sync stall status fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
