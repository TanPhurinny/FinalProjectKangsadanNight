// สร้าง/ลบข้อมูลทดสอบระบบ "ต่อล็อก + ตัดสิทธิ์ 20:00" ให้ผู้ขาย Teddy (ล็อกโซน F ที่ว่างอยู่ 1 ล็อก) บน DB ที่ .env ชี้อยู่
//
//   node scripts/test-renewal-data.js setup [YYYY-MM-DD]   สร้างข้อมูลทดสอบ (วันขายสุดท้ายเริ่มต้น 2026-09-28)
//   node scripts/test-renewal-data.js states               จำลองทุกสถานะบนผัง/หน้าล็อกใกล้หมดอายุ (5 ล็อกโซน F ที่ว่างอยู่)
//   node scripts/test-renewal-data.js states-cleanup       คืนค่าเดิมของ states
//   node scripts/test-renewal-data.js cleanup              ลบทุกอย่างที่ทดสอบสร้าง (รวมคำขอต่อที่ทดสอบผ่านหน้าเว็บ) แล้วคืนค่าเดิม
//
// setup จดสถานะเดิมของ Stall / Slot ที่ถูกจองในโซน F ไว้ที่ scripts/.renewal-test-state.json
// cleanup อ่านไฟล์นั้นเพื่อคืนค่า — ห้ามลบไฟล์นี้ก่อนรัน cleanup
// ⚠️ DB นี้ถ้าเป็น DB กลางของทีม ให้รัน cleanup ทันทีหลังทดสอบเสร็จ
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prismaClient');

const STATE_FILE = path.join(__dirname, '.renewal-test-state.json');
const SELLER_USER_ID = 240001;
const SELLER_NAME = 'Teddy';
let STALL_CODE = null; // เลือกตอน setup: ล็อกโซน F ที่ว่างอยู่ ไม่เขียนทับล็อกจริงที่มีคนจองอยู่
const TEST_MARK = 'TEST-RENEWAL';

