const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays } = require('./bookingRound');

// สถิติการเปิดดูร้านจากผังตลาด (ตาราง ShopViewEvent) — ใช้ทั้งหน้าร้านค้าของฉันและการ์ดล็อกของผู้ขายบนผัง
const VIEW_KINDS = ['card', 'menu', 'share'];

// ผังตลาดหา "ล็อกนี้เป็นร้านของใคร" ทุกครั้งที่มีคนเปิดการ์ด — แคชไว้สั้นๆ ไม่ query ซ้ำทุก event
const OWNER_CACHE_MS = 60 * 1000;
let ownerCache = { at: 0, byCode: new Map() };

async function getStallOwnerIndex() {
    if (Date.now() - ownerCache.at < OWNER_CACHE_MS) return ownerCache.byCode;
    const requests = await prisma.bookingRequest.findMany({
        where: { status: { in: ['APPROVED', 'IN_PROGRESS', 'SUCCESS'] }, assignedStallCode: { not: null } },
        select: { assignedStallCode: true, sellerName: true, productName: true, seller: { select: { shopName: true } } }
    });
    const names = [...new Set(requests.map((r) => r.sellerName).filter(Boolean))];
    const users = names.length
        ? await prisma.user.findMany({ where: { role: 'SELLER', name: { in: names } }, select: { id: true, name: true } })
        : [];
    const userIdByName = new Map(users.map((u) => [u.name, u.id]));
    const byCode = new Map();
    requests.forEach((request) => {
        const userId = userIdByName.get(request.sellerName);
        String(request.assignedStallCode || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean).forEach((code) => {
            byCode.set(code, {
                userId: userId || null,
                shopName: request.seller?.shopName || request.productName || '-'
            });
        });
    });
    ownerCache = { at: Date.now(), byCode };
    return byCode;
}

async function recordShopView(stallCode, kind, viewerUserId) {
    if (!VIEW_KINDS.includes(kind)) return false;
    const owner = (await getStallOwnerIndex()).get(String(stallCode || '').trim().toUpperCase());
    // ไม่นับเจ้าของร้านเปิดดูร้านตัวเอง
    if (!owner || !owner.userId || owner.userId === viewerUserId) return false;
    await prisma.shopViewEvent.create({ data: { shopUserId: owner.userId, stallCode: String(stallCode).toUpperCase(), kind } });
    return true;
}

// สรุป 7 วันล่าสุด: ยอดรวมแต่ละประเภท + รายวัน (เก่า → ใหม่) สำหรับแท่งเล็กๆ ในหน้าร้านค้าของฉัน
async function getShopViewStats(shopUserId, days = 7) {
    const since = addDays(toStartOfDay(new Date()), -(days - 1));
    const events = await prisma.shopViewEvent.findMany({
        where: { shopUserId, createdAt: { gte: since } },
        select: { kind: true, createdAt: true }
    });
    const totals = { card: 0, menu: 0, share: 0 };
    const daily = Array.from({ length: days }, (_, i) => ({ date: addDays(since, i), card: 0 }));
    events.forEach((event) => {
        totals[event.kind] = (totals[event.kind] || 0) + 1;
        if (event.kind !== 'card') return;
        const idx = Math.floor((toStartOfDay(event.createdAt) - since) / (24 * 60 * 60 * 1000));
        if (daily[idx]) daily[idx].card += 1;
    });
    return { days, totals, daily };
}

module.exports = { getStallOwnerIndex, recordShopView, getShopViewStats, VIEW_KINDS };
