const prisma = require('../config/prismaClient');
const { getStallOwnerIndex } = require('./shopViews');
const { getClosedShopsToday, businessDateOf } = require('./shopOpenStatus');
const { getRoundTimeline } = require('./bookingRound');

// ข้อมูลหน้าแรกสาธารณะ (/) สำหรับคนที่ยังไม่ล็อกอิน: จำนวนร้านคืนนี้ + รอบจองถัดไป
// ตัวเลขเป็นยอดรวมทั้งตลาดเท่านั้น ไม่บอกล็อกว่าง/วันหมดสัญญา/ราคาแผง (ข้อมูลภายใน ดู getMarketMapPage)
// ร้าน = เจ้าของล็อก (ร้านหลายล็อกนับ 1) ที่สัญญาครอบคลุมวันขายนี้ ไม่นับบูธกิจกรรมโซน G
// เปิดคืนนี้ = ร้านเหล่านั้นที่ไม่ได้กด "ปิดร้านวันนี้" (ทุกร้านเปิดเป็นค่าเริ่มต้น — utils/shopOpenStatus.js)
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

    const shopKeys = new Set();
    const ownerIds = new Set();
    stalls.forEach((stall) => {
        const owner = ownerByCode.get(String(stall.stallCode).toUpperCase());
        if (owner && owner.userId) {
            shopKeys.add(`u${owner.userId}`);
            ownerIds.add(owner.userId);
        } else {
            shopKeys.add(`s${stall.stallCode}`);
        }
    });
    const closed = await getClosedShopsToday([...ownerIds], now);

    return {
        shopCount: shopKeys.size,
        openCount: shopKeys.size - closed.size,
        roundTimeline: getRoundTimeline(now)
    };
}

module.exports = { buildPublicHome };
