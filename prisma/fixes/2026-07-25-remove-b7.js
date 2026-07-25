// ลบแถว B7 (B701-B715) ออกจากผังโซน B เพราะไม่มีอยู่จริงในผังตลาด
// สคริปต์นี้ idempotent (เช็คก่อนลบ) ปลอดภัยที่จะรันซ้ำหรือรันกับฐานข้อมูลอื่นที่ยังไม่เคยมี B7
const prisma = require('../../config/prismaClient');

async function main() {
    const rowB7 = await prisma.zoneRow.findFirst({ where: { zone: { code: 'B' }, rowCode: 'B7' } });
    if (!rowB7) {
        console.log('Row B7 already removed, skipping (fix already applied).');
        return;
    }

    await prisma.$transaction(async (tx) => {
        const b7Codes = [];
        for (let i = 701; i <= 715; i += 1) b7Codes.push('B' + i);

        // ลบคำขอจองที่ผูกกับแผง B7xx (ถ้ามี)
        const deletedRequests = await tx.bookingRequest.deleteMany({ where: { assignedStallCode: { in: b7Codes } } });
        console.log('Deleted BookingRequest(s) pinned to B7xx:', deletedRequests.count);

        const b7Stalls = await tx.stall.findMany({ where: { stallCode: { in: b7Codes } }, select: { id: true } });
        const b7StallIds = b7Stalls.map((stall) => stall.id);

        if (b7StallIds.length) {
            // ลบ BookingItem ที่ผูกกับแผง B7xx (ถ้ามี) ก่อน เพราะ Stall.bookingItems onDelete: Restrict
            const deletedItems = await tx.bookingItem.deleteMany({ where: { stallId: { in: b7StallIds } } });
            console.log('Deleted BookingItem(s) pinned to B7xx stalls:', deletedItems.count);

            const deletedRules = await tx.stallPriceRule.deleteMany({ where: { stallId: { in: b7StallIds } } });
            console.log('Deleted StallPriceRule(s) for B7xx stalls:', deletedRules.count);
        }

        const deletedStalls = await tx.stall.deleteMany({ where: { stallCode: { in: b7Codes } } });
        console.log('Deleted B701-B715 stalls:', deletedStalls.count);

        await tx.zoneRow.delete({ where: { id: rowB7.id } });
        console.log('Deleted ZoneRow B7.');
    });

    console.log('B7 removal fix applied successfully.');
}

main()
    .catch((error) => {
        console.error('B7 removal fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
