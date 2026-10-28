// จำนวนแผงสูงสุดที่ 1 ร้านจองได้ต่อรอบ (รวมทุกโซน) กันร้านเดียวกวาดหลายล็อกแล้วปล่อยเช่าต่อ
// นับต่อร้าน (ShopDetail) ไม่ใช่ต่อผู้ใช้ — 1 ผู้ใช้มีได้หลายร้าน แต่ละร้านมีโควตาของตัวเอง
// โควตาของร้าน = ShopDetail.maxStallsPerRound ที่แอดมินตั้งเฉพาะร้าน ถ้าไม่ได้ตั้ง (null) ใช้ค่ากลางในตาราง AppSetting
// ทั้งสองค่าแอดมินแก้ได้ที่ /admin/stall-quota — ร้านแฟชั่นยังไม่ถูกบล็อกตอนจอง (แอดมินใช้ดุลยพินิจตอนจัดล็อก)
const prisma = require('../config/prismaClient');
const { BOOKING_REQUEST_TAG_PREFIX, extractBookingRequestId } = require('./bookingRequestTag');
const { getPrimaryShop } = require('./shops');

const SETTING_KEY = 'stallQuota';
const DEFAULT_SETTINGS = { defaultMaxStalls: 2 };
const MIN_STALLS = 1;
const MAX_STALLS = 20;
const CACHE_MS = 60 * 1000;

let cache = null;
let cachedAt = 0;

// ตรวจจำนวนแผง (จากฟอร์มหรือ DB) — คืน { value } หรือ { error } เป็นข้อความไทย
function normalizeStallLimit(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < MIN_STALLS || value > MAX_STALLS) {
        return { error: `จำนวนแผงต้องเป็นจำนวนเต็ม ${MIN_STALLS}–${MAX_STALLS}` };
    }
    return { value };
}

async function getStallQuotaSettings() {
    if (cache && Date.now() - cachedAt < CACHE_MS) return cache;
    let settings = { ...DEFAULT_SETTINGS };
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
        if (row) {
            const parsed = normalizeStallLimit(JSON.parse(row.value)?.defaultMaxStalls);
            if (parsed.value) settings = { defaultMaxStalls: parsed.value, updatedAt: row.updatedAt, updatedByName: row.updatedByName };
        }
    } catch (error) {
        // อ่านค่าไม่ได้ ใช้ค่าเริ่มต้นไปก่อน ไม่ให้การจองพัง
        console.error('Stall quota settings read error:', error.message);
    }
    cache = settings;
    cachedAt = Date.now();
    return settings;
}

async function saveStallQuotaSettings(raw, actorName) {
    const parsed = normalizeStallLimit(raw?.defaultMaxStalls);
    if (parsed.error) return parsed;
    const value = JSON.stringify({ defaultMaxStalls: parsed.value });
    await prisma.appSetting.upsert({
        where: { key: SETTING_KEY },
        create: { key: SETTING_KEY, value, updatedByName: actorName || null },
        update: { value, updatedByName: actorName || null }
    });
    cache = null;
    return { settings: { defaultMaxStalls: parsed.value } };
}

// ค่าเฉพาะร้าน: ว่าง = กลับไปใช้ค่ากลาง (เก็บ null)
async function saveShopStallLimit(shopId, raw) {
    const text = String(raw ?? '').trim();
    let value = null;
    if (text) {
        const parsed = normalizeStallLimit(text);
        if (parsed.error) return parsed;
        value = parsed.value;
    }
    const shop = await prisma.shopDetail.update({
        where: { id: Number(shopId) },
        data: { maxStallsPerRound: value },
        select: { id: true, shopName: true, maxStallsPerRound: true }
    });
    return { shop };
}

function getShopQuota(shop, settings = DEFAULT_SETTINGS) {
    return shop?.maxStallsPerRound ?? settings.defaultMaxStalls;
}

// นับแผงที่ร้านนี้จองไว้แล้วในรอบ (Booking 1 แถว = 1 แผง, ไม่นับ REJECTED)
// Booking ไม่มี shopId — ดูร้านจากคำขอที่แท็กไว้ใน storeDetailSnapshot; คำขอเก่าที่ shopId = null
// หรือ Booking ที่ไม่มีแท็กคำขอ นับเป็นของร้านหลักของผู้ใช้
async function countShopStallsInRound(userId, shopId, round) {
    const bookings = await prisma.booking.findMany({
        where: {
            userId: Number(userId),
            status: { not: 'REJECTED' },
            rentalStartDate: { gte: round.cycleStart, lte: round.cycleEnd }
        },
        select: { storeDetailSnapshot: true }
    });
    if (!bookings.length) return 0;
    // ยังไม่มีร้าน (ใบสมัครรออนุมัติ) — นับทุกแถวของผู้ใช้เหมือนเดิม
    if (!shopId) return bookings.length;

    const requestIds = Array.from(new Set(bookings
        .map((booking) => (String(booking.storeDetailSnapshot || '').startsWith(BOOKING_REQUEST_TAG_PREFIX)
            ? extractBookingRequestId(booking.storeDetailSnapshot)
            : null))
        .filter(Boolean)));
    const [requests, primary] = await Promise.all([
        requestIds.length
            ? prisma.bookingRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, shopId: true } })
            : [],
        getPrimaryShop(Number(userId), { select: { id: true } })
    ]);
    const primaryId = primary?.id || null;
    const shopByRequest = new Map(requests.map((request) => [request.id, request.shopId || primaryId]));

    const target = Number(shopId);
    return bookings.filter((booking) => {
        const requestId = String(booking.storeDetailSnapshot || '').startsWith(BOOKING_REQUEST_TAG_PREFIX)
            ? extractBookingRequestId(booking.storeDetailSnapshot)
            : null;
        const owner = requestId && shopByRequest.has(requestId) ? shopByRequest.get(requestId) : primaryId;
        return owner === target;
    }).length;
}

module.exports = {
    DEFAULT_SETTINGS,
    MIN_STALLS,
    MAX_STALLS,
    getStallQuotaSettings,
    saveStallQuotaSettings,
    saveShopStallLimit,
    getShopQuota,
    countShopStallsInRound
};
