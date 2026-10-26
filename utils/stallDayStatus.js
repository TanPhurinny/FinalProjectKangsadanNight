// สถานะของทุกล็อก "ณ วันขายที่เลือก" สำหรับผังแอดมิน /admin/slots (ดูวันนี้ หรือเลื่อนดูวันอื่นล่วงหน้า/ย้อนหลัง)
// คิดจากช่วงวันเช่าของ Booking (rentalStartDate..rentalEndDate) ไม่ใช่ Stall.status ที่ค้างอยู่ในฐานข้อมูล
// เพราะ Stall.status บอกได้แค่ว่า "ตอนนี้มีคนถือล็อกอยู่ไหม" ไม่รู้ว่าจองไว้ถึงวันไหน/เริ่มวันไหน
// อ่านข้อมูลอย่างเดียว ไม่เขียน DB
const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays } = require('./bookingRound');
const { businessDateOf } = require('./shopOpenStatus');
const { isDateHoliday } = require('./bookingHolidays');
const { getEventBoothStatusForDate } = require('./eventBooth');

const ACTIVE_BOOKING_STATUSES = ['APPROVED', 'IN_PROGRESS', 'SUCCESS'];
// มีหลาย Booking ทับวันเดียวกันในล็อกเดียว (เช่น คำขอเก่าค้าง IN_PROGRESS) ให้เชื่อตัวที่จ่ายเงินแล้วก่อน
const STATUS_PRIORITY = { SUCCESS: 3, IN_PROGRESS: 2, APPROVED: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// ดูได้ย้อนหลัง/ล่วงหน้าไม่เกินนี้ (กันใส่ ?date= ปีไกลๆ แล้วได้ผังว่างทั้งตลาดโดยไม่รู้ตัว)
const MAX_PAST_DAYS = 30;
const MAX_FUTURE_DAYS = 90;

function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function dayDiff(a, b) {
    return Math.round((toStartOfDay(a) - toStartOfDay(b)) / DAY_MS);
}

// แปลง ?date=YYYY-MM-DD เป็นวันที่ (เที่ยงคืนเวลาไทย) — ไม่ส่งมา/รูปแบบผิด/เกินช่วง = วันขายวันนี้
// "วันนี้" ตัดวันตอนตี 5 เหมือน utils/shopOpenStatus.js เพราะตลาดกลางคืนขายเลยเที่ยงคืน
function resolveViewDate(rawDate, now = new Date()) {
    const today = businessDateOf(now);
    let date = today;
    if (typeof rawDate === 'string' && DATE_KEY_PATTERN.test(rawDate)) {
        const parsed = toStartOfDay(`${rawDate}T00:00:00`);
        if (parsed && toDateKey(parsed) === rawDate) {
            const offset = dayDiff(parsed, today);
            if (offset >= -MAX_PAST_DAYS && offset <= MAX_FUTURE_DAYS) date = parsed;
        }
    }
    const offset = dayDiff(date, today);
    return {
        date,
        dateKey: toDateKey(date),
        todayKey: toDateKey(today),
        prevKey: offset > -MAX_PAST_DAYS ? toDateKey(addDays(date, -1)) : null,
        nextKey: offset < MAX_FUTURE_DAYS ? toDateKey(addDays(date, 1)) : null,
        minKey: toDateKey(addDays(today, -MAX_PAST_DAYS)),
        maxKey: toDateKey(addDays(today, MAX_FUTURE_DAYS)),
        isToday: offset === 0,
        dayOffset: offset
    };
}

// ช่วงวันบนตัวล็อก — ข้อมูลเก่าบางแถวไม่มีวันเริ่ม/วันสิ้นสุด ถือว่าไม่จำกัดฝั่งนั้น (ไม่รู้ = ยังถือล็อกอยู่)
function covers(start, end, day) {
    const s = start ? toStartOfDay(start) : null;
    const e = end ? toStartOfDay(end) : null;
    return (!s || s <= day) && (!e || e >= day);
}

// คืน { byCode: { A101: { state, bookingId, bookingStatus, isLastDay, startsToday, mismatch } }, isHoliday }
// state: 'paid' (ยืนยันสลิปแล้ว) | 'unpaid' (จัดล็อกแล้ว รอจ่าย/รอยืนยันสลิป) | 'maintenance' | 'free'
async function buildStallStatusForDate(date) {
    const day = toStartOfDay(date);
    const dayEnd = new Date(addDays(day, 1).getTime() - 1);

    const [stalls, bookings, isHoliday, eventBooths] = await Promise.all([
        prisma.stall.findMany({ select: { stallCode: true, status: true, bookingStartDate: true, bookingEndDate: true } }),
        prisma.booking.findMany({
            where: {
                status: { in: ACTIVE_BOOKING_STATUSES },
                rentalStartDate: { lte: dayEnd },
                rentalEndDate: { gte: day }
            },
            select: { id: true, status: true, rentalStartDate: true, rentalEndDate: true, slot: { select: { slotNumber: true } } }
        }),
        isDateHoliday(day),
        // บูธกิจกรรม (โซน G) ไม่มี Booking — สถานะมาจาก EventBoothRequest ที่ครอบวันนี้ (utils/eventBooth.js)
        getEventBoothStatusForDate(day)
    ]);

    const bookingByCode = {};
    bookings.forEach((booking) => {
        const code = String(booking.slot?.slotNumber || '').toUpperCase();
        if (!code) return;
        const current = bookingByCode[code];
        const better = !current
            || STATUS_PRIORITY[booking.status] > STATUS_PRIORITY[current.status]
            || (STATUS_PRIORITY[booking.status] === STATUS_PRIORITY[current.status] && booking.id > current.id);
        if (better) bookingByCode[code] = booking;
    });

    const byCode = {};
    stalls.forEach((stall) => {
        const code = String(stall.stallCode).toUpperCase();
        const booking = bookingByCode[code];

        if (stall.status === 'MAINTENANCE') {
            byCode[code] = { state: 'maintenance' };
            return;
        }

        const eventBooth = eventBooths[code];
        if (eventBooth) {
            byCode[code] = {
                state: eventBooth.state,
                eventRequestId: eventBooth.request.id,
                isLastDay: eventBooth.isLastDay,
                startsToday: eventBooth.startsToday
            };
            return;
        }

        if (booking) {
            // ล็อกถูกปล่อยเป็นว่างไปแล้ว แต่ Booking ยังบอกว่าครอบวันนี้อยู่ (เช่น ปล่อยก่อนกำหนด/ข้อมูลค้าง)
            // แสดงเป็นว่างตามตัวล็อก แต่ติดธงให้แอดมินเห็นว่าข้อมูลสองที่ไม่ตรงกัน
            if (stall.status === 'AVAILABLE') {
                byCode[code] = { state: 'free', mismatch: true, bookingId: booking.id };
                return;
            }
            byCode[code] = {
                state: booking.status === 'SUCCESS' ? 'paid' : 'unpaid',
                bookingId: booking.id,
                bookingStatus: booking.status,
                isLastDay: dayDiff(booking.rentalEndDate, day) === 0,
                startsToday: dayDiff(booking.rentalStartDate, day) === 0
            };
            return;
        }

        // ไม่เจอ Booking แต่ตัวล็อกมีช่วงวันเช่าครอบวันนี้ (เช่น ต่อสัญญาที่เขียนวันลง Stall อย่างเดียว) — ถือว่าจ่ายแล้ว
        if (stall.status === 'BOOKED' && covers(stall.bookingStartDate, stall.bookingEndDate, day)) {
            byCode[code] = {
                state: 'paid',
                isLastDay: Boolean(stall.bookingEndDate) && dayDiff(stall.bookingEndDate, day) === 0,
                startsToday: Boolean(stall.bookingStartDate) && dayDiff(stall.bookingStartDate, day) === 0
            };
            return;
        }

        byCode[code] = { state: 'free' };
    });

    return { byCode, isHoliday };
}

module.exports = { resolveViewDate, buildStallStatusForDate, toDateKey };
