// เพิ่มโซน G "โซนกิจกรรม" (EVENT_BOOTH) 2 บูธตามผังจริง:
//   G101 = จุดที่ 1 พื้นที่ว่างใต้แถว F1xx/F2xx (ต่อจากช่อง x ใต้ F117/F217)
//   G201 = จุดที่ 2 พื้นที่ว่างใต้แถว F5xx/F6xx (ใต้ F536/F636) ติดแถว B123/B223 เหนือห้องน้ำ/ออฟฟิศ
// ราคา 490 บาท/วัน (ยืนยันจากเจ้าของโปรเจกต์) — ราคาจริงตอนจองคิดจาก utils/eventBooth.js
// upsert อย่างเดียว ไม่ลบ/แก้ล็อกของโซนอื่น — idempotent รันซ้ำได้ไม่สร้างข้อมูลซ้ำ
// (ห้ามใช้ prisma/seed-market-structure.js กับ DB กลาง เพราะ seed ลบ ZoneRow/Stall ทิ้งแล้วสร้างใหม่ทั้งหมด)
const prisma = require('../../config/prismaClient');

const ZONE = {
    code: 'G',
    name: 'โซนกิจกรรม',
    description: 'Event Booth',
    productCategory: 'EVENT_BOOTH',
    size: '3x3',
    displayOrder: 9,
    price: 490
};

const ROWS = [
    { rowCode: 'G1', label: 'จุดที่ 1 ใต้ F1/F2', number: 101, displayOrder: 1 },
    { rowCode: 'G2', label: 'จุดที่ 2 ใต้ F5/F6 ติดโซน B', number: 201, displayOrder: 2 }
];

async function main() {
    const [width, height] = ZONE.size.split('x').map(Number);

    const productType = await prisma.productType.upsert({
        where: { code: 'EVENT_BOOTH' },
        update: { isActive: true },
        create: { code: 'EVENT_BOOTH', name: 'Event Booth', displayOrder: 3, isActive: true }
    });

    const zoneData = {
        name: ZONE.name,
        description: ZONE.description,
        productCategory: ZONE.productCategory,
        size: ZONE.size,
        displayOrder: ZONE.displayOrder,
        defaultStallWidth: width,
        defaultStallHeight: height,
        electricityFee: 0
    };
    const zone = await prisma.zone.upsert({
        where: { code: ZONE.code },
        update: zoneData,
        create: { code: ZONE.code, ...zoneData }
    });

    await prisma.zoneProductType.upsert({
        where: { zoneId_productTypeId: { zoneId: zone.id, productTypeId: productType.id } },
        update: {},
        create: { zoneId: zone.id, productTypeId: productType.id }
    });

    for (const rowDef of ROWS) {
        const rowData = {
            label: rowDef.label,
            price: ZONE.price,
            size: ZONE.size,
            displayOrder: rowDef.displayOrder,
            stallStartNumber: rowDef.number,
            stallEndNumber: rowDef.number
        };
        const row = await prisma.zoneRow.upsert({
            where: { zoneId_rowCode: { zoneId: zone.id, rowCode: rowDef.rowCode } },
            update: rowData,
            create: { zoneId: zone.id, rowCode: rowDef.rowCode, ...rowData }
        });

        const stallCode = `${ZONE.code}${rowDef.number}`;
        // บูธที่มีอยู่แล้ว: แก้แค่ตำแหน่ง/ราคา ไม่แตะสถานะ (อาจถูกตั้งซ่อมบำรุงไว้)
        await prisma.stall.upsert({
            where: { stallCode },
            update: { rowId: row.id, width, height, basePrice: ZONE.price, displayOrder: rowDef.number, electricFeePerDay: 0 },
            create: {
                stallCode,
                rowId: row.id,
                isAvailable: true,
                status: 'AVAILABLE',
                width,
                height,
                basePrice: ZONE.price,
                extraPrice: 0,
                displayOrder: rowDef.number,
                electricFeePerDay: 0
            }
        });
        console.log(`  ${stallCode} พร้อมใช้งาน (แถว ${rowDef.rowCode})`);
    }

    const total = await prisma.stall.count({ where: { row: { zoneId: zone.id } } });
    console.log(`โซน ${ZONE.code} มีบูธทั้งหมด ${total} บูธ`);
}

main()
    .catch((error) => {
        console.error('เพิ่มโซน G ไม่สำเร็จ', error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
