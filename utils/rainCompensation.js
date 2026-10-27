// ระบบชดเชยกรณีฝนตก — กติกาทั้งหมดอยู่ที่ไฟล์นี้
// - แอดมินเป็นคนประกาศ "วันฝนตก" เอง (ฝนตกต่อเนื่องช่วง 17:00–20:00 จนค้าขายไม่ได้ ใช้ดุลยพินิจ ระบบไม่ตัดสินเอง)
// - ได้ชดเชย 50–100% ของค่าเช่าล็อกวันนั้น (ค่าเช่าอย่างเดียว ไม่รวมค่าไฟ/เครื่องใช้ไฟฟ้า) ปัดเศษขึ้นเป็นบาทเต็ม
// - ผู้ขายเห็นผลตั้งแต่ announceAt (ค่าเริ่มต้น 21:30 ของวันนั้น) — ไม่ต้องมี job ตั้งเวลา กรองตอนอ่านแทน
// - ให้เฉพาะเจ้าของคำขอจองที่ชำระเงินแล้ว (Booking SUCCESS ครอบวันนั้น) ผูกกับบัญชีผู้ขาย โอนให้คนอื่นไม่ได้
//   ร้านที่กด "ปิดร้านวันนี้" (ShopOpenStatus) ไม่ได้โดยค่าเริ่มต้น แต่แอดมินติ๊กเพิ่มกลับได้ตอนดูรายชื่อ
// - หมดอายุ 45 วันนับจากวันที่ได้รับ, ถือเครดิตที่ยังใช้ได้พร้อมกันไม่เกิน 5 ครั้ง (ครั้งที่ 6 บันทึกเป็น SKIPPED_CAP)
// - ใช้เป็นส่วนลดของการจองครั้งถัดไป (คำขอที่จัดล็อกแล้ว ยังไม่ส่งสลิป) ต้องใช้ทั้งหมดในครั้งเดียว
//   ส่วนที่เกินยอดจะหายไป ไม่สะสม และแลกเป็นเงินสดไม่ได้
// - คำขอที่ใช้ส่วนลดไปแล้วถูกปฏิเสธ/ยกเลิก → เครดิตกลับมาใช้ได้ (วันหมดอายุเดิม) ดู releaseCreditsOfRejectedRequests
const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays } = require('./bookingRound');
const { isDateHoliday } = require('./bookingHolidays');
const { extractBookingRequestId } = require('./bookingRequestTag');
const { isEventBoothCode } = require('./eventBooth');

const MIN_PERCENT = 50;
const MAX_PERCENT = 100;
const EXPIRY_DAYS = 45;
const MAX_ACTIVE_CREDITS = 5;
const ANNOUNCE_HOUR = 21;
const ANNOUNCE_MINUTE = 30;
// ประกาศย้อนหลังได้ไม่เกินนี้ (กันกดผิดวัน)
const MAX_PAST_DAYS = 7;
// เตือนผู้ขายเมื่อเครดิตเหลืออายุไม่เกินนี้
const EXPIRY_WARN_DAYS = 7;

// % ชดเชยเป็นทีละ 10 เท่านั้น (50, 60, ... 100) ตรงกับตัวเลือกในหน้าแอดมิน — ค่าอื่นปัดเข้าหลักสิบที่ใกล้ที่สุด
function clampPercent(value, fallback = MAX_PERCENT) {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n)) return fallback;
    return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(n / 10) * 10));
}

function creditAmount(baseRent, percent) {
    return Math.ceil((Number(baseRent) || 0) * percent / 100);
}

function defaultAnnounceAt(date) {
    const at = new Date(toStartOfDay(date));
    at.setHours(ANNOUNCE_HOUR, ANNOUNCE_MINUTE, 0, 0);
    return at;
}

// หมดอายุสิ้นวันที่ 45 นับจากวันที่ได้รับ (วันที่ประกาศผล)
function computeExpiresAt(announceAt) {
    const end = addDays(toStartOfDay(announceAt), EXPIRY_DAYS);
    end.setHours(23, 59, 59, 999);
    return end;
}

