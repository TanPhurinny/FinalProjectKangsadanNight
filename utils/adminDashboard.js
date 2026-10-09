const prisma = require('../config/prismaClient');
const { addDays, getBookingRoundMetaForDate, getRoundWindow } = require('./bookingRound');
const { BOOKING_REQUEST_TAG_PREFIX, buildBookingRequestTag, extractBookingRequestId } = require('./bookingRequestTag');

// ข้อมูลส่วนเสริมของแดชบอร์ดแอดมิน (/admin/dashboard) — แยกจาก marketController ให้ controller ไม่บวม
// ทุกฟังก์ชันอ่านอย่างเดียว ไม่แก้ข้อมูล

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

// Booking หลายแถวของคำขอเดียวเก็บยอดของทั้งคำขอซ้ำกัน — เอาแถวแรกต่อคำขอเท่านั้น (เหมือนหน้ารายการอนุมัติ)
function firstBookingByRequest(bookings) {
    const map = new Map();
    bookings.forEach((booking) => {
        const requestId = extractBookingRequestId(booking.storeDetailSnapshot);
        if (requestId && !map.has(requestId)) map.set(requestId, booking);
    });
    return map;
}

// แยกยอดเป็น ค่าเช่า / ค่าไฟแสงสว่าง / เครื่องใช้ไฟฟ้า / อื่นๆ (ส่วนต่างจาก grandTotal เช่นค่าต่อสัญญา)
function splitAmount(booking) {
    const grand = Number(booking?.grandTotal || 0);
    const rent = Number(booking?.rentTotal || 0);
    const light = Number(booking?.lightTotal || 0);
    const appliance = Number(booking?.applianceTotal || 0);
    const other = Math.max(0, grand - rent - light - appliance);
    return { grand, rent, light, appliance, other };
}

// รายได้ที่ยืนยันชำระแล้ว 14 วันล่าสุด (ตาม paymentConfirmedAt) รายวัน + แยกประเภท + แยกโซน
// และยอด 14 วันก่อนหน้าไว้เทียบ
async function buildRevenue(today) {
    const from = addDays(today, -27);
    const currentFrom = addDays(today, -13);
    const paid = await prisma.bookingRequest.findMany({
        where: { status: 'SUCCESS', paymentConfirmedAt: { gte: from } },
        select: { id: true, paymentConfirmedAt: true, zone: true }
    });
    const bookings = paid.length
        ? await prisma.booking.findMany({
            where: { OR: paid.map((request) => ({ storeDetailSnapshot: { startsWith: buildBookingRequestTag(request.id) } })) },
            select: { storeDetailSnapshot: true, grandTotal: true, rentTotal: true, lightTotal: true, applianceTotal: true, zoneCode: true }
        })
        : [];
    const bookingByRequest = firstBookingByRequest(bookings);

    const days = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
        const date = addDays(today, -offset);
        days.push({ key: dayKey(date), date, amount: 0, count: 0 });
    }
    const dayIndex = new Map(days.map((day, index) => [day.key, index]));
    const byType = { rent: 0, light: 0, appliance: 0, other: 0 };
    const byZone = new Map();
    let previousTotal = 0;

    paid.forEach((request) => {
        const booking = bookingByRequest.get(request.id);
        const parts = splitAmount(booking);
        const index = dayIndex.get(dayKey(request.paymentConfirmedAt));
        if (index !== undefined) {
            days[index].amount += parts.grand;
            days[index].count += 1;
            byType.rent += parts.rent;
            byType.light += parts.light;
            byType.appliance += parts.appliance;
            byType.other += parts.other;
            const zone = String(booking?.zoneCode || request.zone || '-').trim().toUpperCase() || '-';
            const entry = byZone.get(zone) || { zone, amount: 0, count: 0 };
            entry.amount += parts.grand;
            entry.count += 1;
            byZone.set(zone, entry);
        } else if (request.paymentConfirmedAt < currentFrom) {
            previousTotal += parts.grand;
        }
    });

    const total = days.reduce((sum, day) => sum + day.amount, 0);
    return {
        days: days.map((day) => ({
            key: day.key,
            label: day.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
            weekday: day.date.toLocaleDateString('th-TH', { weekday: 'short' }),
            amount: Math.round(day.amount),
            count: day.count
        })),
        total: Math.round(total),
        count: days.reduce((sum, day) => sum + day.count, 0),
        previousTotal: Math.round(previousTotal),
        changePercent: previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null,
        byType: Object.fromEntries(Object.entries(byType).map(([key, value]) => [key, Math.round(value)])),
        byZone: [...byZone.values()]
            .map((entry) => ({ ...entry, amount: Math.round(entry.amount) }))
            .sort((a, b) => b.amount - a.amount)
    };
}

