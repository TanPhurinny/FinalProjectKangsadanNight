// บูธกิจกรรม (โซน G) — ใช้ร่วมกันทั้งฟอร์มขอจัดบูธ (controllers/eventBoothController.js), หน้าแอดมิน,
// และผังตลาด (buildZonesData / utils/stallDayStatus.js) ให้นับ "บูธไม่ว่าง" จากกติกาเดียวกัน
// คำขอที่ครอบวันนั้นและสถานะ IN_PROGRESS (อนุมัติแล้ว รอชำระ) / SUCCESS (ชำระแล้ว) = บูธไม่ว่าง
// ไม่เขียนทับ Stall.status ของบูธ — job ปล่อยล็อก (utils/stallRenewal.js) จึงไม่ยุ่งกับบูธกิจกรรม
const crypto = require('crypto');
const prisma = require('../config/prismaClient');
const { getLotPricing } = require('./lotPricing');
const { toStartOfDay, addDays } = require('./bookingRound');

const EVENT_ZONE_CODE = 'G';
const EVENT_BOOTHS = [
    { code: 'G101', label: 'จุดที่ 1 — ใต้แถว F1/F2' },
    { code: 'G201', label: 'จุดที่ 2 — ใต้แถว F5/F6 ติดโซน B' }
];
const EVENT_BOOTH_CODES = EVENT_BOOTHS.map((booth) => booth.code);
const ACTIVE_STATUSES = ['IN_PROGRESS', 'SUCCESS'];
// จองล่วงหน้าได้ไม่เกิน 180 วัน และครั้งละไม่เกิน 31 วัน (กันกรอกช่วงยาวผิดพลาดจนบูธถูกกันไว้ทั้งปี)
const MAX_ADVANCE_DAYS = 180;
const MAX_EVENT_DAYS = 31;

const STATUS_LABEL = {
    PENDING: 'รอแอดมินพิจารณา',
    IN_PROGRESS: 'อนุมัติแล้ว รอชำระเงิน',
    SUCCESS: 'ยืนยันการชำระเงินแล้ว',
    REJECTED: 'ไม่อนุมัติ'
};

function isEventBoothCode(code) {
    return EVENT_BOOTH_CODES.includes(String(code || '').trim().toUpperCase());
}

function getPricePerDay() {
    return getLotPricing(EVENT_BOOTH_CODES[0]).pricePerDay || 0;
}

function newTrackingToken() {
    return crypto.randomBytes(24).toString('hex');
}

function countDays(startDate, endDate) {
    return Math.round((toStartOfDay(endDate) - toStartOfDay(startDate)) / (24 * 60 * 60 * 1000)) + 1;
}

// คำขออื่นที่ได้บูธนี้ไปแล้วและช่วงวันทับกัน (ใช้กันแอดมินอนุมัติซ้อนกัน)
async function findOverlappingRequest(stallCode, startDate, endDate, excludeId = null) {
    return prisma.eventBoothRequest.findFirst({
        where: {
            assignedStallCode: stallCode,
            status: { in: ACTIVE_STATUSES },
            startDate: { lte: toStartOfDay(endDate) },
            endDate: { gte: toStartOfDay(startDate) },
            ...(excludeId ? { id: { not: excludeId } } : {})
        }
    });
}

// บูธกิจกรรมที่ไม่ว่าง ณ วันที่ระบุ: { G101: { state: 'paid'|'unpaid', request, isLastDay, startsToday } }
async function getEventBoothStatusForDate(date) {
    const day = toStartOfDay(date);
    return eventBoothStatusOnDay(await loadEventBoothRequestsInRange(day, day), day);
}

// คำขอบูธที่ทับช่วง [from, to] — ใช้คู่กับ eventBoothStatusOnDay เวลาต้องคิดสถานะหลายวัน (แถบวันของ /admin/slots)
function loadEventBoothRequestsInRange(from, to) {
    return prisma.eventBoothRequest.findMany({
        where: {
            status: { in: ACTIVE_STATUSES },
            assignedStallCode: { not: null },
            startDate: { lt: addDays(toStartOfDay(to), 1) },
            endDate: { gte: toStartOfDay(from) }
        },
        orderBy: { id: 'desc' }
    });
}

function eventBoothStatusOnDay(requests, day) {
    const byCode = {};
    requests.forEach((request) => {
        if (toStartOfDay(request.startDate) > day || toStartOfDay(request.endDate) < day) return;
        const code = String(request.assignedStallCode).toUpperCase();
        const current = byCode[code];
        // SUCCESS ชนะ IN_PROGRESS ถ้ามีหลายใบ (ไม่ควรเกิดเพราะเช็คทับตอนอนุมัติแล้ว)
        if (current && current.state === 'paid') return;
        byCode[code] = {
            state: request.status === 'SUCCESS' ? 'paid' : 'unpaid',
            request,
            isLastDay: toStartOfDay(request.endDate).getTime() === day.getTime(),
            startsToday: toStartOfDay(request.startDate).getTime() === day.getTime()
        };
    });
    return byCode;
}

// ข้อมูลงานที่แสดงบนการ์ดบูธในผัง — ไม่มีเบอร์/อีเมลผู้ติดต่อ (ผังหน้า /market-map เปิดได้โดยไม่ต้อง login)
function toPublicEventInfo(request) {
    return {
        title: request.eventTitle,
        company: request.companyName,
        description: String(request.description || '').slice(0, 200),
        startDate: request.startDate,
        endDate: request.endDate,
        paid: request.status === 'SUCCESS'
    };
}

// คำขอที่ต้องให้แอดมินจัดการ: ใหม่ (PENDING) + ส่งสลิปแล้วรอยืนยัน (IN_PROGRESS ที่มีสลิป)
async function countEventBoothTodo() {
    const [pending, slips] = await Promise.all([
        prisma.eventBoothRequest.count({ where: { status: 'PENDING' } }),
        prisma.eventBoothRequest.count({ where: { status: 'IN_PROGRESS', paymentSlipImage: { not: null } } })
    ]);
    return { pending, slips, total: pending + slips };
}

module.exports = {
    EVENT_ZONE_CODE,
    EVENT_BOOTHS,
    EVENT_BOOTH_CODES,
    ACTIVE_STATUSES,
    MAX_ADVANCE_DAYS,
    MAX_EVENT_DAYS,
    STATUS_LABEL,
    isEventBoothCode,
    getPricePerDay,
    newTrackingToken,
    countDays,
    findOverlappingRequest,
    getEventBoothStatusForDate,
    loadEventBoothRequestsInRange,
    eventBoothStatusOnDay,
    toPublicEventInfo,
    countEventBoothTodo
};