function parseDateKey(raw) {
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = toStartOfDay(`${raw}T00:00:00`);
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

// คำขอที่ใช้ส่วนลดไปแล้วแต่ถูกปฏิเสธ/ยกเลิกทีหลัง → คืนเครดิต (คงวันหมดอายุเดิม)
// ทำตอนอ่านทุกครั้งแทนการไปแก้ทุกจุดที่ตั้งคำขอเป็น REJECTED
async function releaseCreditsOfRejectedRequests(userId = null) {
    const used = await prisma.rainCredit.findMany({
        where: { status: 'USED', usedOnRequestId: { not: null }, ...(userId ? { userId } : {}) },
        select: { id: true, usedOnRequestId: true }
    });
    if (!used.length) return 0;
    const rejected = await prisma.bookingRequest.findMany({
        where: { id: { in: [...new Set(used.map((c) => c.usedOnRequestId))] }, status: 'REJECTED' },
        select: { id: true }
    });
    if (!rejected.length) return 0;
    const rejectedIds = rejected.map((r) => r.id);
    await prisma.$transaction([
        prisma.rainCredit.updateMany({
            where: { status: 'USED', usedOnRequestId: { in: rejectedIds } },
            data: { status: 'ACTIVE', usedOnRequestId: null, usedAt: null }
        }),
        prisma.bookingRequest.updateMany({
            where: { id: { in: rejectedIds } },
            data: { rainDiscount: null, rainDiscountForfeit: null }
        })
    ]);
    return rejectedIds.length;
}

// จำนวนเครดิตที่ยังใช้ได้ของแต่ละคน (นับรวมที่ยังไม่ถึงเวลาประกาศด้วย) ใช้ตัดสินเพดาน 5 ครั้ง
async function countActiveCredits(userIds, now = new Date()) {
    const map = new Map();
    if (!userIds.length) return map;
    const rows = await prisma.rainCredit.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, status: 'ACTIVE', expiresAt: { gt: now } },
        _count: { _all: true }
    });
    rows.forEach((row) => map.set(row.userId, row._count._all));
    return map;
}

// ร้านที่มีสิทธิ์ได้ชดเชยในวันนั้น: Booking ที่ชำระแล้ว (SUCCESS) ครอบวันนั้น รวมต่อบัญชีผู้ขาย
// Booking 1 แถว = 1 ล็อก (dailyStallPrice คือราคาต่อล็อกต่อวัน) — rentTotal/grandTotal เป็นยอดทั้งคำขอซ้ำทุกแถว ห้ามใช้
async function findEligibleShops(date, now = new Date()) {
    const day = toStartOfDay(date);
    const dayEnd = new Date(addDays(day, 1).getTime() - 1);
    const bookings = await prisma.booking.findMany({
        where: { status: 'SUCCESS', rentalStartDate: { lte: dayEnd }, rentalEndDate: { gte: day } },
        select: {
            id: true, userId: true, dailyStallPrice: true, storeDetailSnapshot: true,
            slot: { select: { slotNumber: true } },
            user: { select: { name: true, username: true, shop: { select: { shopName: true } } } }
        },
        orderBy: { id: 'desc' }
    });

    const byUser = new Map();
    bookings.forEach((booking) => {
        const code = String(booking.slot?.slotNumber || '').toUpperCase();
        if (!code || isEventBoothCode(code)) return;
        let shop = byUser.get(booking.userId);
        if (!shop) {
            shop = {
                userId: booking.userId,
                name: booking.user?.name || booking.user?.username || '-',
                shopName: booking.user?.shop?.shopName || null,
                stalls: new Map(),
                sourceRequestId: extractBookingRequestId(booking.storeDetailSnapshot)
            };
            byUser.set(booking.userId, shop);
        }
        // ล็อกเดียวกันมีหลายแถวทับวันเดียวกัน (ข้อมูลค้าง) นับครั้งเดียว ใช้แถวล่าสุด
        if (!shop.stalls.has(code)) shop.stalls.set(code, Number(booking.dailyStallPrice || 0));
    });

    const userIds = [...byUser.keys()];
    const [closedRows, activeCounts] = await Promise.all([
        userIds.length
            ? prisma.shopOpenStatus.findMany({
                where: { userId: { in: userIds }, businessDate: day, closedAt: { not: null } },
                select: { userId: true }
            })
            : [],
        countActiveCredits(userIds, now)
    ]);
    const closedSet = new Set(closedRows.map((row) => row.userId));

    return [...byUser.values()]
        .map((shop) => {
            const stallCodes = [...shop.stalls.keys()].sort();
            const baseRent = [...shop.stalls.values()].reduce((sum, price) => sum + price, 0);
            const activeCount = activeCounts.get(shop.userId) || 0;
            return {
                userId: shop.userId,
                name: shop.name,
                shopName: shop.shopName,
                stallCodes,
                baseRent,
                sourceRequestId: shop.sourceRequestId,
                closed: closedSet.has(shop.userId),
                activeCount,
                capped: activeCount >= MAX_ACTIVE_CREDITS
            };
        })
        .filter((shop) => shop.baseRent > 0)
        .sort((a, b) => a.stallCodes[0].localeCompare(b.stallCodes[0]));
}

