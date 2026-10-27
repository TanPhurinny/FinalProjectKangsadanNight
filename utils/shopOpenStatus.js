const prisma = require('../config/prismaClient');
const { toStartOfDay } = require('./bookingRound');

// สถานะ "ปิดร้านวันนี้" แยกต่อร้าน (ตาราง ShopOpenStatus) — ทุกร้านถือว่าเปิดอยู่เป็นค่าเริ่มต้น
// ผู้ขายกดแค่ "ปิดร้าน" ตอนไม่ได้มาขาย/เก็บร้านแล้ว → สร้างแถวของร้านนั้นในวันขายนั้นพร้อม closedAt
// วันขายตัดตอนตี 5 (ตลาดกลางคืนขายเลยเที่ยงคืน) — แถวของวันก่อนไม่มีผล ร้านกลับมาเปิดเองวันขายถัดไป
// แถวที่ shopId เป็น null (โค้ดเก่าก่อนแยกร้าน) ถือเป็นของร้านหลักของ userId
const DAY_CUTOFF_HOUR = 5;

function businessDateOf(now = new Date()) {
    return toStartOfDay(new Date(now.getTime() - DAY_CUTOFF_HOUR * 60 * 60 * 1000));
}

function viewOf(row) {
    const closedAt = row && row.closedAt ? row.closedAt : null;
    return { isOpen: !closedAt, closedAt };
}

// ร้านหลัก (id น้อยสุด) ของแต่ละผู้ใช้ — ใช้แปลงแถวเก่าที่ไม่มี shopId
async function primaryShopIdByUser(userIds) {
    const map = new Map();
    if (!userIds.length) return map;
    const shops = await prisma.shopDetail.findMany({ where: { userId: { in: userIds } }, orderBy: { id: 'asc' }, select: { id: true, userId: true } });
    shops.forEach((s) => { if (!map.has(s.userId)) map.set(s.userId, s.id); });
    return map;
}

// ร้านที่แจ้งปิดในวันขายนี้: Map shopId → closedAt
async function getClosedShopsToday(shopIds, now = new Date()) {
    const map = new Map();
    const ids = [...new Set((shopIds || []).filter(Boolean))];
    if (!ids.length) return map;
    const businessDate = businessDateOf(now);
    const rows = await prisma.shopOpenStatus.findMany({
        where: { businessDate, closedAt: { not: null }, OR: [{ shopId: { in: ids } }, { shopId: null }] },
        select: { userId: true, shopId: true, closedAt: true }
    });
    const legacy = rows.filter((row) => !row.shopId);
    const primaryByUser = await primaryShopIdByUser([...new Set(legacy.map((row) => row.userId))]);
    const wanted = new Set(ids);
    rows.forEach((row) => {
        const shopId = row.shopId || primaryByUser.get(row.userId);
        if (shopId && wanted.has(shopId) && !map.has(shopId)) map.set(shopId, row.closedAt);
    });
    return map;
}

async function getOpenStatus(shopId, now = new Date()) {
    if (!shopId) return viewOf(null);
    const closed = await getClosedShopsToday([shopId], now);
    return viewOf(closed.has(shopId) ? { closedAt: closed.get(shopId) } : null);
}

// open=false: ปิดร้านวันนี้ / open=true: ยกเลิกการปิด (กลับเป็นเปิดตามปกติ)
// shop ต้องเป็นร้านของผู้ใช้แล้ว (ผู้เรียกตรวจด้วย resolveShopForUser)
async function setOpenStatus(shop, open, now = new Date()) {
    const businessDate = businessDateOf(now);
    if (open) {
        await prisma.shopOpenStatus.deleteMany({ where: { businessDate, shopId: shop.id } });
        // แถวเก่าที่ไม่มี shopId เป็นของร้านหลัก — ลบทิ้งด้วยถ้าร้านนี้คือร้านหลัก
        const primary = (await primaryShopIdByUser([shop.userId])).get(shop.userId);
        if (primary === shop.id) await prisma.shopOpenStatus.deleteMany({ where: { businessDate, userId: shop.userId, shopId: null } });
        return viewOf(null);
    }
    // openedAt เป็นคอลัมน์เดิมจากตอนออกแบบให้เช็คอินเปิดร้าน — ตอนนี้เก็บแค่เวลาสร้างแถว ไม่ได้ใช้แสดงผล
    const row = await prisma.shopOpenStatus.upsert({
        where: { shopId_businessDate: { shopId: shop.id, businessDate } },
        update: { closedAt: now },
        create: { userId: shop.userId, shopId: shop.id, businessDate, openedAt: now, closedAt: now }
    });
    return viewOf(row);
}

module.exports = { businessDateOf, getOpenStatus, setOpenStatus, getClosedShopsToday };
