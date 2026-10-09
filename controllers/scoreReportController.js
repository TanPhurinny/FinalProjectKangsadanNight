const prisma = require('../config/prismaClient');
const {
    getBookingRoundMetaForDate,
    addDays,
    toStartOfDay
} = require('../utils/bookingRound');
const { getRoundCalendarDates, toDateKey } = require('../utils/inspectionScoring');

// หมายเหตุสำคัญ: ตัวตนร้านค้าที่ระบบใช้งานจริงคือ User (role SELLER) + ShopDetail — ไม่ใช่ Seller model
// (ตรวจสอบแล้วว่าไม่มีที่ไหนในโค้ดทั้งระบบเรียก prisma.seller.create() เลย ตาราง Seller ว่างเปล่าเสมอ
// Booking.sellerId/BookingItem จึงไม่เคยถูกเติมข้อมูลจริง) รหัส "seller" ในไฟล์นี้จึงหมายถึง User.id เสมอ
function sellerDisplayName(sellerUser) {
    return sellerUser?.shop?.shopName || sellerUser?.name || `ผู้ใช้ #${sellerUser?.id ?? '-'}`;
}

const REQUEST_TAG_REGEX = /\[BOOKING_REQUEST_ID:(\d+)\]/;

// เหมือน parseStallCodes ใน approvalController.js/staffInspectionController.js
function parseStallCodes(assignedStallCodeText) {
    return String(assignedStallCodeText || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

// ดึง Booking ที่จ่ายเงินแล้วจริง (status SUCCESS — ตั้งพร้อมกับ BookingRequest ตอน confirmPayment
// ดู approvalController.js) และช่วงเช่าทับซ้อนกับ [rangeStart, rangeEnd] ใช้ Booking.rentalStartDate/
// rentalEndDate เป็นตัวจริงว่าร้านเช่าวันไหนบ้าง ส่วนล็อคที่ได้จริงต้องเดินตาม storeDetailSnapshot
// (tag "[BOOKING_REQUEST_ID:x]") กลับไปหา BookingRequest.assignedStallCode เพราะ BookingItem ไม่เคยถูกใช้
async function getSellerStallOccupancy(rangeStart, rangeEnd) {
    const bookings = await prisma.booking.findMany({
        where: {
            status: 'SUCCESS',
            rentalStartDate: { not: null, lte: rangeEnd },
            rentalEndDate: { not: null, gte: rangeStart }
        },
        select: {
            id: true,
            userId: true,
            rentalStartDate: true,
            rentalEndDate: true,
            storeDetailSnapshot: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    isBlacklisted: true,
                    blacklistReason: true,
                    shop: { select: { shopName: true, productType: true, productDetail: true } }
                }
            }
        }
    });

    const requestIds = Array.from(new Set(
        bookings
            .map((booking) => {
                const match = String(booking.storeDetailSnapshot || '').match(REQUEST_TAG_REGEX);
                return match ? Number.parseInt(match[1], 10) : null;
            })
            .filter(Boolean)
    ));

    const requests = requestIds.length
        ? await prisma.bookingRequest.findMany({
            where: { id: { in: requestIds } },
            select: { id: true, assignedStallCode: true }
        })
        : [];
    const stallCodesByRequestId = new Map(
        requests.map((request) => [request.id, parseStallCodes(request.assignedStallCode)])
    );

    return bookings.map((booking) => {
        const match = String(booking.storeDetailSnapshot || '').match(REQUEST_TAG_REGEX);
        const requestId = match ? Number.parseInt(match[1], 10) : null;
        const stallCodes = requestId ? (stallCodesByRequestId.get(requestId) || []) : [];
        return { ...booking, stallCodes };
    });
}