// ตรวจวันที่ก่อนประกาศ คืนข้อความ error ภาษาไทย หรือ null ถ้าใช้ได้
async function validateRainDate(date, now = new Date()) {
    if (!date) return 'กรุณาเลือกวันที่ฝนตก';
    const today = toStartOfDay(now);
    if (date > today) return 'ประกาศล่วงหน้าไม่ได้ ต้องเป็นวันนี้หรือวันที่ผ่านมาแล้ว';
    if (date < addDays(today, -MAX_PAST_DAYS)) return `ประกาศย้อนหลังได้ไม่เกิน ${MAX_PAST_DAYS} วัน`;
    if (await isDateHoliday(date)) return 'วันนี้เป็นวันหยุดที่ไม่ได้คิดค่าเช่าอยู่แล้ว ไม่ต้องชดเชย';
    const existing = await prisma.rainCompensationDay.findUnique({ where: { date } });
    if (existing) return 'วันนี้ประกาศชดเชยไปแล้ว';
    return null;
}

async function previewRainDay(date, percent, now = new Date()) {
    const shops = await findEligibleShops(date, now);
    return shops.map((shop) => ({
        ...shop,
        percent,
        amount: creditAmount(shop.baseRent, percent),
        include: !shop.closed
    }));
}

// selections: { [userId]: { include: boolean, percent } } จากฟอร์มตัวอย่าง — คำนวณยอดใหม่ฝั่ง server เสมอ
async function announceRainDay({ date, percent, note, announceAt, createdBy, selections }, now = new Date()) {
    await releaseCreditsOfRejectedRequests();
    const error = await validateRainDate(date, now);
    if (error) return { error };

    const shops = await findEligibleShops(date, now);
    const chosen = shops.filter((shop) => selections[shop.userId]?.include);
    if (!chosen.length) return { error: 'ไม่ได้เลือกร้านที่จะได้รับชดเชยเลย' };

    const at = announceAt || defaultAnnounceAt(date);
    const expiresAt = computeExpiresAt(at);
    const day = await prisma.$transaction(async (tx) => {
        const created = await tx.rainCompensationDay.create({
            data: { date, percent, note: note || null, announceAt: at, createdBy: createdBy || null }
        });
        for (const shop of chosen) {
            const shopPercent = clampPercent(selections[shop.userId].percent, percent);
            await tx.rainCredit.create({
                data: {
                    dayId: created.id,
                    userId: shop.userId,
                    sourceRequestId: shop.sourceRequestId || null,
                    stallCodes: shop.stallCodes.join(',').slice(0, 191),
                    baseRent: shop.baseRent,
                    percent: shopPercent,
                    amount: creditAmount(shop.baseRent, shopPercent),
                    status: shop.capped ? 'SKIPPED_CAP' : 'ACTIVE',
                    expiresAt
                }
            });
        }
        return created;
    });
    return {
        day,
        grantedCount: chosen.filter((shop) => !shop.capped).length,
        cappedCount: chosen.filter((shop) => shop.capped).length
    };
}

