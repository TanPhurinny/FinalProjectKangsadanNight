// เติม shopId ให้ BookingRequest / SellerApplication / LeaseContractRequest ที่ยังไม่มี (ข้อมูลก่อนมีระบบหลายร้านต่อผู้ใช้)
// รันซ้ำได้ แตะเฉพาะแถวที่ shopId ยังเป็น null และเจ้าของมีร้านแค่ร้านเดียว (มีหลายร้านแล้ว = ไม่เดาให้ แสดงเป็นรายการให้แก้เอง)
// ต้องรันหลัง migration 20261027200000_multi_shop_per_user และก่อนเปิดใช้โค้ดหลายร้าน ไม่งั้นการอนุมัติใบสมัครเก่า
// ที่ยังไม่ผูกร้านจะสร้างร้านใหม่ซ้ำ (ใบสมัครที่ shopId เป็น null = ใบสมัครเปิดร้านใหม่)
//
//   node scripts/backfill-shop-id.js           dry-run: แสดงว่าจะเติมกี่แถว (ไม่เขียน DB)
//   node scripts/backfill-shop-id.js --apply   เขียนจริง
//
// เจ้าของ: BookingRequest.userId (คำขอเก่าที่ยังไม่มี userId ให้รัน scripts/backfill-booking-request-user.js ก่อน)
const prisma = require('../config/prismaClient');

const TABLES = [
    { key: 'bookingRequest', label: 'คำขอจอง (BookingRequest)', where: { shopId: null, userId: { not: null } } },
    // ใบสมัครทุกสถานะ — ก่อนมีหลายร้าน ใบสมัครทุกใบของผู้ใช้หมายถึงร้านเดียวของเขา
    { key: 'sellerApplication', label: 'ใบสมัครร้าน (SellerApplication)', where: { shopId: null } },
    { key: 'leaseContractRequest', label: 'คำขอสัญญาเช่า (LeaseContractRequest)', where: { shopId: null } }
];

async function main() {
    const apply = process.argv.includes('--apply');

    const shops = await prisma.shopDetail.findMany({ select: { id: true, userId: true }, orderBy: { id: 'asc' } });
    const shopsByUser = new Map();
    shops.forEach((shop) => {
        if (!shopsByUser.has(shop.userId)) shopsByUser.set(shop.userId, []);
        shopsByUser.get(shop.userId).push(shop.id);
    });

    const plans = [];
    for (const table of TABLES) {
        const rows = await prisma[table.key].findMany({ where: table.where, select: { id: true, userId: true } });
        const updates = new Map(); // shopId → [rowId]
        const noShop = [];
        const manyShops = [];
        rows.forEach((row) => {
            const owned = shopsByUser.get(row.userId) || [];
            if (owned.length === 1) {
                if (!updates.has(owned[0])) updates.set(owned[0], []);
                updates.get(owned[0]).push(row.id);
            } else if (!owned.length) {
                noShop.push(row.id);
            } else {
                manyShops.push(row.id);
            }
        });
        const fillCount = [...updates.values()].reduce((sum, ids) => sum + ids.length, 0);
        console.log(`${table.label}: ยังไม่มี shopId ${rows.length} แถว`);
        console.log(`  เติมได้ (เจ้าของมีร้านเดียว): ${fillCount}`);
        console.log(`  เจ้าของยังไม่มีร้าน (ปล่อยไว้ — ใบสมัคร/คำขอของคนที่ยังไม่ได้เป็นร้าน): ${noShop.length}`);
        if (manyShops.length) console.log(`  เจ้าของมีหลายร้านแล้ว ต้องเลือกเอง: #${manyShops.join(', #')}`);
        plans.push({ table, updates });
    }

    if (!apply) {
        console.log('\n(dry-run) ยังไม่ได้เขียน DB — เติม --apply เพื่อเขียนจริง');
        return;
    }

    for (const { table, updates } of plans) {
        for (const [shopId, ids] of updates) {
            await prisma[table.key].updateMany({ where: { id: { in: ids }, shopId: null }, data: { shopId } });
        }
    }
    console.log('\nเติม shopId เรียบร้อย');
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