// แตก Booking แต่ละใบเป็นรายการ (ร้าน, ล็อค, วัน) ทีละวัน คลิปตามช่วงที่สนใจ และไม่เกินวันนี้
// (วันในอนาคตยังไม่เกิดขึ้นจริง ตรวจไม่ได้)
function buildOccupancyEntries(bookings, rangeStart, rangeEnd) {
    const today = toStartOfDay(new Date());
    const entries = [];

    bookings.forEach((booking) => {
        if (!booking.user || !booking.stallCodes.length) return;

        const bookingStart = toStartOfDay(booking.rentalStartDate);
        const bookingEnd = toStartOfDay(booking.rentalEndDate);
        let cursor = bookingStart > rangeStart ? bookingStart : rangeStart;
        const clippedEnd = bookingEnd < rangeEnd ? bookingEnd : rangeEnd;
        const finalEnd = clippedEnd < today ? clippedEnd : today;

        while (cursor.getTime() <= finalEnd.getTime()) {
            const dateSnapshot = new Date(cursor);
            const dateKey = toDateKey(dateSnapshot);
            booking.stallCodes.forEach((stallCode) => {
                entries.push({
                    sellerId: booking.userId,
                    seller: booking.user,
                    stallCode,
                    date: dateSnapshot,
                    dateKey
                });
            });
            cursor = addDays(cursor, 1);
        }
    });

    return entries;
}

// ดึง event log 3 ตารางของ stallCode ที่เกี่ยวข้อง ในช่วงวันที่สนใจ แล้ว group เอา record
// ล่าสุด "ของแต่ละวัน" (ไม่ใช่ล่าสุดโดยรวม) — key = `${stallCode}|${dateKey}`
async function getDailyInspectionMaps(stallCodes, rangeStart, rangeEnd) {
    if (!stallCodes.length) {
        return { inspectionMap: new Map(), issueMap: new Map(), excessMap: new Map() };
    }

    const createdAtFilter = { gte: rangeStart, lt: addDays(rangeEnd, 1) };

    const [inspectionRecords, issueRecords, excessRecords] = await Promise.all([
        prisma.stallInspectionCheckRecord.findMany({
            where: { stallCode: { in: stallCodes }, createdAt: createdAtFilter },
            orderBy: { createdAt: 'desc' },
            select: { stallCode: true, isInspected: true, createdAt: true }
        }),
        prisma.stallIssueRecord.findMany({
            where: { stallCode: { in: stallCodes }, createdAt: createdAtFilter },
            orderBy: { createdAt: 'desc' },
            select: {
                stallCode: true,
                noShow: true,
                sublease: true,
                otherMarket: true,
                wrongSeller: true,
                otherIssueNote: true,
                createdAt: true
            }
        }),
        prisma.stallElectricExcessRecord.findMany({
            where: { stallCode: { in: stallCodes }, createdAt: createdAtFilter },
            orderBy: { createdAt: 'desc' },
            select: { stallCode: true, smallCount: true, largeCount: true, subtotal: true, note: true, createdAt: true }
        })
    ]);

    const inspectionMap = new Map();
    inspectionRecords.forEach((record) => {
        const key = `${record.stallCode}|${toDateKey(record.createdAt)}`;
        if (!inspectionMap.has(key)) inspectionMap.set(key, record.isInspected);
    });

    const issueMap = new Map();
    issueRecords.forEach((record) => {
        const key = `${record.stallCode}|${toDateKey(record.createdAt)}`;
        if (!issueMap.has(key)) issueMap.set(key, record);
    });

    const excessMap = new Map();
    excessRecords.forEach((record) => {
        const key = `${record.stallCode}|${toDateKey(record.createdAt)}`;
        if (!excessMap.has(key)) excessMap.set(key, record);
    });

    return { inspectionMap, issueMap, excessMap };
}

// ===== รายงานการมาขายรายร้าน (แทนระบบคะแนนเดิม) =====
// เกณฑ์ต่อ 1 รอบ (14 วัน): ขาดขายมากกว่า ABSENT_BLACKLIST_THRESHOLD วัน → "ควรพิจารณา Blacklist"
// (ระบบแค่แนะนำ ให้แอดมินตัดสินใจกด Blacklist เอง) ตั้งแต่ ABSENT_WATCH_THRESHOLD วัน → "เฝ้าระวัง"
const ABSENT_BLACKLIST_THRESHOLD = 5;
const ABSENT_WATCH_THRESHOLD = 3;

function dateKeyToDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// สถานะรายวันของแต่ละล็อก ตลอดประวัติ: 'present' (มีผลตรวจ/ตรวจแล้วว่าร้านอยู่) หรือ 'noShow' (บันทึกว่าไม่มาขาย)
// ใช้ "บันทึกล่าสุดของวันนั้น" ของตารางเช็กชื่อ/ปัญหา เหมือนรายงานตรวจตลาดรายวัน (noShow ชนะ present ของล็อกเดียวกัน)
async function loadStallDayStatuses(stallCodes) {
    const statusByStall = new Map();
    if (!stallCodes.length) return statusByStall;

    const where = { stallCode: { in: stallCodes } };
    const newestFirst = { orderBy: { createdAt: 'desc' } };
    const [checks, issues, excesses, cleans] = await Promise.all([
        prisma.stallInspectionCheckRecord.findMany({ where, ...newestFirst, select: { stallCode: true, isInspected: true, createdAt: true } }),
        prisma.stallIssueRecord.findMany({ where, ...newestFirst, select: { stallCode: true, noShow: true, sublease: true, otherMarket: true, wrongSeller: true, otherIssueNote: true, createdAt: true } }),
        prisma.stallElectricExcessRecord.findMany({ where, ...newestFirst, select: { stallCode: true, smallCount: true, largeCount: true, createdAt: true } }),
        prisma.stallCleanlinessInspection.findMany({ where, ...newestFirst, select: { stallCode: true, createdAt: true } })
    ]);

    const slotOf = (stallCode, createdAt) => {
        const code = String(stallCode).toUpperCase();
        if (!statusByStall.has(code)) statusByStall.set(code, new Map());
        const days = statusByStall.get(code);
        const key = toDateKey(createdAt);
        if (!days.has(key)) days.set(key, { present: false, noShow: false, checkSeen: false, issueSeen: false, excessSeen: false, problems: [] });
        return days.get(key);
    };

    checks.forEach((record) => {
        const slot = slotOf(record.stallCode, record.createdAt);
        if (slot.checkSeen) return;
        slot.checkSeen = true;
        if (record.isInspected) slot.present = true;
    });
    issues.forEach((record) => {
        const slot = slotOf(record.stallCode, record.createdAt);
        if (slot.issueSeen) return;
        slot.issueSeen = true;
        if (record.noShow) slot.noShow = true;
        else slot.present = true;
        if (record.sublease) slot.problems.push('ปล่อยเช่าช่วง');
        if (record.otherMarket) slot.problems.push('ไปขายตลาดอื่น');
        if (record.wrongSeller) slot.problems.push('คนขายไม่ตรงชื่อ');
        if (record.otherIssueNote && record.otherIssueNote.trim()) slot.problems.push(record.otherIssueNote.trim());
    });
    excesses.forEach((record) => {
        const slot = slotOf(record.stallCode, record.createdAt);
        slot.present = true;
        if (slot.excessSeen) return;
        slot.excessSeen = true;
        if (record.smallCount > 0 || record.largeCount > 0) slot.problems.push(`ไฟเกิน (เล็ก ${record.smallCount} / ใหญ่ ${record.largeCount})`);
    });
    cleans.forEach((record) => { slotOf(record.stallCode, record.createdAt).present = true; });

    return statusByStall;
}

// รวมสถานะรายวันของทุกล็อกที่ร้านถือ → Map(dateKey → 'present' | 'absent')
// ร้านที่มีหลายล็อก: ถือว่าขาดก็ต่อเมื่อไม่มีล็อกไหนมีคนขายเลย และมีอย่างน้อย 1 ล็อกที่บันทึกว่าไม่มา
function mergeSellerDays(stallCodes, statusByStall) {
    const days = new Map();
    stallCodes.forEach((code) => {
        const stallDays = statusByStall.get(code);
        if (!stallDays) return;
        stallDays.forEach((slot, dateKey) => {
            const status = slot.noShow ? 'noShow' : (slot.present ? 'present' : null);
            if (!status) return;
            const current = days.get(dateKey);
            if (status === 'present') days.set(dateKey, 'present');
            else if (!current) days.set(dateKey, 'absent');
        });
    });
    return days;
}

