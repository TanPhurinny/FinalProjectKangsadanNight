// กติกา "ต่อล็อก" และ "ตัดสิทธิ์ล็อกที่ไม่ต่อ" รวมไว้ที่เดียว ให้ผังตลาด/หน้าล็อกใกล้หมดอายุ/route ต่อล็อกของผู้ขาย
// และ job ปล่อยล็อกอัตโนมัติ (app.js) ใช้ตรรกะเดียวกัน ไม่เพี้ยนกันคนละที่
//
// D = วันขายสุดท้ายเดิม (Stall.bookingEndDate / Booking.rentalEndDate), E = วันสิ้นรอบของ D
// - ต่อจนสุดรอบ (newEnd == E) ต่อได้ทันที
// - ต่อไม่ถึงสิ้นรอบ (newEnd < E) เริ่มต่อได้ตั้งแต่ 1 วันก่อนวัน D (D-1 00:00)
// - ต่อข้ามรอบ (newEnd > E) ไม่อนุญาต
// - ทุกกรณีต้องต่อก่อน D 20:00 เลยเวลานี้ล็อกหมดสิทธิ์และถูกปล่อยเป็นล็อกว่างให้คนอื่นจอง
// เวลาคำนวณตามเวลาของเครื่อง server (เหมือน utils/bookingRound.js) ต้องรันเป็น Asia/Bangkok
const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays, getBookingRoundMetaForDate, getPaymentDeadlineFromLockAssignedAt } = require('./bookingRound');
const { buildBookingRequestTag } = require('./bookingRequestTag');

const RENEWAL_CUTOFF_HOUR = 20;

function getRenewalCutoff(bookingEndDate) {
    const endDay = toStartOfDay(bookingEndDate);
    if (!endDay) return null;
    const cutoff = new Date(endDay);
    cutoff.setHours(RENEWAL_CUTOFF_HOUR, 0, 0, 0);
    return cutoff;
}

// active = ยังไม่ถึงวันสุดท้าย, grace = วันสุดท้ายก่อน 20:00 (ยังต่อได้), lapsed = เลย 20:00 แล้วหมดสิทธิ์
function getRenewalPhase(bookingEndDate, now = new Date()) {
    const cutoff = getRenewalCutoff(bookingEndDate);
    if (!cutoff) return null;
    if (now.getTime() >= cutoff.getTime()) return 'lapsed';
    if (toStartOfDay(now).getTime() >= toStartOfDay(bookingEndDate).getTime()) return 'grace';
    return 'active';
}

// ตัวเลือกการต่อของล็อกนี้ ณ เวลานี้
// คืน { cutoffAt, opensAt, roundEnd, extendStart, fullRoundDays, canRenewShort, canRenewFullRound, isOpen }
function getRenewalOptions(bookingEndDate, now = new Date()) {
    const currentEnd = toStartOfDay(bookingEndDate);
    if (!currentEnd) return null;
    const extendStart = addDays(currentEnd, 1);
    const roundEnd = toStartOfDay(getBookingRoundMetaForDate(currentEnd).cycleEnd);
    const cutoffAt = getRenewalCutoff(currentEnd);
    const opensAt = addDays(currentEnd, -1);
    const fullRoundDays = Math.round((roundEnd - currentEnd) / (24 * 60 * 60 * 1000));
    const isOpen = now.getTime() < cutoffAt.getTime();
    return {
        currentEnd,
        extendStart,
        roundEnd,
        cutoffAt,
        opensAt,
        fullRoundDays,
        isOpen,
        canRenewFullRound: isOpen && fullRoundDays > 0,
        canRenewShort: isOpen && fullRoundDays > 1 && now.getTime() >= opensAt.getTime()
    };
}

// ตรวจวันที่ต่อจนถึง newEndDate — คืน null ถ้าผ่าน ไม่งั้นคืนรหัส error ให้ route redirect ต่อ
function validateRenewal(bookingEndDate, newEndDate, now = new Date()) {
    const options = getRenewalOptions(bookingEndDate, now);
    const newEnd = toStartOfDay(newEndDate);
    if (!options || !newEnd || newEnd <= options.currentEnd || newEnd > options.roundEnd) return 'invalid_extend_date';
    if (!options.isOpen) return 'extend_window_closed';
    if (newEnd.getTime() < options.roundEnd.getTime() && now.getTime() < options.opensAt.getTime()) return 'too_early_to_extend';
    return null;
}

function parseStallCodes(text) {
    return String(text || '').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean);
}

// คำขอที่จัดล็อกแล้ว (IN_PROGRESS) แต่เลยกำหนดชำระ 6 ชม. และยังไม่ส่งสลิป — ส่งสลิปแล้วถือว่ารอแอดมินตรวจ ยังไม่หลุด
function isUnpaidPastDeadline(request, now = new Date()) {
    if (request.status !== 'IN_PROGRESS' || request.paymentSlipImage) return false;
    const deadline = getPaymentDeadlineFromLockAssignedAt(request.lockAssignedAt);
    return Boolean(deadline && deadline.getTime() < now.getTime());
}

