// ลบแผง D210 ออกจากผังโซน D เพราะไม่มีอยู่จริงในผังตลาด
// แถวเดิม D2 ครอบคลุม D201-D212 ต่อเนื่องกัน ต้องแยกเป็น D2 (201-209) และ D2b (211-212) เพื่อข้าม D210
// สคริปต์นี้ idempotent (เช็คก่อนลบ) ปลอดภัยที่จะรันซ้ำหรือรันกับฐานข้อมูลอื่นที่ยังไม่เคยมี D210
const prisma = require('../../config/prismaClient');

async function main() {
    const stallD210 = await prisma.stall.findUnique({ where: { stallCode: 'D210' } });
    if (!stallD210) {
        console.log('D210 already removed, skipping (fix already applied).');
        return;
    }

    await prisma.$transaction(async (tx) => {
        // ลบคำขอจองที่ผูกกับแผง D210 (ถ้ามี)
        const deletedRequests = await tx.bookingRequest.deleteMany({ where: { assignedStallCode: 'D210' } });
        console.log('Deleted BookingRequest(s) pinned to D210:', deletedRequests.count);

        // ลบ BookingItem ที่ผูกกับแผง D210 (ถ้ามี) ก่อน เพราะ Stall.bookingItems onDelete: Restrict
        const deletedItems = await tx.bookingItem.deleteMany({ where: { stallId: stallD210.id } });
        console.log('Deleted BookingItem(s) pinned to D210:', deletedItems.count);

        const deletedRules = await tx.stallPriceRule.deleteMany({ where: { stallId: stallD210.id } });
        console.log('Deleted StallPriceRule(s) for D210:', deletedRules.count);

        const rowD2 = await tx.zoneRow.findFirst({ where: { zone: { code: 'D' }, rowCode: 'D2' } });
        if (rowD2) {
            // แยก D211/D212 ออกไปแถวใหม่ D2b ก่อน แล้วค่อยตัด D2 ให้จบที่ 209
            const existingD2b = await tx.zoneRow.findFirst({ where: { zoneId: rowD2.zoneId, rowCode: 'D2b' } });
            const rowD2b = existingD2b || await tx.zoneRow.create({
                data: {
                    rowCode: 'D2b',
                    label: 'Row D2b',
                    price: rowD2.price,
                    size: rowD2.size,
                    displayOrder: rowD2.displayOrder + 1,
                    stallStartNumber: 211,
                    stallEndNumber: 212,
                    zoneId: rowD2.zoneId
                }
            });

            const movedStalls = await tx.stall.updateMany({
                where: { stallCode: { in: ['D211', 'D212'] } },
                data: { rowId: rowD2b.id }
            });
            console.log('Moved D211/D212 into new ZoneRow D2b:', movedStalls.count);

            await tx.zoneRow.update({ where: { id: rowD2.id }, data: { stallEndNumber: 209 } });
        }

        const deletedStall = await tx.stall.delete({ where: { id: stallD210.id } });
        console.log('Deleted stall:', deletedStall.stallCode);
    });

    console.log('D210 removal fix applied successfully.');
}

main()
    .catch((error) => {
        console.error('D210 removal fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
