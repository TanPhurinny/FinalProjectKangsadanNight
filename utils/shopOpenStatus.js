const prisma = require('../config/prismaClient');
const { toStartOfDay } = require('./bookingRound');

// เช็คอิน "ร้านเปิดแล้ว" — 1 แถวต่อผู้ขายต่อวันขาย (ตาราง ShopOpenStatus)
// วันขายตัดตอนตี 5: ตลาดกลางคืนขายเลยเที่ยงคืน เปิดร้าน 18:00 แล้วตี 1 ยังนับเป็นวันขายเดียวกัน
const DAY_CUTOFF_HOUR = 5;

function businessDateOf(now = new Date()) {
    return toStartOfDay(new Date(now.getTime() - DAY_CUTOFF_HOUR * 60 * 60 * 1000));
}

function viewOf(row) {
    return {
        isOpen: !!(row && !row.closedAt),
        openedAt: row ? row.openedAt : null,
        closedAt: row ? row.closedAt : null
    };
}

async function getOpenStatus(userId, now = new Date()) {
    const row = await prisma.shopOpenStatus.findUnique({
        where: { userId_businessDate: { userId, businessDate: businessDateOf(now) } }
    });
    return viewOf(row);
}

// เปิด: สร้าง/เปิดใหม่ (กดเปิดซ้ำหลังปิด = เริ่มนับเวลาเปิดใหม่) / ปิด: ตั้ง closedAt ถ้าเปิดอยู่
async function setOpenStatus(userId, open, now = new Date()) {
    const businessDate = businessDateOf(now);
    const key = { userId_businessDate: { userId, businessDate } };
    if (open) {
        const row = await prisma.shopOpenStatus.upsert({
            where: key,
            update: { openedAt: now, closedAt: null },
            create: { userId, businessDate, openedAt: now }
        });
        return viewOf(row);
    }
    const existing = await prisma.shopOpenStatus.findUnique({ where: key });
    if (!existing || existing.closedAt) return viewOf(existing);
    return viewOf(await prisma.shopOpenStatus.update({ where: key, data: { closedAt: now } }));
}

// ร้านที่เปิดอยู่ตอนนี้ (วันขายนี้ ยังไม่กดปิด): Map userId → openedAt
async function getOpenShopsNow(userIds, now = new Date()) {
    const map = new Map();
    if (!userIds.length) return map;
    const rows = await prisma.shopOpenStatus.findMany({
        where: { userId: { in: userIds }, businessDate: businessDateOf(now), closedAt: null },
        select: { userId: true, openedAt: true }
    });
    rows.forEach((row) => map.set(row.userId, row.openedAt));
    return map;
}

module.exports = { businessDateOf, getOpenStatus, setOpenStatus, getOpenShopsNow };
