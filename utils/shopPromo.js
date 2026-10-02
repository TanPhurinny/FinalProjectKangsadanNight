const prisma = require('../config/prismaClient');
const { businessDateOf } = require('./shopOpenStatus');

// "โปรวันนี้" ของร้าน — ข้อความสั้น 1 อันต่อวันขาย (ตัดวันตอนตี 5 เหมือนปิดร้าน) หมดอายุเองวันขายถัดไป
const PROMO_MAX_LENGTH = 80;

function cleanPromoText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, PROMO_MAX_LENGTH);
}

async function getPromo(userId, now = new Date()) {
    const row = await prisma.shopPromo.findUnique({
        where: { userId_businessDate: { userId, businessDate: businessDateOf(now) } },
        select: { text: true, updatedAt: true }
    });
    return row || null;
}

// ข้อความว่าง = ลบโปรของวันนี้
async function setPromo(userId, text, now = new Date()) {
    const businessDate = businessDateOf(now);
    const clean = cleanPromoText(text);
    if (!clean) {
        await prisma.shopPromo.deleteMany({ where: { userId, businessDate } });
        return null;
    }
    return prisma.shopPromo.upsert({
        where: { userId_businessDate: { userId, businessDate } },
        update: { text: clean },
        create: { userId, businessDate, text: clean },
        select: { text: true, updatedAt: true }
    });
}

// โปรของวันขายนี้หลายร้านพร้อมกัน (ผังตลาด): Map userId → text
async function getPromosToday(userIds, now = new Date()) {
    const map = new Map();
    if (!userIds.length) return map;
    const rows = await prisma.shopPromo.findMany({
        where: { userId: { in: userIds }, businessDate: businessDateOf(now) },
        select: { userId: true, text: true }
    });
    rows.forEach((row) => map.set(row.userId, row.text));
    return map;
}

module.exports = { PROMO_MAX_LENGTH, getPromo, setPromo, getPromosToday };
