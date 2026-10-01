const prisma = require('../config/prismaClient');
const { toStartOfDay } = require('./bookingRound');

// สถานะ "ปิดร้านวันนี้" ของผู้ขาย (ตาราง ShopOpenStatus) — ทุกร้านถือว่าเปิดอยู่เป็นค่าเริ่มต้น
// ผู้ขายกดแค่ "ปิดร้าน" ตอนไม่ได้มาขาย/เก็บร้านแล้ว → สร้างแถวของวันขายนั้นพร้อม closedAt
// วันขายตัดตอนตี 5 (ตลาดกลางคืนขายเลยเที่ยงคืน) — แถวของวันก่อนไม่มีผล ร้านกลับมาเปิดเองวันขายถัดไป
const DAY_CUTOFF_HOUR = 5;

function businessDateOf(now = new Date()) {
    return toStartOfDay(new Date(now.getTime() - DAY_CUTOFF_HOUR * 60 * 60 * 1000));
}

function viewOf(row) {
    const closedAt = row && row.closedAt ? row.closedAt : null;
    return { isOpen: !closedAt, closedAt };
}

async function getOpenStatus(userId, now = new Date()) {
    const row = await prisma.shopOpenStatus.findUnique({
        where: { userId_businessDate: { userId, businessDate: businessDateOf(now) } }
    });
    return viewOf(row);
}

// open=false: ปิดร้านวันนี้ / open=true: ยกเลิกการปิด (กลับเป็นเปิดตามปกติ)
async function setOpenStatus(userId, open, now = new Date()) {
    const businessDate = businessDateOf(now);
    const key = { userId_businessDate: { userId, businessDate } };
    if (open) {
        await prisma.shopOpenStatus.deleteMany({ where: { userId, businessDate } });
        return viewOf(null);
    }
    // openedAt เป็นคอลัมน์เดิมจากตอนออกแบบให้เช็คอินเปิดร้าน — ตอนนี้เก็บแค่เวลาสร้างแถว ไม่ได้ใช้แสดงผล
    const row = await prisma.shopOpenStatus.upsert({
        where: key,
        update: { closedAt: now },
        create: { userId, businessDate, openedAt: now, closedAt: now }
    });
    return viewOf(row);
}

// ร้านที่แจ้งปิดในวันขายนี้: Map userId → closedAt
async function getClosedShopsToday(userIds, now = new Date()) {
    const map = new Map();
    if (!userIds.length) return map;
    const rows = await prisma.shopOpenStatus.findMany({
        where: { userId: { in: userIds }, businessDate: businessDateOf(now), closedAt: { not: null } },
        select: { userId: true, closedAt: true }
    });
    rows.forEach((row) => map.set(row.userId, row.closedAt));
    return map;
}

module.exports = { businessDateOf, getOpenStatus, setOpenStatus, getClosedShopsToday };
