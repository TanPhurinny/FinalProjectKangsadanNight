// แก้ขนาดล็อคโซน T ให้ตรงกับผังจริง: 2x3 (ไม่ใช่ 2x2 อย่างที่ seed ไว้ตอนแรก)
// สคริปต์นี้ idempotent ปลอดภัยที่จะรันซ้ำ
const prisma = require('../../config/prismaClient');

async function main() {
    const zoneT = await prisma.zone.findUnique({ where: { code: 'T' } });
    if (!zoneT) {
        console.log('Zone T not found, skipping.');
        return;
    }
    if (zoneT.size === '2x3') {
        console.log('Zone T size already 2x3, skipping (fix already applied).');
        return;
    }

    await prisma.$transaction(async (tx) => {
        await tx.zone.update({ where: { id: zoneT.id }, data: { size: '2x3', defaultStallHeight: 3 } });
        await tx.zoneRow.updateMany({ where: { zoneId: zoneT.id }, data: { size: '2x3' } });
        const updatedStalls = await tx.stall.updateMany({
            where: { row: { zoneId: zoneT.id } },
            data: { height: 3 }
        });
        console.log('Updated Stall height to 3 for Zone T stalls:', updatedStalls.count);
    });

    console.log('Zone T size fix applied successfully.');
}

main()
    .catch((error) => {
        console.error('Zone T size fix failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
