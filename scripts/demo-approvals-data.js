// ข้อมูลสาธิตหน้า "รายการจองรออนุมัติ" (/admin/approvals) ครบทุกขั้นตอน ทั้งคำขอจองใหม่และคำขอต่อล็อก บน DB ที่ .env ชี้อยู่
//
//   node scripts/demo-approvals-data.js seed      สร้างข้อมูลสาธิตในรอบปัจจุบัน (ผู้ขายสาธิต 14 ร้าน)
//   node scripts/demo-approvals-data.js cleanup   ลบทุกอย่างที่ seed สร้าง แล้วคืนล็อกที่ใช้เป็นสถานะเดิม
//
// seed จด id ที่สร้างและสถานะเดิมของล็อกไว้ที่ scripts/.demo-approvals-state.json — cleanup ลบตาม id ในไฟล์นี้เท่านั้น
// (ไม่ไล่คืนค่าแบบเหมารวม) ห้ามลบไฟล์นี้ก่อนรัน cleanup / ใช้เฉพาะล็อกที่ว่างและยังไม่มี Slot ไม่แตะล็อกที่มีคนจองจริง
// ⚠️ ถ้าเป็น DB กลางของทีม ข้อมูลนี้ทุกคนจะเห็น — รัน cleanup ทันทีหลังสาธิตเสร็จ
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays, getBookingRoundMetaForDate } = require('../utils/bookingRound');

const STATE_FILE = path.join(__dirname, '.demo-approvals-state.json');
const DEMO_MARK = 'DEMO-APPROVALS';
// รูปสลิปตัวอย่างเก็บในเครื่องเท่านั้น (public/uploads ถูก gitignore) — มีชื่อจริง ห้ามอัปขึ้น Cloudinary/commit
// ไม่มีไฟล์นี้ในเครื่องก็แค่รูปไม่ขึ้น ใส่รูปเองได้ที่ public/uploads/payment-slips/demo-slip.jpg
const SLIP_IMAGE = '/uploads/payment-slips/demo-slip.jpg';

// ราคาตามรูปแบบเดียวกับฟอร์มจอง (ค่าเช่า + ไฟ ต่อล็อกต่อวัน คูณวันที่คิดเงิน)
function priceFields(dailyStallPrice, stallCount, billableDays) {
    const rentTotal = dailyStallPrice * stallCount * billableDays;
    const lightTotal = 15 * stallCount * billableDays;
    return { dailyStallPrice, lightEnabled: true, lightUnitPrice: 15, rentTotal, lightTotal, applianceTotal: 0, grandTotal: rentTotal + lightTotal };
}

async function pickFreeStalls(zone, count) {
    const stalls = await prisma.stall.findMany({
        where: { status: 'AVAILABLE', bookingEndDate: null, stallCode: { startsWith: zone } },
        orderBy: { id: 'desc' },
        take: count + 30
    });
    const withSlot = new Set((await prisma.slot.findMany({
        where: { slotNumber: { in: stalls.map((s) => s.stallCode) } },
        select: { slotNumber: true }
    })).map((s) => s.slotNumber));
    const free = stalls.filter((s) => !withSlot.has(s.stallCode)).slice(0, count);
    if (free.length < count) throw new Error(`ล็อกว่างโซน ${zone} ไม่พอ`);
    return free;
}

