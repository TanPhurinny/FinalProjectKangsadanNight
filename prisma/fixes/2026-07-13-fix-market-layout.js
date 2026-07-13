// แก้ผังแผงให้ตรงกับผังจริง (รูปถ่ายป้ายผังตลาดกังสดาลไนท์) ที่ seed ไว้ก่อนหน้านี้ผิดไปจากของจริง:
// - โซน B คอลัมน์ที่สอง (B2xx) มีแค่ B201, B222, B223 จริง ส่วน B202-B221 (20 แผง) ไม่มีอยู่จริง
//   ถูกแทนที่ด้วยแผง T102-T131 (30 แผง) ซึ่งเป็นแผงของ "โซน T" ที่วางอยู่ในตำแหน่งเดียวกันทางกายภาพ
// - โซน X มีแค่ X101, X102 จริง (ไม่ใช่ X101-X106)
// สคริปต์นี้ idempotent (เช็คก่อนสร้าง/ลบ) ปลอดภัยที่จะรันซ้ำหรือรันกับฐานข้อมูลอื่นที่ seed
// มาจาก prisma/seed-market-structure.js ด้วยข้อมูลผังแบบเดิม
const prisma = require('../../config/prismaClient');

async function main() {
    const zoneT = await prisma.zone.findUnique({ where: { code: 'T' } });
    if (zoneT) {
        console.log('Zone T already exists, skipping (fix already applied).');
        return;
    }

    await prisma.$transaction(async (tx) => {
        // ลบคำขอจองทดสอบที่ผูกกับแผง B219 (ถ้ามี — เป็นข้อมูลทดสอบที่ผูกกับแผงปลอมที่จะถูกลบ)
        const deletedRequest = await tx.bookingRequest.deleteMany({ where: { assignedStallCode: 'B219' } });
        console.log('Deleted BookingRequest(s) pinned to fake B219:', deletedRequest.count);

        // ลบแผง B202-B221 ปลอม (20 แผง)
        const fakeBCodes = [];
        for (let i = 202; i <= 221; i += 1) fakeBCodes.push('B' + i);
        const deletedB = await tx.stall.deleteMany({ where: { stallCode: { in: fakeBCodes } } });
        console.log('Deleted fake B202-B221 stalls:', deletedB.count);

        const rowB2 = await tx.zoneRow.findFirst({ where: { zone: { code: 'B' }, rowCode: 'B2' } });
        if (rowB2) {
            await tx.zoneRow.update({ where: { id: rowB2.id }, data: { stallStartNumber: 201, stallEndNumber: 201 } });
        }

        // เลื่อน displayOrder ของแถวถัดไปในโซน B เพื่อเปิดที่ให้แถวใหม่ B2b
        const laterRows = await tx.zoneRow.findMany({
            where: { zone: { code: 'B' }, rowCode: { in: ['B299', 'B300', 'B3', 'B4', 'B5', 'B6', 'B7'] } }
        });
        for (const row of laterRows) {
            await tx.zoneRow.update({ where: { id: row.id }, data: { displayOrder: row.displayOrder + 1 } });
        }

        // สร้างแถวใหม่ B2b เก็บ B222/B223 แยกจาก B201
        const zoneB = await tx.zone.findUnique({ where: { code: 'B' } });
        const rowB2b = await tx.zoneRow.create({
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
        const movedStalls = await tx.stall.updateMany({
            where: { stallCode: { in: ['B222', 'B223'] } },
            data: { rowId: rowB2b.id }
        });
        console.log('Moved B222/B223 into new ZoneRow B2b:', movedStalls.count);

        // ลบแผง X103-X106 ปลอม (4 แผง)
        const deletedX = await tx.stall.deleteMany({ where: { stallCode: { in: ['X103', 'X104', 'X105', 'X106'] } } });
        console.log('Deleted fake X103-X106 stalls:', deletedX.count);

        const rowX1 = await tx.zoneRow.findFirst({ where: { zone: { code: 'X' } } });
        if (rowX1) {
            await tx.zoneRow.update({ where: { id: rowX1.id }, data: { stallStartNumber: 101, stallEndNumber: 102 } });
        }

        // สร้างโซน T ใหม่ทั้งโซน (T102-T131, 30 แผง)
        const newZoneT = await tx.zone.create({
            data: {
                code: 'T',
                name: 'Zone T',
                productCategory: 'FOOD',
                size: '2x2',
                displayOrder: 8,
                defaultStallWidth: 2,
                defaultStallHeight: 2,
                electricityFee: 15
            }
        });
        const rowT1 = await tx.zoneRow.create({
            data: {
                rowCode: 'T1',
                label: 'Row T1',
                price: 120,
                size: '2x2',
                displayOrder: 1,
                stallStartNumber: 102,
                stallEndNumber: 131,
                zoneId: newZoneT.id
            }
        });
        const tStallsData = [];
        for (let i = 102; i <= 131; i += 1) {
            tStallsData.push({
                stallCode: 'T' + i,
                rowId: rowT1.id,
                isAvailable: true,
                status: 'AVAILABLE',
                width: 2,
                height: 2,
                basePrice: 120,
                displayOrder: i,
                electricFeePerDay: 15
            });
        }
        const createdT = await tx.stall.createMany({ data: tStallsData });
        console.log('Created Zone T with T102-T131 stalls:', createdT.count);
    });

    console.log('Market layout fix applied successfully.');
}

main()
    .catch((error) => {
        console.error('Market layout fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