// ยกเลิกประกาศทั้งวัน (กดผิด) ได้เฉพาะตอนยังไม่มีร้านไหนใช้เครดิตของวันนั้น
async function deleteRainDay(dayId) {
    const used = await prisma.rainCredit.count({ where: { dayId, status: 'USED' } });
    if (used) return { error: `มี ${used} ร้านใช้ส่วนลดของวันนี้ไปแล้ว ยกเลิกทั้งวันไม่ได้ (เพิกถอนรายร้านที่ยังไม่ใช้แทน)` };
    await prisma.rainCompensationDay.delete({ where: { id: dayId } });
    return { ok: true };
}

async function revokeCredit(creditId, reason) {
    const credit = await prisma.rainCredit.findUnique({ where: { id: creditId } });
    if (!credit) return { error: 'ไม่พบรายการชดเชยนี้' };
    if (credit.status !== 'ACTIVE') return { error: 'เพิกถอนได้เฉพาะรายการที่ยังไม่ถูกใช้' };
    await prisma.rainCredit.update({
        where: { id: creditId },
        data: { status: 'REVOKED', revokeReason: String(reason || '').trim().slice(0, 500) || null }
    });
    return { ok: true };
}

async function listRainDays() {
    await releaseCreditsOfRejectedRequests();
    const days = await prisma.rainCompensationDay.findMany({
        orderBy: { date: 'desc' },
        take: 60,
        include: { credits: { orderBy: { stallCodes: 'asc' } } }
    });
    const userIds = [...new Set(days.flatMap((day) => day.credits.map((c) => c.userId)))];
    const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, username: true, shop: { select: { shopName: true } } }
        })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    return days.map((day) => ({
        ...day,
        credits: day.credits.map((credit) => {
            const u = userById.get(credit.userId);
            return { ...credit, name: u?.name || u?.username || '-', shopName: u?.shop?.shopName || null };
        })
    }));
}

// เครดิตที่ผู้ขายใช้ได้ตอนนี้ (ประกาศผลแล้ว ยังไม่หมดอายุ ยังไม่ถูกใช้)
async function getAvailableCredits(userId, now = new Date()) {
    await releaseCreditsOfRejectedRequests(userId);
    const credits = await prisma.rainCredit.findMany({
        where: { userId, status: 'ACTIVE', expiresAt: { gt: now }, day: { announceAt: { lte: now } } },
        include: { day: { select: { date: true, announceAt: true } } },
        orderBy: { expiresAt: 'asc' }
    });
    return {
        credits,
        total: credits.reduce((sum, credit) => sum + credit.amount, 0),
        count: credits.length,
        nextExpiry: credits[0]?.expiresAt || null
    };
}

function isAwaitingPayment(request) {
    return Boolean(request)
        && String(request.status || '').toUpperCase() === 'IN_PROGRESS'
        && Boolean(request.assignedStallCode)
        && !request.paymentSlipImage;
}

// ยอดที่ต้องโอนจริงหลังหักส่วนลดชดเชย — ทุกจุดที่เทียบยอดสลิป/สร้าง QR ต้องใช้ตัวนี้ ไม่ใช่ grandTotal ตรงๆ
function getPayableAmount(request, grandTotal) {
    const total = Number(grandTotal || 0);
    const discount = Number(request?.rainDiscount || 0);
    return Math.max(0, total - discount);
}