async function seed() {
    if (fs.existsSync(STATE_FILE)) throw new Error('มี state ค้างอยู่ (scripts/.demo-approvals-state.json) รัน cleanup ก่อน');

    const now = new Date();
    const today = toStartOfDay(now);
    const round = getBookingRoundMetaForDate(now);
    const lastDayOfRound = toStartOfDay(round.cycleEnd);
    // วันเช่าทุกคำขออยู่ในรอบปัจจุบัน (ช่วงเช่าไม่เกินวันจบรอบ)
    const day = (offset) => {
        const date = addDays(today, offset);
        return date > lastDayOfRound ? lastDayOfRound : date;
    };
    const hoursAgo = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000);

    const stallPool = {
        A: await pickFreeStalls('A', 3),
        B: await pickFreeStalls('B', 3),
        C: await pickFreeStalls('C', 2),
        D: await pickFreeStalls('D', 2),
        F: await pickFreeStalls('F', 4)
    };
    const takeStall = (zone) => stallPool[zone].shift();

    const state = { users: [], requests: [], bookings: [], slots: [], stalls: [] };
    const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    save();

    const stamp = Date.now() % 100000;
    const slotByCode = {};
    async function holdStall(stall, startDate, endDate, booked) {
        if (!state.stalls.find((s) => s.stallCode === stall.stallCode)) {
            state.stalls.push({ stallCode: stall.stallCode, status: stall.status, isAvailable: stall.isAvailable, bookingStartDate: stall.bookingStartDate, bookingEndDate: stall.bookingEndDate });
        }
        if (!slotByCode[stall.stallCode]) {
            const slot = await prisma.slot.create({ data: { slotNumber: stall.stallCode, zone: stall.stallCode[0], price: Number(stall.basePrice || 219), isAvailable: !booked } });
            slotByCode[stall.stallCode] = slot;
            state.slots.push(slot.id);
        }
        if (booked) {
            await prisma.stall.update({ where: { stallCode: stall.stallCode }, data: { status: 'BOOKED', isAvailable: false, bookingStartDate: startDate, bookingEndDate: endDate } });
        }
        save();
        return slotByCode[stall.stallCode];
    }

    // คำขอที่ยังไม่ได้จัดล็อก Booking ยังต้องมี slotId — ใช้ Slot สาธิตกลาง 1 ช่อง ไม่ไปกันล็อกจริง
    let demoSlot = null;
    async function unassignedSlot() {
        if (!demoSlot) {
            demoSlot = await prisma.slot.create({ data: { slotNumber: `${DEMO_MARK}-${stamp}`, zone: 'F', price: 219, isAvailable: true } });
            state.slots.push(demoSlot.id);
            save();
        }
        return demoSlot;
    }

    async function seller(name, shop) {
        const user = await prisma.user.create({
            data: { username: `demo_appr_${state.users.length + 1}_${stamp}`, password: 'demo-no-login', name, role: 'SELLER', phoneNumber: `08${String(10000000 + state.users.length * 1111111).slice(0, 8)}` }
        });
        state.users.push(user.id);
        save();
        return { user, shop };
    }

    // สร้างคำขอ 1 รายการ + Booking ผูก tag เดียวกับระบบจริง
    async function request(owner, opts) {
        const stallCount = opts.stallCount || 1;
        const rentalDays = Math.round((opts.end - opts.start) / 86400000) + 1;
        const billableDays = opts.billableDays || rentalDays;
        const stall = opts.stall || null;
        const slot = stall
            ? await holdStall(stall, opts.stallStart || opts.start, opts.stallEnd || opts.end, opts.holdStall !== false)
            : await unassignedSlot();
        const dailyStallPrice = stall ? Number(stall.basePrice || 0) + Number(stall.extraPrice || 0) || 219 : 219;
        const record = await prisma.bookingRequest.create({
            data: {
                productName: owner.shop,
                sellerName: owner.user.name,
                phone: owner.user.phoneNumber,
                zone: opts.zone,
                description: opts.description || `${DEMO_MARK} ${owner.shop}`,
                status: opts.status,
                assignedStallCode: stall && opts.assign !== false ? stall.stallCode : null,
                lockAssignedAt: opts.lockAssignedAt || null,
                paymentSlipImage: opts.slip ? SLIP_IMAGE : null,
                slipVerified: opts.slipVerified ?? null,
                slipVerifyReason: opts.slipVerifyReason || null,
                paymentConfirmedAt: opts.status === 'SUCCESS' ? hoursAgo(20) : null,
                createdAt: opts.createdAt || hoursAgo(3)
            }
        });
        state.requests.push(record.id);
        save();
        for (let i = 0; i < (opts.bookingRows || 1); i += 1) {
            const booking = await prisma.booking.create({
                data: {
                    slotId: slot.id,
                    userId: owner.user.id,
                    status: opts.status,
                    zoneCode: opts.zone,
                    selectedZoneLabel: `โซน ${opts.zone}`,
                    stallCount,
                    rentalStartDate: opts.start,
                    rentalEndDate: opts.end,
                    rentalDays,
                    billableDays,
                    ...priceFields(dailyStallPrice, stallCount, billableDays),
                    storeDetailSnapshot: `[BOOKING_REQUEST_ID:${record.id}] ${opts.description ? opts.description.replace(/^\[[^\]]+\]\s*/, '') : owner.shop}`
                }
            });
            state.bookings.push(booking.id);
        }
        save();
        return record;
    }

    // ---------- คำขอจองใหม่ ----------
    // รอจัดล็อก: ขอ 2 ล็อก + สนใจล็อกเต็ง
    await request(await seller('สมศรี ใจดี', 'ข้าวมันไก่ป้าศรี'), {
        zone: 'A', status: 'PENDING', start: day(2), end: day(6), stallCount: 2, bookingRows: 2,
        description: `[สนใจแผงพิเศษ: แผงหัวมุม] ${DEMO_MARK} ข้าวมันไก่ต้ม-ทอด`, createdAt: hoursAgo(5)
    });
    // รอจัดล็อก: ส่งคำขอตั้งแต่รอบก่อน (จองล่วงหน้า) และช่วงเช่ามีวันหยุด คิดเงินน้อยกว่าวันเช่า
    await request(await seller('ธนพล แก้วมณี', 'หมูปิ้งนมสด'), {
        zone: 'C', status: 'PENDING', start: day(3), end: day(7), billableDays: 4, createdAt: addDays(round.cycleStart, -2)
    });
    // รอตรวจสลิป: ระบบตรวจสลิปผ่าน
    await request(await seller('วิภาวดี สุขสม', 'ชาไทยเย็นจัด'), {
        zone: 'B', status: 'IN_PROGRESS', stall: takeStall('B'), start: day(1), end: day(4), lockAssignedAt: hoursAgo(2), slip: true, slipVerified: true
    });
    // รอตรวจสลิป: ระบบตรวจสลิปพบปัญหา
    await request(await seller('ประเสริฐ ทองดี', 'เสื้อยืดสกรีนลาย'), {
        zone: 'D', status: 'IN_PROGRESS', stall: takeStall('D'), start: day(1), end: day(3), lockAssignedAt: hoursAgo(3), slip: true, slipVerified: false,
        slipVerifyReason: 'ยอดในสลิปไม่ตรง (โอน 200 บาท)'
    });
    // เลยกำหนดจ่าย: จัดล็อกแล้วเกิน 6 ชม. ยังไม่ส่งสลิป
    await request(await seller('กมลชนก ศรีสุข', 'ลูกชิ้นปิ้งนายหัว'), {
        zone: 'A', status: 'IN_PROGRESS', stall: takeStall('A'), start: day(1), end: day(3), lockAssignedAt: hoursAgo(9)
    });
    // รอผู้ขายจ่าย: เพิ่งจัดล็อก
    await request(await seller('ณัฐวุฒิ บุญมา', 'น้ำผลไม้ปั่น'), {
        zone: 'F', status: 'IN_PROGRESS', stall: takeStall('F'), start: day(1), end: day(5), lockAssignedAt: hoursAgo(1)
    });
    // จ่ายแล้ว
    await request(await seller('อรุณี พรหมมา', 'เครปญี่ปุ่น'), {
        zone: 'B', status: 'SUCCESS', stall: takeStall('B'), start: day(0), end: day(4), lockAssignedAt: hoursAgo(22), slip: true, slipVerified: true
    });
    // ปฏิเสธพร้อมเหตุผล
    await request(await seller('สุรชัย มากมี', 'ร้านกางเกงยีนส์'), {
        zone: 'D', status: 'REJECTED', start: day(2), end: day(5),
        description: `${DEMO_MARK} กางเกงยีนส์มือสอง [REJECT_REASON: ประเภทสินค้าซ้ำกับร้านข้างเคียงในโซน]`
    });

    // ---------- คำขอต่อล็อก (ต้องมีสัญญาเดิมที่จ่ายแล้วก่อน) ----------
    async function extension(name, shop, opts) {
        const owner = await seller(name, shop);
        const stall = takeStall(opts.zone);
        const original = await request(owner, {
            zone: opts.zone, status: 'SUCCESS', stall, start: addDays(opts.originalEnd, -3), end: opts.originalEnd, lockAssignedAt: hoursAgo(80), slip: true, slipVerified: true,
            createdAt: addDays(opts.originalEnd, -5)
        });
        const extendEnd = addDays(opts.originalEnd, opts.extendDays);
        const description = `[EXTEND_OF:${original.id}] ขอต่อล็อก ${stall.stallCode} ถึงวันที่ ${extendEnd.toLocaleDateString('th-TH')}${opts.reason ? ` [REJECT_REASON: ${opts.reason}]` : ''}`;
        const assigned = ['IN_PROGRESS', 'SUCCESS'].includes(opts.status);
        await request(owner, {
            zone: opts.zone, status: opts.status, stall, assign: assigned, holdStall: assigned && !opts.restored,
            start: addDays(opts.originalEnd, 1), end: extendEnd, stallStart: addDays(opts.originalEnd, -3),
            lockAssignedAt: opts.lockAssignedAt || null, description, createdAt: opts.createdAt || hoursAgo(4)
        });
        // ล็อกที่จัดให้คำขอต่อแล้ว: Stall ขยายถึงวันใหม่ (ยกเว้นกรณีเลยกำหนดจ่าย ที่ระบบคืนเป็นสัญญาเดิมแล้ว)
        if (!assigned || opts.restored) {
            await prisma.stall.update({ where: { stallCode: stall.stallCode }, data: { bookingStartDate: addDays(opts.originalEnd, -3), bookingEndDate: opts.originalEnd } });
        }
    }
    // รอจัดล็อก: สัญญาเดิมหมดพรุ่งนี้ (ต้องจัดก่อน 20:00 พรุ่งนี้)
    await extension('มานพ รักษ์ดี', 'ส้มตำแซ่บนัว', { zone: 'F', status: 'PENDING', originalEnd: day(1), extendDays: 4 });
    // รอจัดล็อก: สัญญาเดิมหมดวันนี้ (ด่วน / ถ้าเลย 20:00 ขึ้นป้ายแดง)
    await extension('ศิริพร แสงทอง', 'ขนมครกใบเตย', { zone: 'C', status: 'PENDING', originalEnd: day(0), extendDays: 3 });
    // รอผู้ขายจ่าย: จัดล็อกเดิมให้แล้ว
    await extension('ปิยะ นาคสุข', 'ไก่ทอดหาดใหญ่', { zone: 'A', status: 'IN_PROGRESS', originalEnd: day(2), extendDays: 4, lockAssignedAt: hoursAgo(1) });
    // เลยกำหนดจ่าย: ระบบคืนล็อกเป็นสัญญาเดิมแล้ว
    await extension('จันทร์เพ็ญ วงศ์ใหญ่', 'ไอศกรีมกะทิ', { zone: 'F', status: 'IN_PROGRESS', originalEnd: day(2), extendDays: 3, lockAssignedAt: hoursAgo(10), restored: true });
    // จ่ายแล้ว
    await extension('วีระ ศักดิ์ศรี', 'กาแฟโบราณ', { zone: 'F', status: 'SUCCESS', originalEnd: day(1), extendDays: 5, lockAssignedAt: hoursAgo(20) });
    // ปฏิเสธพร้อมเหตุผล
    await extension('ลำดวน พึ่งบุญ', 'ผัดไทยกุ้งสด', { zone: 'B', status: 'REJECTED', originalEnd: day(2), extendDays: 3, reason: 'ล็อกนี้ปิดซ่อมระบบไฟช่วงนั้น' });

    console.log(`seed เสร็จ: ผู้ขาย ${state.users.length} คน, คำขอ ${state.requests.length} รายการ, ล็อก ${state.stalls.map((s) => s.stallCode).join(', ')}`);
    console.log(`ดูได้ที่ /admin/approvals (รอบ #${round.roundNumber}) — สาธิตเสร็จแล้วรัน: node scripts/demo-approvals-data.js cleanup`);
}

