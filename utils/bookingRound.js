// รวม logic การคำนวณ "รอบการจอง" (1 รอบ = 14 วัน) ไว้ที่เดียว
// เดิมโค้ดชุดนี้ถูกก็อปไว้ทั้งใน routes/sellerRoute.js และ controllers/approvalController.js
// แยกกัน 2 ชุด ทำให้ตอนแก้วันที่ anchor ต้องแก้พร้อมกันสองที่ เสี่ยงหลุด

const BOOKING_ROUND_LENGTH_DAYS = 14;
const BOOKING_ROUND_ANCHOR_NUMBER = 44;
const BOOKING_ROUND_ANCHOR_DATE = new Date('2026-08-14T00:00:00');

function toStartOfDay(dateValue) {
    const value = new Date(dateValue);
    if (Number.isNaN(value.getTime())) {
        return null;
    }
    value.setHours(0, 0, 0, 0);
    return value;
}

function addDays(dateValue, days) {
    const next = new Date(dateValue);
    next.setDate(next.getDate() + days);
    return next;
}

function getBookingRoundMetaForDate(dateValue) {
    const baseDate = toStartOfDay(dateValue || new Date());
    if (!baseDate) {
        return {
            roundNumber: BOOKING_ROUND_ANCHOR_NUMBER,
            cycleStart: new Date(BOOKING_ROUND_ANCHOR_DATE),
            cycleEnd: addDays(new Date(BOOKING_ROUND_ANCHOR_DATE), BOOKING_ROUND_LENGTH_DAYS - 1)
        };
    }

    const anchor = toStartOfDay(BOOKING_ROUND_ANCHOR_DATE);
    const diffDays = Math.floor((baseDate.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const roundNumber = BOOKING_ROUND_ANCHOR_NUMBER + Math.floor(diffDays / BOOKING_ROUND_LENGTH_DAYS);
    const cycleStart = addDays(anchor, (roundNumber - BOOKING_ROUND_ANCHOR_NUMBER) * BOOKING_ROUND_LENGTH_DAYS);
    const cycleEnd = addDays(cycleStart, BOOKING_ROUND_LENGTH_DAYS - 1);

    return { roundNumber, cycleStart, cycleEnd };
}

function getRoundWindow(roundNumber) {
    const anchor = toStartOfDay(BOOKING_ROUND_ANCHOR_DATE);
    const offset = (roundNumber - BOOKING_ROUND_ANCHOR_NUMBER) * BOOKING_ROUND_LENGTH_DAYS;
    const cycleStart = addDays(anchor, offset);
    const cycleEnd = addDays(cycleStart, BOOKING_ROUND_LENGTH_DAYS - 1);
    return { cycleStart, cycleEnd };
}

function isRoundEditable(roundNumber) {
    const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
    return roundNumber >= currentRoundNumber;
}

function getBookingRoundStatusDetails(dateValue) {
    const meta = getBookingRoundMetaForDate(dateValue);
    const reminderDate = addDays(meta.cycleEnd, -5);
    const openAt = addDays(meta.cycleStart, 1);
    const today = toStartOfDay(dateValue || new Date());

    let status = 'เปิดจอง';
    let statusText = 'ยังสามารถส่งคำขอและเลือกวันที่ได้ตามรอบปัจจุบัน';

    if (today.getDay() === 3) {
        status = 'แจ้งเตือนวันพุธ';
        statusText = 'ทุกล็อคในรอบนี้ได้รับการแจ้งเตือนในวันพุธเพื่อเตรียมยืนยันการจองและจัดการข้อมูลให้ครบถ้วน';
    } else if (today < openAt) {
        status = 'รอเปิดรอบ';
        statusText = `รอบนี้จะเปิดให้จองได้ในวันที่ ${openAt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else if (today <= reminderDate) {
        status = 'แจ้งเตือนก่อนปิดรอบ';
        statusText = `กรุณาจองให้เสร็จก่อน ${reminderDate.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })} เพื่อให้ระบบคงความต่อเนื่องของรอบ 14 วัน`;
    }

    return {
        ...meta,
        reminderDate,
        openAt,
        status,
        statusText
    };
}

// กติกา 2 ช่วงก่อนรอบ "meta" จะเปิด (อ้างอิงจาก openAt ของรอบนั้น ซึ่งตกวันเสาร์เสมอ
// เพราะ 14 หาร 7 ลงตัว ทำให้จันทร์/อังคาร/พุธ "ก่อนเปิดรอบ" คงที่ทุกรอบ):
//   ช่วง 1 = จันทร์-อังคาร (openAt-5, openAt-4): จองเต็ม 14 วันเท่านั้น (ทั้งล็อคเต็งและล็อคปกติ)
//     ชำระเงินให้เสร็จก่อนวันพุธ (ดู getPaymentDeadlineForRound)
//   ช่วง 2 = พุธ (openAt-3) เป็นต้นไปจนจบรอบ: จองต่อเนื่องขั้นต่ำ 3 วัน หรือจองทีละวัน (1 วัน) ก็ได้
//     ห้ามล็อคเต็ง จองล่วงหน้าได้แค่ 1 วันก่อนวันขาย (สำหรับผู้ขายใหม่ที่ต้องการขายทันที)
//     ชำระเงินก่อนวันที่จะเริ่มขายเอง (ดู sellerRoute.js ตอนคำนวณ paymentDeadline ของ booking)
function getBookingPhaseForRound(meta, dateValue) {
    const today = toStartOfDay(dateValue || new Date());
    const openAt = addDays(meta.cycleStart, 1);
    const phase1Start = addDays(openAt, -5); // จันทร์
    const phase2Start = addDays(openAt, -3); // พุธ

    if (today < phase1Start) {
        return { phase: 'not_open_yet', allowCornerZone: false, minDays: null, allowSingleDay: false, maxAdvanceStart: null };
    }

    if (today < phase2Start) {
        // ช่วง 1: จันทร์-อังคาร — จองเต็ม 14 วันเท่านั้น
        return { phase: 1, allowCornerZone: true, minDays: null, allowSingleDay: false, maxAdvanceStart: null };
    }

    if (today >= phase2Start && today <= meta.cycleEnd) {
        // ช่วง 2: พุธ เป็นต้นไป จนจบรอบ — ขั้นต่ำ 3 วันติดกัน เว้นแต่จองทีละวัน (1 วัน)
        return { phase: 2, allowCornerZone: false, minDays: 3, allowSingleDay: true, maxAdvanceStart: addDays(today, 1) };
    }

    return { phase: 'not_open_yet', allowCornerZone: false, minDays: null, allowSingleDay: false, maxAdvanceStart: null };
}

// กำหนดชำระเงินสำหรับกลุ่ม "จองยาว 14 วัน" / "ล็อคเต็ง" เท่านั้น (ตามเงื่อนไขธุรกิจ:
// จองยาว/ล็อคเต็งต้องชำระเงินก่อนวันพุธของสัปดาห์ที่ประกาศ ซึ่งตรงกับ phase2Day - 1 วัน)
function getPaymentDeadlineForRound(meta) {
    const openAt = addDays(meta.cycleStart, 1);
    const phase2Day = addDays(openAt, -3); // พุธ
    return addDays(phase2Day, -1); // อังคาร = ก่อนวันพุธ
}

module.exports = {
    BOOKING_ROUND_LENGTH_DAYS,
    BOOKING_ROUND_ANCHOR_NUMBER,
    BOOKING_ROUND_ANCHOR_DATE,
    toStartOfDay,
    addDays,
    getBookingRoundMetaForDate,
    getRoundWindow,
    isRoundEditable,
    getBookingRoundStatusDetails,
    getBookingPhaseForRound,
    getPaymentDeadlineForRound
};