// ใช้เครดิตทั้งหมดกับคำขอนี้ (ต้องใช้ทั้งหมดในครั้งเดียว) — คืน { discount, payable, forfeit } หรือ { error }
async function applyCreditsToRequest(userId, request, grandTotal, now = new Date()) {
    if (!isAwaitingPayment(request) || request.userId !== userId) return { error: 'not_awaiting_payment' };
    if (request.rainDiscount) return { error: 'rain_discount_already_applied' };
    const { credits, total } = await getAvailableCredits(userId, now);
    if (!credits.length) return { error: 'no_rain_credit' };

    const amountDue = Number(grandTotal || 0);
    const forfeit = Math.max(0, Math.floor(total - amountDue));
    const ids = credits.map((credit) => credit.id);
    const result = await prisma.$transaction(async (tx) => {
        // กันกดซ้ำพร้อมกันสองแท็บ: อัปเดตเฉพาะเครดิตที่ยัง ACTIVE และคำขอที่ยังไม่มีส่วนลด
        const marked = await tx.rainCredit.updateMany({
            where: { id: { in: ids }, status: 'ACTIVE' },
            data: { status: 'USED', usedOnRequestId: request.id, usedAt: now }
        });
        const updated = await tx.bookingRequest.updateMany({
            where: { id: request.id, rainDiscount: null, paymentSlipImage: null },
            data: { rainDiscount: total, rainDiscountForfeit: forfeit || null }
        });
        if (marked.count !== ids.length || updated.count !== 1) throw new Error('RAIN_CREDIT_RACE');
        return { discount: total, payable: Math.max(0, amountDue - total), forfeit };
    }).catch((error) => {
        if (error.message === 'RAIN_CREDIT_RACE') return { error: 'rain_discount_already_applied' };
        throw error;
    });
    return result;
}

// ยกเลิกการใช้ส่วนลด (ก่อนส่งสลิป) — เครดิตกลับเป็นใช้ได้ วันหมดอายุเดิม (ถ้าหมดอายุไปแล้วระหว่างนั้นก็ใช้ไม่ได้แล้ว)
async function cancelCreditsOnRequest(userId, request) {
    if (!isAwaitingPayment(request) || request.userId !== userId || !request.rainDiscount) return { error: 'no_rain_discount_to_cancel' };
    await prisma.$transaction([
        prisma.rainCredit.updateMany({
            where: { usedOnRequestId: request.id, status: 'USED' },
            data: { status: 'ACTIVE', usedOnRequestId: null, usedAt: null }
        }),
        prisma.bookingRequest.update({
            where: { id: request.id },
            data: { rainDiscount: null, rainDiscountForfeit: null }
        })
    ]);
    return { ok: true };
}