async function setup(endArg) {
    if (fs.existsSync(STATE_FILE)) {
        throw new Error('มี state ค้างอยู่แล้ว (scripts/.renewal-test-state.json) รัน cleanup ก่อน');
    }
    const endDate = new Date(`${endArg || '2026-09-28'}T00:00:00`);
    if (Number.isNaN(endDate.getTime())) throw new Error('รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 3);

    // ต้องเป็นล็อกที่มีทั้ง Stall (ผัง) และ Slot (ตารางจอง) คู่กัน — บางล็อกในผังไม่มี Slot
    const freeStalls = await prisma.stall.findMany({
        where: { status: 'AVAILABLE', stallCode: { startsWith: 'F' }, bookingEndDate: null },
        orderBy: { id: 'desc' }
    });
    const slots = await prisma.slot.findMany({ where: { slotNumber: { in: freeStalls.map((s) => s.stallCode) }, isAvailable: true } });
    const slotByCode = new Map(slots.map((s) => [s.slotNumber, s]));
    const stall = freeStalls.find((s) => slotByCode.has(s.stallCode));
    if (!stall) throw new Error('ไม่มีล็อกโซน F ที่ว่างและมี Slot คู่กันให้ใช้ทดสอบ');
    STALL_CODE = stall.stallCode;
    const slot = slotByCode.get(STALL_CODE);

    const maxReq = (await prisma.bookingRequest.aggregate({ _max: { id: true } }))._max.id || 0;
    const maxBooking = (await prisma.booking.aggregate({ _max: { id: true } }))._max.id || 0;
    const maxSlot = (await prisma.slot.aggregate({ _max: { id: true } }))._max.id || 0;
    const unavailableSlotIds = (await prisma.slot.findMany({ where: { isAvailable: false }, select: { id: true } })).map((s) => s.id);

    const request = await prisma.bookingRequest.create({
        data: {
            productName: TEST_MARK,
            description: TEST_MARK,
            sellerName: SELLER_NAME,
            phone: '-',
            zone: 'F',
            assignedStallCode: STALL_CODE,
            status: 'SUCCESS'
        }
    });
    const booking = await prisma.booking.create({
        data: {
            slotId: slot.id,
            userId: SELLER_USER_ID,
            status: 'SUCCESS',
            zoneCode: 'F',
            selectedZoneLabel: 'โซน F',
            stallCount: 1,
            rentalStartDate: startDate,
            rentalEndDate: endDate,
            rentalDays: 4,
            dailyStallPrice: 219,
            rentTotal: 876,
            grandTotal: 876,
            storeDetailSnapshot: `[BOOKING_REQUEST_ID:${request.id}] ${TEST_MARK}`
        }
    });
    await prisma.stall.update({
        where: { stallCode: STALL_CODE },
        data: { status: 'BOOKED', isAvailable: false, bookingStartDate: startDate, bookingEndDate: endDate }
    });
    await prisma.slot.update({ where: { id: slot.id }, data: { isAvailable: false } });

    fs.writeFileSync(STATE_FILE, JSON.stringify({
        stallCode: STALL_CODE, maxReq, maxBooking, maxSlot, unavailableSlotIds,
        stallBefore: { status: stall.status, isAvailable: stall.isAvailable, bookingStartDate: stall.bookingStartDate, bookingEndDate: stall.bookingEndDate },
        slotBefore: { id: slot.id, isAvailable: slot.isAvailable }
    }, null, 2));
    console.log(`setup เสร็จ: request #${request.id}, booking #${booking.id}, ${STALL_CODE} BOOKED ถึง ${endDate.toDateString()}`);
}

async function cleanup() {
    if (!fs.existsSync(STATE_FILE)) throw new Error('ไม่พบ state (ยังไม่ได้ setup หรือ cleanup ไปแล้ว)');
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    STALL_CODE = state.stallCode;

    // ลบเฉพาะแถวที่เกิดหลัง setup ของ Teddy (ทั้งข้อมูลทดสอบและคำขอต่อที่สร้างผ่านหน้าเว็บ)
    const deletedBookings = await prisma.booking.deleteMany({ where: { id: { gt: state.maxBooking }, userId: SELLER_USER_ID } });
    const deletedRequests = await prisma.bookingRequest.deleteMany({ where: { id: { gt: state.maxReq }, sellerName: SELLER_NAME } });
    const deletedSlots = await prisma.slot.deleteMany({ where: { id: { gt: state.maxSlot }, slotNumber: { contains: '-EXT' } } });

    // Slot ที่คำขอต่อไปจับ (isAvailable=false) ตอนทดสอบ ให้คืนเป็นว่าง ยกเว้นที่เคยไม่ว่างมาก่อน setup
    const restoredSlots = await prisma.slot.updateMany({
        where: { isAvailable: false, id: { notIn: state.unavailableSlotIds } },
        data: { isAvailable: true }
    });
    await prisma.slot.update({ where: { id: state.slotBefore.id }, data: { isAvailable: state.slotBefore.isAvailable } });
    await prisma.stall.update({ where: { stallCode: STALL_CODE }, data: state.stallBefore });

    fs.unlinkSync(STATE_FILE);
    console.log(`cleanup เสร็จ: ลบ booking ${deletedBookings.count}, request ${deletedRequests.count}, slot ${deletedSlots.count}, คืน slot ว่าง ${restoredSlots.count}, คืน ${STALL_CODE} เป็น ${state.stallBefore.status}`);
}

const STATES_FILE = path.join(__dirname, '.renewal-states-state.json');

function dayOffset(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
}

// จำลองทุกสถานะที่ระบบตัดสิน (ระดับ Stall เท่านั้น ไม่มี Booking/ผู้เช่า): ยังไม่ถึง / ใกล้ (พรุ่งนี้) / วันสุดท้ายก่อน 20:00 (grace)
// / เลย 20:00 (lapsed) / lapsed แต่มีคำขอต่อค้างอยู่ (job ต้องไม่ปล่อย) — ถ้ารันหลัง 20:00 ล็อก "วันนี้" จะเป็น lapsed แทน grace
async function states() {
    if (fs.existsSync(STATES_FILE)) throw new Error('มี states ค้างอยู่ รัน states-cleanup ก่อน');
    const free = await prisma.stall.findMany({
        where: { status: 'AVAILABLE', stallCode: { startsWith: 'F' }, bookingEndDate: null },
        orderBy: { id: 'desc' },
        take: 5
    });
    if (free.length < 5) throw new Error('ล็อกโซน F ที่ว่างไม่พอ 5 ล็อก');

    const plan = [
        { label: 'ยังไม่ถึงวันสุดท้าย (active)', end: dayOffset(6) },
        { label: 'พรุ่งนี้วันสุดท้าย (ต่อสั้นเปิดแล้ว)', end: dayOffset(1) },
        { label: 'วันนี้วันสุดท้าย (grace ถึง 20:00)', end: dayOffset(0) },
        { label: 'เลยวันสุดท้าย (lapsed)', end: dayOffset(-1) },
        { label: 'lapsed แต่มีคำขอต่อค้าง (ต้องไม่ถูกปล่อย)', end: dayOffset(-1), pendingExtension: true }
    ];

    const maxReq = (await prisma.bookingRequest.aggregate({ _max: { id: true } }))._max.id || 0;
    const originals = [];
    for (let i = 0; i < plan.length; i += 1) {
        const stall = free[i];
        const item = plan[i];
        const start = new Date(item.end);
        start.setDate(start.getDate() - 3);
        originals.push({ stallCode: stall.stallCode, status: stall.status, isAvailable: stall.isAvailable, bookingStartDate: stall.bookingStartDate, bookingEndDate: stall.bookingEndDate });
        await prisma.stall.update({ where: { id: stall.id }, data: { status: 'BOOKED', isAvailable: false, bookingStartDate: start, bookingEndDate: item.end } });
        await prisma.slot.updateMany({ where: { slotNumber: stall.stallCode }, data: { isAvailable: false } });
        if (item.pendingExtension) {
            const original = await prisma.bookingRequest.create({
                data: { productName: 'TEST-STATES', description: 'TEST-STATES', sellerName: 'TEST-STATES', phone: '-', zone: 'F', assignedStallCode: stall.stallCode, status: 'SUCCESS' }
            });
            await prisma.bookingRequest.create({
                data: { productName: 'TEST-STATES', description: `[EXTEND_OF:${original.id}] TEST-STATES`, sellerName: 'TEST-STATES', phone: '-', zone: 'F', status: 'PENDING' }
            });
        }
        console.log(`${stall.stallCode}: ${item.label} — ขายถึง ${item.end.toDateString()}`);
    }
    const slotsUnavailable = (await prisma.slot.findMany({ where: { isAvailable: false, slotNumber: { in: originals.map((o) => o.stallCode) } }, select: { id: true } })).length;
    fs.writeFileSync(STATES_FILE, JSON.stringify({ maxReq, originals, slotsUnavailable }, null, 2));
    console.log('เสร็จ ดูที่ /admin/slots และ /admin/slots/expiring ตอนจบต้องรัน states-cleanup');
}

async function statesCleanup() {
    if (!fs.existsSync(STATES_FILE)) throw new Error('ไม่พบ states state');
    const state = JSON.parse(fs.readFileSync(STATES_FILE, 'utf8'));
    const deleted = await prisma.bookingRequest.deleteMany({ where: { id: { gt: state.maxReq }, sellerName: 'TEST-STATES' } });
    for (const original of state.originals) {
        const { stallCode, ...data } = original;
        await prisma.stall.update({ where: { stallCode }, data });
        await prisma.slot.updateMany({ where: { slotNumber: stallCode }, data: { isAvailable: true } });
    }
    fs.unlinkSync(STATES_FILE);
    console.log(`states-cleanup เสร็จ: คืน ${state.originals.length} ล็อก, ลบคำขอ ${deleted.count}`);
}

(async () => {
    const [mode, arg] = process.argv.slice(2);
    try {
        if (mode === 'setup') await setup(arg);
        else if (mode === 'cleanup') await cleanup();
        else if (mode === 'states') await states();
        else if (mode === 'states-cleanup') await statesCleanup();
        else console.log('ใช้: node scripts/test-renewal-data.js setup [YYYY-MM-DD] | cleanup | states | states-cleanup');
    } catch (error) {
        console.error('ผิดพลาด:', error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
})();
