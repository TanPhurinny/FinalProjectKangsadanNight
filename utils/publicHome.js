const prisma = require('../config/prismaClient');
const { getStallOwnerIndex } = require('./shopViews');
const { getClosedShopsToday, businessDateOf } = require('./shopOpenStatus');
const { getRoundTimeline } = require('./bookingRound');
const { getApprovedOnDay } = require('./stallLeave');

// ข้อมูลหน้าแรกสาธารณะ (/) สำหรับคนที่ยังไม่ล็อกอิน: จำนวนร้านคืนนี้ + รอบจองถัดไป
// ตัวเลขเป็นยอดรวมทั้งตลาดเท่านั้น ไม่บอกล็อกว่าง/วันหมดสัญญา/ราคาแผง (ข้อมูลภายใน ดู getMarketMapPage)
// ร้าน = ร้านของล็อก (ร้านหลายล็อกนับ 1) ที่สัญญาครอบคลุมวันขายนี้ ไม่นับบูธกิจกรรมโซน G
// เปิดคืนนี้ = ร้านเหล่านั้นที่ไม่ได้กด "ปิดร้านวันนี้" (ทุกร้านเปิดเป็นค่าเริ่มต้น — utils/shopOpenStatus.js) และไม่ได้ลาหยุดทุกแผง
async function buildPublicHome(now = new Date()) {
    const businessDate = businessDateOf(now);
    const dayEnd = new Date(businessDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [stalls, ownerByCode] = await Promise.all([
        prisma.stall.findMany({
            where: {
                status: 'BOOKED',
                bookingEndDate: { gte: businessDate },
                OR: [{ bookingStartDate: null }, { bookingStartDate: { lt: dayEnd } }],
                row: { zone: { productCategory: { not: 'EVENT_BOOTH' } } }
            },
            select: { stallCode: true }
        }),
        getStallOwnerIndex()
    ]);

    // นับต่อร้าน (ผู้ใช้ 1 คนมีหลายร้านได้ ร้านเดียวหลายล็อกนับ 1)
    const shopKeys = new Set();
    const shopIds = new Set();
    stalls.forEach((stall) => {
        const owner = ownerByCode.get(String(stall.stallCode).toUpperCase());
        if (owner && owner.shopId) {
            shopKeys.add(`h${owner.shopId}`);
            shopIds.add(owner.shopId);
        } else {
            shopKeys.add(`s${stall.stallCode}`);
        }
    });
    const [closed, leaves] = await Promise.all([getClosedShopsToday([...shopIds], now), getApprovedOnDay(businessDate)]);
    // ร้านที่ลาหยุดทุกแผงวันนี้ (อนุมัติแล้ว) นับเป็นปิด — แผงที่ให้เช่าช่วงยังมีคนขาย นับเป็นเปิด
    const stallsByShop = new Map();
    stalls.forEach((stall) => {
        const owner = ownerByCode.get(String(stall.stallCode).toUpperCase());
        if (!owner || !owner.shopId) return;
        if (!stallsByShop.has(owner.shopId)) stallsByShop.set(owner.shopId, []);
        stallsByShop.get(owner.shopId).push(String(stall.stallCode).toUpperCase());
    });
    stallsByShop.forEach((codes, shopId) => {
        if (codes.every((code) => leaves.get(code)?.kind === 'LEAVE')) closed.set(shopId, true);
    });

    return {
        shopCount: shopKeys.size,
        openCount: shopKeys.size - closed.size,
        roundTimeline: getRoundTimeline(now)
    };
}

module.exports = { buildPublicHome };