async function cleanup() {
    if (!fs.existsSync(STATE_FILE)) throw new Error('ไม่พบ state (ยังไม่ได้ seed หรือ cleanup ไปแล้ว)');
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // คำขอที่เกิดระหว่างสาธิต (เช่นกดผ่านหน้าเว็บ) ของผู้ขายสาธิตด้วย
    const users = await prisma.user.findMany({ where: { id: { in: state.users } }, select: { name: true } });
    const extraRequests = await prisma.bookingRequest.findMany({ where: { sellerName: { in: users.map((u) => u.name) } }, select: { id: true } });
    const bookings = await prisma.booking.deleteMany({ where: { OR: [{ id: { in: state.bookings } }, { userId: { in: state.users } }] } });
    const requests = await prisma.bookingRequest.deleteMany({ where: { id: { in: [...state.requests, ...extraRequests.map((r) => r.id)] } } });
    await prisma.slot.deleteMany({ where: { id: { in: state.slots } } });
    for (const stall of state.stalls) {
        await prisma.stall.update({
            where: { stallCode: stall.stallCode },
            data: { status: stall.status, isAvailable: stall.isAvailable, bookingStartDate: stall.bookingStartDate, bookingEndDate: stall.bookingEndDate }
        });
    }
    await prisma.shopDetail.deleteMany({ where: { userId: { in: state.users } } });
    await prisma.user.deleteMany({ where: { id: { in: state.users } } });
    fs.unlinkSync(STATE_FILE);
    console.log(`cleanup เสร็จ: ลบคำขอ ${requests.count}, booking ${bookings.count}, ผู้ขาย ${state.users.length}, คืนล็อก ${state.stalls.length} ล็อก`);
}

const mode = process.argv[2];
(mode === 'cleanup' ? cleanup() : mode === 'seed' ? seed() : Promise.reject(new Error('ใช้: node scripts/demo-approvals-data.js seed|cleanup')))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('ผิดพลาด:', error.message);
        process.exit(1);
    });