function formatDayLabel(date) {
    return date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}

// วันทั้งหมดของรอบ พร้อมสถานะของวันนั้น (ใช้วาดแถบ 14 วัน): present / absent / none (ยังไม่มีบันทึก) / future
function buildDayStrip(roundNumber, statusOf) {
    const todayKey = toDateKey(toStartOfDay(new Date()));
    return getRoundCalendarDates(roundNumber).map((date) => {
        const dateKey = toDateKey(date);
        const isFuture = dateKey > todayKey;
        return { dateKey, label: formatDayLabel(date), isToday: dateKey === todayKey, status: isFuture ? 'future' : (statusOf(dateKey) || 'none') };
    });
}

function summarizeSeller(sellerDays, roundNumber) {
    const roundsSold = new Set();
    let presentDays = 0;
    let absentDays = 0;
    let lastDateKey = null;

    sellerDays.forEach((status, dateKey) => {
        const dayRound = getBookingRoundMetaForDate(dateKeyToDate(dateKey)).roundNumber;
        if (status === 'present') roundsSold.add(dayRound);
        if (!lastDateKey || dateKey > lastDateKey) lastDateKey = dateKey;
        if (dayRound !== roundNumber) return;
        if (status === 'present') presentDays += 1;
        else absentDays += 1;
    });

    const todayKey = toDateKey(toStartOfDay(new Date()));
    const elapsedDays = getRoundCalendarDates(roundNumber).filter((date) => toDateKey(date) <= todayKey).length;
    const unrecordedDays = Math.max(elapsedDays - presentDays - absentDays, 0);

    let status = 'ok';
    if (absentDays > ABSENT_BLACKLIST_THRESHOLD) status = 'blacklist';
    else if (absentDays >= ABSENT_WATCH_THRESHOLD) status = 'watch';
    else if (!presentDays && !absentDays) status = 'nodata';

    const dayStrip = buildDayStrip(roundNumber, (dateKey) => sellerDays.get(dateKey));

    return {
        dayStrip,
        absentLabels: dayStrip.filter((day) => day.status === 'absent').map((day) => day.label),
        roundsCount: roundsSold.size,
        presentDays,
        absentDays,
        unrecordedDays,
        elapsedDays,
        lastDateKey,
        lastDateLabel: lastDateKey ? dateKeyToDate(lastDateKey).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : '',
        status
    };
}

