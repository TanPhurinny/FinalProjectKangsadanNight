// โซน X ถูก seed ผิดมาตั้งแต่แรกว่าเป็นโซนกิจกรรม/บูธพิเศษ (EVENT_BOOTH) ทั้งที่จริงแล้วเป็นโซนอาหาร
// และผังจริงมีแผง X101-X106 (ไม่ใช่แค่ X101-X102 ตามที่แก้ไว้ใน 2026-07-13-fix-market-layout.js)
// สคริปต์นี้ idempotent (เช็คก่อนสร้าง/แก้) ปลอดภัยที่จะรันซ้ำ
const prisma = require('../../config/prismaClient');

async function main() {
    const zoneX = await prisma.zone.findUnique({ where: { code: 'X' } });
    if (!zoneX) {
        console.log('Zone X not found, skipping.');
        return;
    }

    const foodProductType = await prisma.productType.findUnique({ where: { code: 'FOOD' } });
    if (!foodProductType) {
        throw new Error('ProductType FOOD not found — cannot relink Zone X.');
    }

    await prisma.$transaction(async (tx) => {
        // แก้หมวดหมู่โซน X ให้เป็นอาหาร
        if (zoneX.productCategory !== 'FOOD' || zoneX.description !== 'Food') {
            await tx.zone.update({
                where: { id: zoneX.id },
                data: { productCategory: 'FOOD', description: 'Food' }
            });
            console.log('Updated Zone X productCategory -> FOOD');
        } else {
            console.log('Zone X productCategory already FOOD, skipping.');
        }

        // ลบความเชื่อมโยงกับ EVENT_BOOTH แล้วผูกกับ FOOD แทน
        const removedLinks = await tx.zoneProductType.deleteMany({
            where: { zoneId: zoneX.id, productTypeId: { not: foodProductType.id } }
        });
        console.log('Removed non-FOOD ZoneProductType links for Zone X:', removedLinks.count);

        const existingFoodLink = await tx.zoneProductType.findFirst({
            where: { zoneId: zoneX.id, productTypeId: foodProductType.id }
        });
        if (!existingFoodLink) {
            await tx.zoneProductType.create({ data: { zoneId: zoneX.id, productTypeId: foodProductType.id } });
            console.log('Linked Zone X to ProductType FOOD');
        } else {
            console.log('Zone X already linked to ProductType FOOD, skipping.');
        }

        // ขยายแถว X1 ให้ครอบคลุม X101-X106 (6 แผง) ตามผังจริงที่แก้ไขใหม่
        const rowX1 = await tx.zoneRow.findFirst({ where: { zoneId: zoneX.id, rowCode: 'X1' } });
        if (rowX1 && rowX1.stallEndNumber !== 106) {
            await tx.zoneRow.update({ where: { id: rowX1.id }, data: { stallStartNumber: 101, stallEndNumber: 106 } });
            console.log('Updated ZoneRow X1 range -> 101-106');
        } else {
            console.log('ZoneRow X1 range already 101-106 (or row missing), skipping.');
        }

        if (rowX1) {
            const missingCodes = ['X103', 'X104', 'X105', 'X106'];
            const existingStalls = await tx.stall.findMany({ where: { stallCode: { in: missingCodes } } });
            const existingCodes = new Set(existingStalls.map((s) => s.stallCode));
            const toCreate = missingCodes.filter((code) => !existingCodes.has(code));

            if (toCreate.length) {
                const stallsData = toCreate.map((code) => {
                    const number = Number.parseInt(code.slice(1), 10);
                    return {
                        stallCode: code,
                        rowId: rowX1.id,
                        isAvailable: true,
                        status: 'AVAILABLE',
                        width: zoneX.defaultStallWidth,
                        height: zoneX.defaultStallHeight,
                        basePrice: rowX1.price,
                        extraPrice: 0,
                        displayOrder: number,
                        electricFeePerDay: zoneX.electricityFee
                    };
                });
                const created = await tx.stall.createMany({ data: stallsData });
                console.log('Created missing Zone X stalls:', created.count, toCreate);
            } else {
                console.log('Zone X stalls X103-X106 already exist, skipping.');
            }
        }
    });

    // ตาราง Slot รุ่นเก่า (ใช้โดย /select-zone -> /booking-stall ฝั่ง seller) ไม่เคยมีแผงของโซน X
    // เลย ทำให้จองผ่านฟอร์มนี้ไม่ได้แม้จะเปิดสิทธิ์โซน X ให้ผู้ขายอาหารแล้วก็ตาม สร้างให้ตรงกับ
    // จำนวนแผงจริง X101-X106 (6 แผง) และราคาต่อวันเดียวกับ ZoneRow X1 (300 บาท)
    const existingSlotCount = await prisma.slot.count({ where: { zone: 'X' } });
    if (existingSlotCount === 0) {
        const slotsData = [];
        for (let i = 1; i <= 6; i += 1) {
            slotsData.push({
                slotNumber: `X-${String(i).padStart(2, '0')}`,
                zone: 'X',
                price: 300,
                isAvailable: true
            });
        }
        const createdSlots = await prisma.slot.createMany({ data: slotsData });
        console.log('Created legacy Slot rows for Zone X:', createdSlots.count);
    } else {
        console.log('Zone X already has legacy Slot rows, skipping:', existingSlotCount);
    }

    console.log('Zone X food-category fix applied successfully.');
}

main()
    .catch((error) => {
        console.error('Zone X food-category fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