// ล็อกเดิมที่คำขอต่อล็อกนี้ต่อมาจาก — ล็อกเหล่านี้ยัง BOOKED โดยคำขอเดิมอยู่ ต้องยอมให้แอดมินจัดซ้ำให้คำขอต่อได้
// และถ้าคำขอต่อถูกปฏิเสธ/ย้ายไปล็อกอื่น/ไม่จ่ายเงิน ต้องคืนล็อกให้สัญญาเดิม (วันเดิม) ไม่ใช่ปล่อยเป็นว่าง
// คืน null ถ้าไม่ใช่คำขอต่อ
async function getExtensionOrigin(db, descriptionText) {
    const match = /\[EXTEND_OF:(\d+)\]/i.exec(String(descriptionText || ''));
    if (!match) return null;
    const originalId = Number(match[1]);
    const original = await db.bookingRequest.findUnique({
        where: { id: originalId },
        select: { assignedStallCode: true, description: true }
    });
    const assignedFromDescription = (/\[ASSIGNED_STALL:([^\]]+)\]/i.exec(String(original?.description || '')) || [])[1];
    const originalBooking = await db.booking.findFirst({
        where: { storeDetailSnapshot: { startsWith: buildBookingRequestTag(originalId) } },
        orderBy: { id: 'asc' },
        select: { rentalStartDate: true, rentalEndDate: true }
    });
    return {
        codes: parseStallCodes(original?.assignedStallCode || assignedFromDescription),
        startDate: originalBooking?.rentalStartDate || null,
        endDate: originalBooking?.rentalEndDate || null
    };
}

// ปล่อยล็อกที่คำขอไม่ใช้แล้ว — ล็อกเดิมของคำขอต่อ (origin) คืนกลับเป็นสัญญาเดิม ส่วนล็อกอื่นปล่อยเป็นว่าง
async function releaseOrRestoreStalls(db, stallCodes, origin, clearDates) {
    if (!stallCodes.length) return;
    const originCodes = origin?.codes || [];
    const restoreCodes = stallCodes.filter((code) => originCodes.includes(code));
    const releaseCodes = stallCodes.filter((code) => !originCodes.includes(code));
    if (restoreCodes.length) {
        await db.stall.updateMany({
            where: { stallCode: { in: restoreCodes } },
            data: { isAvailable: false, status: 'BOOKED', bookingStartDate: origin.startDate, bookingEndDate: origin.endDate }
        });
    }
    if (releaseCodes.length) {
        await db.stall.updateMany({
            where: { stallCode: { in: releaseCodes } },
            data: clearDates
                ? { isAvailable: true, status: 'AVAILABLE', bookingStartDate: null, bookingEndDate: null }
                : { isAvailable: true, status: 'AVAILABLE' }
        });
    }
}

// คำขอต่อที่แอดมินจัดล็อกเดิมให้แล้ว (Stall.bookingEndDate ถูกขยายไปวันใหม่) แต่ผู้ขายไม่จ่ายภายในกำหนด
// คืนวันสิ้นสุดของล็อกกลับเป็นสัญญาเดิม ไม่งั้นล็อกถูกกันไว้ฟรีจนถึงวันใหม่ และ job ตัดสิทธิ์มองไม่เห็น
// ไม่แตะสถานะคำขอ (แอดมินปฏิเสธเองได้ภายหลัง) — ถ้าผู้ขายส่งสลิปช้าแล้วแอดมินยืนยัน confirmPayment ขยายให้ใหม่
// คืนรหัสล็อกที่คืนค่า
async function restoreUnpaidExtensions(now = new Date()) {
    const requests = await prisma.bookingRequest.findMany({
        where: {
            status: 'IN_PROGRESS',
            paymentSlipImage: null,
            assignedStallCode: { not: null },
            description: { startsWith: '[EXTEND_OF:' }
        },
        select: { status: true, paymentSlipImage: true, lockAssignedAt: true, assignedStallCode: true, description: true }
    });
    const restored = [];
    for (const request of requests) {
        if (!isUnpaidPastDeadline(request, now)) continue;
        const origin = await getExtensionOrigin(prisma, request.description);
        if (!origin?.endDate) continue;
        const codes = parseStallCodes(request.assignedStallCode).filter((code) => origin.codes.includes(code));
        if (!codes.length) continue;
        // เฉพาะล็อกที่ยังเป็นวันของคำขอต่ออยู่ (ยังไม่ถูกคืน/ถูกปล่อย/ถูกจัดให้คนอื่น) กันเขียนทับทุก 5 นาที
        const stalls = await prisma.stall.findMany({ where: { stallCode: { in: codes }, status: 'BOOKED' } });
        const toRestore = stalls
            .filter((stall) => stall.bookingEndDate && toStartOfDay(stall.bookingEndDate).getTime() !== toStartOfDay(origin.endDate).getTime())
            .map((stall) => stall.stallCode);
        if (!toRestore.length) continue;
        await releaseOrRestoreStalls(prisma, toRestore, origin, false);
        restored.push(...toRestore);
    }
    return restored;
}