exports.getSellerScoresPage = async (req, res) => {
    const isAdmin = req.user.role === 'ADMIN';
    const templateName = isAdmin ? 'admin/seller-scores' : 'staff/seller-scores';
    const basePath = isAdmin ? '/admin/sellers/scores' : '/staff/seller-scores';
    const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
    const requestedRound = Number.parseInt(req.query.round, 10);
    const roundNumber = Number.isFinite(requestedRound) ? requestedRound : currentRoundNumber;
    const baseView = {
        user: req.user,
        isAdmin,
        roundNumber,
        currentRoundNumber,
        basePath,
        blacklistThreshold: ABSENT_BLACKLIST_THRESHOLD,
        watchThreshold: ABSENT_WATCH_THRESHOLD
    };

    try {
        // ผู้ขายทุกร้านที่ถือล็อกอยู่ (แหล่งข้อมูลเดียวกับหน้าตรวจตลาด) รวมล็อกของร้านเดียวกัน
        const heldStalls = await require('./inspectionReportController').loadHeldStalls();
        const sellers = new Map();
        heldStalls.forEach((entry, stallCode) => {
            if (!entry.isHeld) return;
            const name = sellerDisplayName(entry.seller);
            if (!sellers.has(name)) sellers.set(name, { name, accountName: entry.seller.name, stallCodes: [] });
            sellers.get(name).stallCodes.push(stallCode);
        });

        const accountNames = Array.from(new Set(Array.from(sellers.values()).map((seller) => seller.accountName).filter(Boolean)));
        const [accounts, blacklistedUsers] = await Promise.all([
            accountNames.length
                ? prisma.user.findMany({ where: { role: 'SELLER', name: { in: accountNames } }, select: { id: true, name: true, isBlacklisted: true } })
                : [],
            prisma.user.findMany({
                where: { isBlacklisted: true },
                select: { id: true, name: true, blacklistReason: true, blacklistedAt: true, shop: { select: { shopName: true } } },
                orderBy: { blacklistedAt: 'desc' }
            })
        ]);
        const accountByName = new Map();
        accounts.forEach((account) => { if (!accountByName.has(account.name)) accountByName.set(account.name, account); });

        // ร้านที่ถูก Blacklist แล้วถือว่าปิดบัญชี ไม่ต้องตรวจตลาด → ไม่แสดงในตาราง (แอดมินดูได้ในส่วนแยกด้านล่าง)
        const activeSellers = Array.from(sellers.values()).filter((seller) => !accountByName.get(seller.accountName)?.isBlacklisted);
        const statusByStall = await loadStallDayStatuses(Array.from(new Set(activeSellers.flatMap((seller) => seller.stallCodes))));

        const statusOrder = { blacklist: 0, watch: 1, ok: 2, nodata: 3 };
        const rows = activeSellers.map((seller) => ({
            userId: accountByName.get(seller.accountName)?.id || null,
            sellerName: seller.name,
            stallCodes: seller.stallCodes.sort(),
            ...summarizeSeller(mergeSellerDays(seller.stallCodes, statusByStall), roundNumber),
            stallDetails: seller.stallCodes.sort().map((code) => {
                const stallDays = statusByStall.get(code) || new Map();
                const strip = buildDayStrip(roundNumber, (dateKey) => {
                    const slot = stallDays.get(dateKey);
                    return slot ? (slot.noShow ? 'absent' : (slot.present ? 'present' : null)) : null;
                });
                const problems = [];
                strip.forEach((day) => {
                    (stallDays.get(day.dateKey)?.problems || []).forEach((text) => problems.push({ label: day.label, text }));
                });
                return { code, strip, problems };
            })
        }));
        rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.absentDays - a.absentDays || a.sellerName.localeCompare(b.sellerName, 'th'));

        return res.render(templateName, {
            ...baseView,
            rows,
            blacklistedRows: isAdmin ? blacklistedUsers.map((blacklisted) => ({
                userId: blacklisted.id,
                sellerName: blacklisted.shop?.shopName || blacklisted.name,
                reason: blacklisted.blacklistReason || '',
                blacklistedAt: blacklisted.blacklistedAt
            })) : [],
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Seller attendance page error:', error);
        return res.status(500).render(templateName, {
            ...baseView,
            rows: [],
            blacklistedRows: [],
            error: 'ไม่สามารถโหลดข้อมูลการมาขายของร้านค้าได้',
            success: null
        });
    }
};

exports.toggleBlacklist = async (req, res) => {
    try {
        const userId = Number.parseInt(req.body.userId, 10);
        const shouldBlacklist = String(req.body.action) === 'blacklist';
        const reason = String(req.body.reason || '').trim();

        if (!userId) {
            return res.redirect('/admin/sellers/scores?error=missing_seller');
        }

        await prisma.user.update({
            where: { id: userId },
            data: shouldBlacklist ? {
                isBlacklisted: true,
                blacklistedAt: new Date(),
                blacklistReason: reason || null,
                blacklistedById: req.user.id
            } : {
                isBlacklisted: false,
                blacklistedAt: null,
                blacklistReason: null,
                blacklistedById: null
            }
        });

        return res.redirect('/admin/sellers/scores?success=updated');
    } catch (error) {
        console.error('Toggle blacklist error:', error);
        return res.redirect('/admin/sellers/scores?error=update_failed');
    }
};

// ใช้ร่วมกับรายงานตรวจตลาดรายวัน (controllers/inspectionReportController.js)
exports.reportHelpers = { getSellerStallOccupancy, buildOccupancyEntries, getDailyInspectionMaps, loadStallDayStatuses };
