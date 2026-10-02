// จัดการ "วันหยุด" ที่แอดมินประกาศ (เช่น ปีใหม่, สงกรานต์) — รายการกลางใช้ร่วมกับทุกรอบการจอง 14 วัน
// วันหยุดจองไม่ได้ (เลือกเป็นวันเดียว/วันเริ่มไม่ได้) แต่ไม่กระทบโครงสร้างรอบ (cycleStart/cycleEnd/เลขรอบ
// ยังคำนวณแบบเดิมเสมอ ดู utils/bookingRound.js) ผลคือจำนวน "วันที่คิดเงิน" (billableDays) น้อยกว่า
// จำนวนวันปฏิทินของรอบ/ช่วงที่เลือก ถ้ามีวันหยุดแทรกอยู่
const prisma = require('../config/prismaClient');

function toStartOfDay(dateValue) {
    const value = new Date(dateValue);
    if (Number.isNaN(value.getTime())) return null;
    value.setHours(0, 0, 0, 0);
    return value;
}

function addDays(dateValue, days) {
    const next = new Date(dateValue);
    next.setDate(next.getDate() + days);
    return next;
}

async function listHolidays() {
    return prisma.bookingHoliday.findMany({ orderBy: { date: 'asc' } });
}

// คืนรายการวันหยุดที่ "ทับ" ช่วง [startDate, endDate] (รวมปลายทั้งสองข้าง)
async function getHolidaysInRange(startDate, endDate) {
    const start = toStartOfDay(startDate);
    const end = toStartOfDay(endDate);
    if (!start || !end) return [];
    return prisma.bookingHoliday.findMany({
        where: { date: { gte: start, lte: end } },
        orderBy: { date: 'asc' }
    });
}

async function isDateHoliday(dateValue) {
    const date = toStartOfDay(dateValue);
    if (!date) return false;
    const found = await prisma.bookingHoliday.findUnique({ where: { date } });
    return Boolean(found);
}

// จำนวนวันที่ "คิดเงินได้จริง" ในช่วง [startDate, endDate] (รวมปลายทั้งสองข้าง) = จำนวนวันปฏิทิน - วันหยุดที่ทับช่วงนี้
// (ไม่ต่ำกว่า 0 — ถ้าทั้งช่วงเป็นวันหยุดหมดเลยจะได้ 0 ซึ่งต้องกันไม่ให้จองได้ตั้งแต่ชั้น validation)
async function getBillableDays(startDate, endDate) {
    const start = toStartOfDay(startDate);
    const end = toStartOfDay(endDate);
    if (!start || !end || end < start) return 0;

    const calendarDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const holidays = await getHolidaysInRange(start, end);
    return Math.max(0, calendarDays - holidays.length);
}

async function createHoliday({ date, label, createdBy }) {
    const normalizedDate = toStartOfDay(date);
    if (!normalizedDate) throw new Error('invalid_date');
    const trimmedLabel = String(label || '').trim();
    if (!trimmedLabel) throw new Error('invalid_label');
    return prisma.bookingHoliday.create({
        data: { date: normalizedDate, label: trimmedLabel, createdBy: createdBy || null }
    });
}

// เพิ่มวันหยุดเป็นช่วง (from..to รวมปลายทั้งสองข้าง) ในคำเดียว เช่น "สงกรานต์ 13-15 เม.ย." — ข้ามวันที่ซ้ำที่มีอยู่แล้วเงียบๆ
async function createHolidayRange({ from, to, label, createdBy }) {
    const start = toStartOfDay(from);
    const end = toStartOfDay(to || from);
    if (!start || !end || end < start) throw new Error('invalid_date');
    const trimmedLabel = String(label || '').trim();
    if (!trimmedLabel) throw new Error('invalid_label');

    const dates = [];
    let cursor = start;
    while (cursor.getTime() <= end.getTime()) {
        dates.push(new Date(cursor));
        cursor = addDays(cursor, 1);
    }

    const existing = await prisma.bookingHoliday.findMany({
        where: { date: { in: dates } },
        select: { date: true }
    });
    const existingTimes = new Set(existing.map((h) => h.date.getTime()));
    const toCreate = dates.filter((d) => !existingTimes.has(d.getTime()));

    if (toCreate.length) {
        await prisma.bookingHoliday.createMany({
            data: toCreate.map((date) => ({ date, label: trimmedLabel, createdBy: createdBy || null }))
        });
    }

    return { createdCount: toCreate.length, skippedCount: dates.length - toCreate.length };
}

async function deleteHoliday(id) {
    const holidayId = Number.parseInt(id, 10);
    if (!Number.isInteger(holidayId)) throw new Error('invalid_id');
    return prisma.bookingHoliday.delete({ where: { id: holidayId } });
}

module.exports = {
    listHolidays,
    getHolidaysInRange,
    isDateHoliday,
    getBillableDays,
    createHoliday,
    createHolidayRange,
    deleteHoliday
};