// คาดการณ์รายได้ของรอบปัจจุบัน: คำขอที่วันเริ่มขายอยู่ในรอบนี้ แยกเป็น
// ยืนยันแล้ว (SUCCESS) / จัดล็อกแล้วรอโอน (IN_PROGRESS) / ยังไม่จัดล็อก (PENDING, APPROVED)
async function buildRoundForecast(now) {
    const meta = getBookingRoundMetaForDate(now);
    const window = getRoundWindow(meta.roundNumber);
    const windowEnd = addDays(window.cycleEnd, 1);
    const bookings = await prisma.booking.findMany({
        where: {
            storeDetailSnapshot: { startsWith: BOOKING_REQUEST_TAG_PREFIX },
            rentalStartDate: { gte: window.cycleStart, lt: windowEnd }
        },
        select: { storeDetailSnapshot: true, grandTotal: true }
    });
    const bookingByRequest = firstBookingByRequest(bookings);
    const requests = bookingByRequest.size
        ? await prisma.bookingRequest.findMany({
            where: { id: { in: [...bookingByRequest.keys()] } },
            select: { id: true, status: true }
        })
        : [];

    const buckets = {
        confirmed: { amount: 0, count: 0 },
        awaiting: { amount: 0, count: 0 },
        unassigned: { amount: 0, count: 0 }
    };
    requests.forEach((request) => {
        const amount = Number(bookingByRequest.get(request.id)?.grandTotal || 0);
        let key = null;
        if (request.status === 'SUCCESS') key = 'confirmed';
        else if (request.status === 'IN_PROGRESS') key = 'awaiting';
        else if (request.status === 'PENDING' || request.status === 'APPROVED') key = 'unassigned';
        if (!key) return;
        buckets[key].amount += amount;
        buckets[key].count += 1;
    });
    Object.values(buckets).forEach((bucket) => { bucket.amount = Math.round(bucket.amount); });

    return {
        roundNumber: meta.roundNumber,
        ...buckets,
        potential: buckets.confirmed.amount + buckets.awaiting.amount + buckets.unassigned.amount
    };
}

// ผลตรวจตลาดย้อนหลัง 7 วัน แยกโซน × วัน: ตรวจกี่ร้าน (มีบันทึกประเภทใดก็ได้ของวันนั้น) และพบปัญหากี่ร้าน
// (บันทึกล่าสุดของวันนั้นในแต่ละประเภทยังมีปัญหา — นิยามเดียวกับ utils/inspectionToday.js)
async function buildInspectionHeatmap(today, zones) {
    const from = addDays(today, -6);
    const where = { createdAt: { gte: from } };
    const newestFirst = { orderBy: { createdAt: 'desc' } };
    const [checks, issues, excesses, cleanliness] = await Promise.all([
        prisma.stallInspectionCheckRecord.findMany({ where, select: { stallId: true, createdAt: true } }),
        prisma.stallIssueRecord.findMany({ where, ...newestFirst, select: { stallId: true, createdAt: true, noShow: true, sublease: true, otherMarket: true, wrongSeller: true, otherIssueNote: true } }),
        prisma.stallElectricExcessRecord.findMany({ where, ...newestFirst, select: { stallId: true, createdAt: true, smallCount: true, largeCount: true } }),
        prisma.stallCleanlinessInspection.findMany({ where, ...newestFirst, select: { stallId: true, createdAt: true, overallPassed: true } })
    ]);

    const stallIds = [...new Set([...checks, ...issues, ...excesses, ...cleanliness].map((record) => record.stallId))];
    const stalls = stallIds.length
        ? await prisma.stall.findMany({ where: { id: { in: stallIds } }, select: { id: true, row: { select: { zoneId: true } } } })
        : [];
    const zoneIdByStall = new Map(stalls.map((stall) => [stall.id, stall.row?.zoneId]));

    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = addDays(today, -offset);
        days.push({
            key: dayKey(date),
            label: date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
            weekday: date.toLocaleDateString('th-TH', { weekday: 'short' })
        });
    }

    // inspected[key] = Set ของ stallId ที่มีบันทึกในวันนั้น, problem[key] = Set ของ stallId ที่มีปัญหา
    const inspected = new Map();
    const problem = new Map();
    const latestSeen = new Set(); // กันนับบันทึกเก่ากว่าของประเภทเดียวกัน วันเดียวกัน ล็อกเดียวกัน
    const add = (map, key, stallId) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(stallId);
    };
    const visit = (type, records, hasProblem) => {
        records.forEach((record) => {
            const key = dayKey(record.createdAt);
            add(inspected, key, record.stallId);
            if (!hasProblem) return;
            const seenKey = `${type}|${key}|${record.stallId}`;
            if (latestSeen.has(seenKey)) return;
            latestSeen.add(seenKey);
            if (hasProblem(record)) add(problem, key, record.stallId);
        });
    };
    visit('check', checks, null);
    visit('issue', issues, (r) => r.noShow || r.sublease || r.otherMarket || r.wrongSeller || Boolean(String(r.otherIssueNote || '').trim()));
    visit('excess', excesses, (r) => r.smallCount > 0 || r.largeCount > 0);
    visit('clean', cleanliness, (r) => !r.overallPassed);

    const countInZone = (set, zoneId) => (set ? [...set].filter((id) => zoneIdByStall.get(id) === zoneId).length : 0);
    let maxProblems = 0;
    const rows = zones.map((zone) => {
        const cells = days.map((day) => {
            const inspectedCount = countInZone(inspected.get(day.key), zone.id);
            const problemCount = countInZone(problem.get(day.key), zone.id);
            maxProblems = Math.max(maxProblems, problemCount);
            return { inspected: inspectedCount, problems: problemCount };
        });
        return { code: zone.code, name: zone.name, cells };
    });

    return {
        days,
        rows,
        maxProblems,
        hasData: rows.some((row) => row.cells.some((cell) => cell.inspected > 0))
    };
}