// ล็อกที่ผู้ขายยื่นคำขอต่อไว้แล้วแต่ยังไม่จบขั้นตอน (รอแอดมินอนุมัติ / รอชำระเงินและยังไม่เลยกำหนด) ห้ามถูกปล่อย
// แม้เลย 20:00 แล้ว — คำขอต่อเก็บเป็น BookingRequest ที่ description ขึ้นต้น [EXTEND_OF:<id คำขอเดิม>]
async function getStallCodesWithPendingExtension(now) {
    const extendRequests = await prisma.bookingRequest.findMany({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, description: { startsWith: '[EXTEND_OF:' } },
        select: { description: true, status: true, lockAssignedAt: true, paymentSlipImage: true }
    });
    const originalIds = [];
    extendRequests.forEach((request) => {
        if (isUnpaidPastDeadline(request, now)) return;
        const match = /^\[EXTEND_OF:(\d+)\]/.exec(request.description);
        if (match) originalIds.push(Number(match[1]));
    });
    if (!originalIds.length) return new Set();
    const originals = await prisma.bookingRequest.findMany({
        where: { id: { in: originalIds } },
        select: { assignedStallCode: true }
    });
    const codes = new Set();
    originals.forEach((original) => {
        String(original.assignedStallCode || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean).forEach((c) => codes.add(c));
    });
    return codes;
}

// job ตัดสิทธิ์: ปล่อยล็อก BOOKED ที่เลย D 20:00 และไม่มีคำขอต่อค้างอยู่ กลับเป็นว่างให้คนอื่นจองได้ (คืนรหัสล็อกที่ปล่อย)
// เก็บ bookingStartDate/EndDate เดิมไว้ (ไม่เคลียร์) เพื่อให้ย้อนดู/กู้คืนได้ — ไม่แตะสถานะ Booking/BookingRequest เดิม เหมือนปุ่ม "ปล่อยล็อก" ของแอดมิน
async function releaseLapsedStalls(now = new Date()) {
    const candidates = await prisma.stall.findMany({
        where: { status: 'BOOKED', bookingEndDate: { not: null } }
    });
    const lapsed = candidates.filter((stall) => getRenewalPhase(stall.bookingEndDate, now) === 'lapsed');
    if (!lapsed.length) return [];

    const protectedCodes = await getStallCodesWithPendingExtension(now);
    const toRelease = lapsed.filter((stall) => !protectedCodes.has(String(stall.stallCode).toUpperCase()));
    if (!toRelease.length) return [];

    const codes = toRelease.map((stall) => stall.stallCode);
    await prisma.$transaction([
        prisma.stall.updateMany({
            where: { id: { in: toRelease.map((stall) => stall.id) }, status: 'BOOKED' },
            data: { isAvailable: true, status: 'AVAILABLE' }
        }),
        prisma.slot.updateMany({ where: { slotNumber: { in: codes } }, data: { isAvailable: true } })
    ]);
    return codes;
}

// เตือนทางอีเมลผู้เช่าล็อกที่อยู่ในวันสุดท้าย (grace) ตั้งแต่ 12:00 เป็นต้นไป วันละครั้งต่อล็อก
// จำที่ส่งแล้วในหน่วยความจำ (ไม่มีตารางเก็บ) — restart server ระหว่างวันอาจส่งซ้ำได้ 1 ครั้ง ยอมรับได้
const REMINDER_HOUR = 12;
const remindedKeys = new Set();
async function sendGraceReminders(now = new Date(), sendEmail) {
    if (now.getHours() < REMINDER_HOUR) return [];
    const candidates = await prisma.stall.findMany({ where: { status: 'BOOKED', bookingEndDate: { not: null } } });
    const sent = [];
    for (const stall of candidates) {
        if (getRenewalPhase(stall.bookingEndDate, now) !== 'grace') continue;
        const key = `${stall.stallCode}:${toStartOfDay(stall.bookingEndDate).toDateString()}`;
        if (remindedKeys.has(key)) continue;
        remindedKeys.add(key);
        const slot = await prisma.slot.findUnique({
            where: { slotNumber: stall.stallCode },
            select: {
                bookings: {
                    where: { status: { in: ['IN_PROGRESS', 'SUCCESS', 'APPROVED'] } },
                    orderBy: { id: 'desc' },
                    take: 1,
                    select: { user: { select: { email: true } } }
                }
            }
        });
        const email = slot?.bookings[0]?.user?.email;
        if (!email) continue;
        await sendEmail(email, stall.stallCode, 0);
        sent.push(stall.stallCode);
    }
    return sent;
}

module.exports = {
    sendGraceReminders,
    restoreUnpaidExtensions,
    isUnpaidPastDeadline,
    getExtensionOrigin,
    releaseOrRestoreStalls,
    releaseLapsedStalls,
    RENEWAL_CUTOFF_HOUR,
    getRenewalCutoff,
    getRenewalPhase,
    getRenewalOptions,
    validateRenewal
};
