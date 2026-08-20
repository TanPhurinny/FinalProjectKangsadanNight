// การรัน prisma/seed-market-structure.js ซ้ำ (reseed) สร้างแผงปลอม B202-B221 และ X103-X106 ขึ้นมาใหม่
// เพราะ seed ไม่รู้จักโซน T (สร้างแยกจาก prisma/fixes/2026-07-13-fix-market-layout.js) จึงไม่ได้ตัดออก
// ส่วนฟิกซ์เดิม (2026-07-13) เช็คแค่ "โซน T มีอยู่แล้วหรือยัง" ก่อนรัน พอโซน T ถูกสร้างไปแล้วครั้งแรก
// สคริปต์นั้นเลย skip ทุกครั้งต่อจากนี้ ทำให้แผงปลอมที่ reseed สร้างใหม่ไม่เคยถูกลบซ้ำ
// สคริปต์นี้ทำเฉพาะส่วนลบ/จัดแถวใหม่ (ไม่แตะโซน T ที่มีอยู่แล้ว) เช็คก่อนลบ ปลอดภัยที่จะรันซ้ำ
const prisma = require('../../config/prismaClient');

async function main() {
    const fakeB202 = await prisma.stall.findUnique({ where: { stallCode: 'B202' } });
    const fakeX103 = await prisma.stall.findUnique({ where: { stallCode: 'X103' } });
    if (!fakeB202 && !fakeX103) {
        console.log('Fake B202-B221/X103-X106 already removed, skipping (fix already applied).');
        return;
    }

    await prisma.$transaction(async (tx) => {
        const deletedRequest = await tx.bookingRequest.deleteMany({ where: { assignedStallCode: 'B219' } });
        console.log('Deleted BookingRequest(s) pinned to fake B219:', deletedRequest.count);

        const fakeBCodes = [];
        for (let i = 202; i <= 221; i += 1) fakeBCodes.push('B' + i);
        const deletedB = await tx.stall.deleteMany({ where: { stallCode: { in: fakeBCodes } } });
        console.log('Deleted fake B202-B221 stalls:', deletedB.count);

        const rowB2 = await tx.zoneRow.findFirst({ where: { zone: { code: 'B' }, rowCode: 'B2' } });
        if (rowB2 && rowB2.stallEndNumber !== 201) {
            await tx.zoneRow.update({ where: { id: rowB2.id }, data: { stallStartNumber: 201, stallEndNumber: 201 } });
        }

        let rowB2b = await tx.zoneRow.findFirst({ where: { zone: { code: 'B' }, rowCode: 'B2b' } });
        if (!rowB2b) {
            const laterRows = await tx.zoneRow.findMany({
                where: { zone: { code: 'B' }, rowCode: { in: ['B299', 'B300', 'B3', 'B4', 'B5', 'B6'] } }
            });
            for (const row of laterRows) {
                await tx.zoneRow.update({ where: { id: row.id }, data: { displayOrder: row.displayOrder + 1 } });
            }

            const zoneB = await tx.zone.findUnique({ where: { code: 'B' } });
            rowB2b = await tx.zoneRow.create({
                data: {
                    rowCode: 'B2b',
                    label: 'Row B2b',
                    price: 180,
                    size: '3x3',
                    displayOrder: 5,
                    stallStartNumber: 222,
                    stallEndNumber: 223,
                    zoneId: zoneB.id
                }
            });
        }
        const movedStalls = await tx.stall.updateMany({
            where: { stallCode: { in: ['B222', 'B223'] } },
            data: { rowId: rowB2b.id }
        });
        console.log('Moved B222/B223 into ZoneRow B2b:', movedStalls.count);

        const deletedX = await tx.stall.deleteMany({ where: { stallCode: { in: ['X103', 'X104', 'X105', 'X106'] } } });
        console.log('Deleted fake X103-X106 stalls:', deletedX.count);

        const rowX1 = await tx.zoneRow.findFirst({ where: { zone: { code: 'X' } } });
        if (rowX1 && rowX1.stallEndNumber !== 102) {
            await tx.zoneRow.update({ where: { id: rowX1.id }, data: { stallStartNumber: 101, stallEndNumber: 102 } });
        }
    });

    console.log('B2/X layout re-fix applied successfully.');
}

main()
    .catch((error) => {
        console.error('B2/X layout re-fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