function thaiDate(value) {
    return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function thaiTime(value) {
    return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// แจ้งเตือนในหน้า /notifications: ได้รับชดเชย (ทีละวันฝนตก), ไม่ได้เพราะครบ 5 ครั้ง, ใกล้หมดอายุ (แถบต้องทำ)
async function buildRainNotifications(userId, now = new Date()) {
    if (!userId) return [];
    await releaseCreditsOfRejectedRequests(userId);
    const since = addDays(now, -EXPIRY_DAYS - 1);
    const credits = await prisma.rainCredit.findMany({
        where: { userId, status: { in: ['ACTIVE', 'USED', 'SKIPPED_CAP'] }, day: { announceAt: { lte: now, gte: since } } },
        include: { day: { select: { date: true, announceAt: true } } },
        orderBy: { createdAt: 'desc' }
    });

    const items = credits.map((credit) => {
        const at = credit.day.announceAt;
        const base = {
            id: `rain-credit-${credit.id}`,
            type: 'rain-credit',
            date: thaiDate(at),
            time: thaiTime(at),
            at: at.toISOString(),
            status: 'SUCCESS',
            isRead: false,
            isNew: true,
            link: '/booking-status',
            linkIcon: 'bi-cloud-rain',
            linkLabel: 'ดูส่วนลดของฉัน'
        };
        if (credit.status === 'SKIPPED_CAP') {
            return {
                ...base,
                type: 'rain-credit-capped',
                title: 'ฝนตกวันนี้ แต่ไม่ได้รับชดเชยเพิ่ม',
                desc: `วันที่ ${thaiDate(credit.day.date)} เข้าเงื่อนไขชดเชยฝนตก แต่คุณมีส่วนลดชดเชยที่ยังไม่ได้ใช้ครบ ${MAX_ACTIVE_CREDITS} ครั้งแล้ว (สะสมได้สูงสุด ${MAX_ACTIVE_CREDITS} ครั้ง) — ใช้ส่วนลดที่มีกับการจองครั้งถัดไปก่อน`
            };
        }
        const expired = credit.status === 'ACTIVE' && credit.expiresAt <= now;
        return {
            ...base,
            title: `ได้รับส่วนลดชดเชยฝนตก ${credit.amount.toLocaleString('th-TH')} บาท`,
            desc: `ฝนตกวันที่ ${thaiDate(credit.day.date)} ล็อก ${credit.stallCodes.replace(/,/g, ', ')} ได้ชดเชย ${credit.percent}% ของค่าเช่า — ใช้เป็นส่วนลดตอนชำระเงินการจองครั้งถัดไป ${credit.status === 'USED' ? '(ใช้แล้ว)' : expired ? '(หมดอายุแล้ว)' : `ภายใน ${thaiDate(credit.expiresAt)}`}`,
            ...(credit.status !== 'ACTIVE' || expired ? { isRead: true, isNew: false } : {})
        };
    });

    // ใกล้หมดอายุ: เตือนก้อนเดียวตามเครดิตที่หมดก่อน (ต้องใช้ทั้งหมดพร้อมกันอยู่แล้ว)
    const warnBefore = addDays(now, EXPIRY_WARN_DAYS);
    const active = credits
        .filter((credit) => credit.status === 'ACTIVE' && credit.expiresAt > now)
        .sort((a, b) => a.expiresAt - b.expiresAt);
    const soonest = active[0];
    if (soonest && soonest.expiresAt <= warnBefore) {
        const total = active.reduce((sum, credit) => sum + credit.amount, 0);
        const warnAt = addDays(soonest.expiresAt, -EXPIRY_WARN_DAYS);
        items.push({
            id: `rain-credit-expiring-${soonest.id}`,
            type: 'rain-credit-expiring',
            title: 'ส่วนลดชดเชยฝนตกใกล้หมดอายุ',
            desc: `มีส่วนลดชดเชย ${total.toLocaleString('th-TH')} บาท (${active.length} ครั้ง) ส่วนลดก้อนแรกหมดอายุ ${thaiDate(soonest.expiresAt)} — จองล็อกแล้วกดใช้ส่วนลดตอนชำระเงิน`,
            date: thaiDate(warnAt),
            time: thaiTime(warnAt),
            at: warnAt.toISOString(),
            status: 'IN_PROGRESS',
            action: 'ใช้ส่วนลดก่อนหมดอายุ',
            deadline: soonest.expiresAt.toISOString(),
            isRead: false,
            isNew: true,
            link: '/select-zone',
            linkIcon: 'bi-shop',
            linkLabel: 'จองล็อก'
        });
    }
    return items;
}

module.exports = {
    MIN_PERCENT,
    MAX_PERCENT,
    EXPIRY_DAYS,
    MAX_ACTIVE_CREDITS,
    clampPercent,
    creditAmount,
    defaultAnnounceAt,
    computeExpiresAt,
    parseDateKey,
    validateRainDate,
    previewRainDay,
    announceRainDay,
    deleteRainDay,
    revokeCredit,
    listRainDays,
    getAvailableCredits,
    getPayableAmount,
    applyCreditsToRequest,
    cancelCreditsOnRequest,
    releaseCreditsOfRejectedRequests,
    buildRainNotifications
};