// ร้านที่ถูกเปิดดูมากสุด 7 วันล่าสุด (ตาราง ShopViewEvent ไม่มีข้อมูลผู้ดู)
async function buildTopViewedShops(today, limit = 5) {
    const grouped = await prisma.shopViewEvent.groupBy({
        by: ['shopUserId', 'kind'],
        where: { createdAt: { gte: addDays(today, -6) } },
        _count: { _all: true }
    });
    const byShop = new Map();
    grouped.forEach((group) => {
        const entry = byShop.get(group.shopUserId) || { userId: group.shopUserId, total: 0, card: 0, menu: 0, share: 0 };
        entry[group.kind] = (entry[group.kind] || 0) + group._count._all;
        entry.total += group._count._all;
        byShop.set(group.shopUserId, entry);
    });
    const top = [...byShop.values()].sort((a, b) => b.total - a.total).slice(0, limit);
    if (!top.length) return [];

    const [users, latestCodes] = await Promise.all([
        prisma.user.findMany({
            where: { id: { in: top.map((entry) => entry.userId) } },
            select: { id: true, name: true, shop: { select: { shopName: true } } }
        }),
        prisma.shopViewEvent.findMany({
            where: { shopUserId: { in: top.map((entry) => entry.userId) } },
            orderBy: { createdAt: 'desc' },
            distinct: ['shopUserId'],
            select: { shopUserId: true, stallCode: true }
        })
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const codeByUser = new Map(latestCodes.map((row) => [row.shopUserId, row.stallCode]));
    return top.map((entry) => {
        const u = userById.get(entry.userId);
        return {
            ...entry,
            shopName: u?.shop?.shopName || u?.name || `ผู้ขาย #${entry.userId}`,
            ownerName: u?.name || '',
            stallCode: codeByUser.get(entry.userId) || ''
        };
    });
}

// ข้อมูลสำหรับปุ่ม "ทำได้เลย" บนแดชบอร์ด
// - สลิปที่ระบบตรวจยอดตรงแล้ว แยกตามรอบ (endpoint confirm-verified-slips ทำทีละรอบ)
// - ล็อกใกล้หมดที่ยังไม่ได้ส่งแจ้งเตือนสำหรับวันหมดสัญญาปัจจุบัน
async function buildQuickActions(upcomingStalls) {
    const verified = await prisma.bookingRequest.findMany({
        where: { status: 'IN_PROGRESS', paymentSlipImage: { not: null }, slipVerified: true, paymentConfirmedAt: null },
        select: { id: true, createdAt: true }
    });
    const linked = verified.length
        ? await prisma.booking.findMany({
            where: { OR: verified.map((request) => ({ storeDetailSnapshot: { startsWith: buildBookingRequestTag(request.id) } })) },
            select: { storeDetailSnapshot: true, rentalStartDate: true }
        })
        : [];
    const linkedByRequest = firstBookingByRequest(linked);
    const slipRounds = new Map();
    verified.forEach((request) => {
        const basis = linkedByRequest.get(request.id)?.rentalStartDate || request.createdAt;
        const roundNumber = getBookingRoundMetaForDate(basis).roundNumber;
        slipRounds.set(roundNumber, (slipRounds.get(roundNumber) || 0) + 1);
    });

    const codes = upcomingStalls.map((stall) => stall.code);
    const notices = codes.length
        ? await prisma.stallRenewalNotice.findMany({
            where: { stallCode: { in: codes } },
            select: { stallCode: true, bookingEndDate: true }
        })
        : [];
    const noticed = new Set(notices.map((notice) => `${notice.stallCode}|${dayKey(notice.bookingEndDate)}`));
    const unnotified = upcomingStalls
        .filter((stall) => !noticed.has(`${stall.code}|${dayKey(stall.endDate)}`))
        .map((stall) => stall.code);

    return {
        verifiedSlips: [...slipRounds.entries()]
            .map(([roundNumber, count]) => ({ roundNumber, count }))
            .sort((a, b) => a.roundNumber - b.roundNumber),
        unnotifiedCodes: unnotified,
        noticedCodes: codes.filter((code) => !unnotified.includes(code))
    };
}

module.exports = {
    DAY_MS,
    buildRevenue,
    buildRoundForecast,
    buildInspectionHeatmap,
    buildTopViewedShops,
    buildQuickActions
};
