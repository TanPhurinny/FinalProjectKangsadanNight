// อัปเดตขนาด/ราคา/หมวดหมู่โซนตามผังจริงล่าสุด (ยืนยันจากเจ้าของโปรเจกต์):
// A: แฟชั่น 3x3 209 | B: อาหาร 3x3 259 | C: แฟชั่น 3x3 209 | D: ฟู้ดทรัค 4x3 230
// E: แฟชั่น 3x3 209 | F: อาหาร 2x2 219 | X: อาหาร 3x3 259 (เดิม EVENT_BOOTH 4x4 300)
// T: อาหาร 2x3 219 (เดิมราคา 120)
// อัปเดต Zone/ZoneRow/Stall แบบแก้ไขค่าเดิม (ไม่ลบ-สร้างใหม่) เพื่อไม่กระทบ Stall id ที่ผูกกับ Booking เดิม
// สคริปต์นี้ idempotent ปลอดภัยที่จะรันซ้ำ
const prisma = require('../../config/prismaClient');

const UPDATES = {
    A: { size: '3x3', basePrice: 209 },
    D: { description: 'Food Truck', basePrice: 230 },
    E: { size: '3x3', basePrice: 209 },
    F: { size: '2x2', basePrice: 219 },
    X: { productCategory: 'FOOD', description: 'Food', size: '3x3', basePrice: 259 },
    T: { basePrice: 219 }
};

function parseSize(sizeText) {
    const [widthText, heightText] = String(sizeText || '2x2').split('x');
    const width = Number.parseInt(widthText, 10);
    const height = Number.parseInt(heightText, 10);
    return {
        width: Number.isFinite(width) ? width : 2,
        height: Number.isFinite(height) ? height : 2
    };
}

async function main() {
    const foodProductType = await prisma.productType.findUnique({ where: { code: 'FOOD' } });
    if (!foodProductType) {
        throw new Error('ProductType FOOD not found');
    }

    for (const [code, update] of Object.entries(UPDATES)) {
        const zone = await prisma.zone.findUnique({ where: { code }, include: { rows: true } });
        if (!zone) {
            console.log(`Zone ${code} not found, skipping.`);
            continue;
        }

        await prisma.$transaction(async (tx) => {
            const zoneData = {};
            if (update.size) zoneData.size = update.size;
            if (update.productCategory) zoneData.productCategory = update.productCategory;
            if (update.description) zoneData.description = update.description;
            if (update.size) {
                const { width, height } = parseSize(update.size);
                zoneData.defaultStallWidth = width;
                zoneData.defaultStallHeight = height;
            }

            if (Object.keys(zoneData).length) {
                await tx.zone.update({ where: { id: zone.id }, data: zoneData });
            }

            for (const row of zone.rows) {
                const rowData = {};
                if (typeof update.basePrice === 'number') rowData.price = update.basePrice;
                if (update.size) rowData.size = update.size;
                if (Object.keys(rowData).length) {
                    await tx.zoneRow.update({ where: { id: row.id }, data: rowData });
                }

                const stallData = {};
                if (typeof update.basePrice === 'number') stallData.basePrice = update.basePrice;
                if (update.size) {
                    const { width, height } = parseSize(update.size);
                    stallData.width = width;
                    stallData.height = height;
                }
                if (Object.keys(stallData).length) {
                    await tx.stall.updateMany({ where: { rowId: row.id }, data: stallData });
                }
            }

            if (update.productCategory === 'FOOD') {
                await tx.zoneProductType.deleteMany({
                    where: { zoneId: zone.id, productTypeId: { not: foodProductType.id } }
                });
                const existingLink = await tx.zoneProductType.findFirst({
                    where: { zoneId: zone.id, productTypeId: foodProductType.id }
                });
                if (!existingLink) {
                    await tx.zoneProductType.create({ data: { zoneId: zone.id, productTypeId: foodProductType.id } });
                }
            }

            console.log(`Zone ${code} updated:`, update);
        });
    }

    console.log('Zone size/price update applied successfully.');
}

main()
    .catch((error) => {
        console.error('Zone size/price update failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
