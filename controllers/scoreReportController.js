const prisma = require('../config/prismaClient');
const {
    getBookingRoundMetaForDate,
    addDays,
    toStartOfDay
} = require('../utils/bookingRound');
const {
    computeDailyStallScore,
    toDateKey,
    average
} = require('../utils/inspectionScoring');

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

// รวมทุกอย่างเป็นรายการแบน (flat) ของ "ล็อค+วันที่ที่ตรวจแล้วจริง" พร้อมคะแนนของวันนั้น
// วันที่ไม่มี record ตรวจสอบแล้ว (isInspected=true ของวันนั้นเป๊ะๆ) จะไม่ถูกนับ = ไม่มีข้อมูล ไม่ใช่ 0 คะแนน
async function buildScoredEntries(rangeStart, rangeEnd) {
    const bookings = await getSellerStallOccupancy(rangeStart, rangeEnd);
    const occupancy = buildOccupancyEntries(bookings, rangeStart, rangeEnd);
    const stallCodes = Array.from(new Set(occupancy.map((entry) => entry.stallCode)));
    const { inspectionMap, issueMap, excessMap } = await getDailyInspectionMaps(stallCodes, rangeStart, rangeEnd);

    const scored = [];
    occupancy.forEach((entry) => {
        const key = `${entry.stallCode}|${entry.dateKey}`;
        if (!inspectionMap.get(key)) return;

        const issue = issueMap.get(key) || null;
        const excess = excessMap.get(key) || null;
        const dailyScore = computeDailyStallScore({
            noShow: issue?.noShow,
            sublease: issue?.sublease,
            otherMarket: issue?.otherMarket,
            wrongSeller: issue?.wrongSeller,
            otherIssueNote: issue?.otherIssueNote,
            smallCount: excess?.smallCount,
            largeCount: excess?.largeCount
        });

        scored.push({
            ...entry,
            roundNumber: getBookingRoundMetaForDate(entry.date).roundNumber,
            dailyScore,
            issue,
            excess
        });
    });

    return { scored, occupancy, stallCodes };
}

// คะแนนสะสมของทุกร้าน = เฉลี่ยคะแนนรอบทุกรอบที่ร้านนั้นเคยขาย (ไม่ใช่เฉลี่ยรายวันตรงๆ
// เพื่อไม่ให้รอบที่มีวันขายเยอะมีน้ำหนักเกินรอบอื่น) คำนวณสดจาก booking แรกสุดถึงวันนี้
async function buildSellerScoreIndex() {
    const earliestBooking = await prisma.booking.findFirst({
        where: { status: 'SUCCESS', rentalStartDate: { not: null } },
        orderBy: { rentalStartDate: 'asc' },
        select: { rentalStartDate: true }
    });

    if (!earliestBooking?.rentalStartDate) {
        return new Map();
    }

    const rangeStart = toStartOfDay(earliestBooking.rentalStartDate);
    const today = toStartOfDay(new Date());
    const { scored } = await buildScoredEntries(rangeStart, today);

    const sellerDayScores = new Map();
    const sellerInfo = new Map();
    scored.forEach((entry) => {
        sellerInfo.set(entry.sellerId, entry.seller);
        const key = `${entry.sellerId}|${entry.dateKey}`;
        if (!sellerDayScores.has(key)) sellerDayScores.set(key, []);
        sellerDayScores.get(key).push(entry.dailyScore);
    });

    const sellerRoundDays = new Map();
    sellerDayScores.forEach((scores, key) => {
        const [sellerIdText, dateKey] = key.split('|');
        const sellerId = Number(sellerIdText);
        const dayAverage = average(scores);

        const [year, month, day] = dateKey.split('-').map(Number);
        const roundNumber = getBookingRoundMetaForDate(new Date(year, month - 1, day)).roundNumber;

        if (!sellerRoundDays.has(sellerId)) sellerRoundDays.set(sellerId, new Map());
        const roundMap = sellerRoundDays.get(sellerId);
        if (!roundMap.has(roundNumber)) roundMap.set(roundNumber, []);
        roundMap.get(roundNumber).push(dayAverage);
    });

    const result = new Map();
    sellerRoundDays.forEach((roundMap, sellerId) => {
        const rounds = Array.from(roundMap.entries())
            .map(([roundNumber, dayAverages]) => ({
                roundNumber,
                score: average(dayAverages),
                daysInspected: dayAverages.length
            }))
            .sort((a, b) => b.roundNumber - a.roundNumber);

        result.set(sellerId, {
            seller: sellerInfo.get(sellerId),
            cumulativeScore: average(rounds.map((round) => round.score)),
            latestRoundScore: rounds[0] || null,
            rounds
        });
    });

    return result;
}

exports.getSellerScoresPage = async (req, res) => {
    const isAdmin = req.user.role === 'ADMIN';
    const templateName = isAdmin ? 'admin/seller-scores' : 'staff/seller-scores';
    const basePath = isAdmin ? '/admin/sellers/scores' : '/staff/seller-scores';
    const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
    const requestedRound = Number.parseInt(req.query.round, 10);
    const roundNumber = Number.isFinite(requestedRound) ? requestedRound : currentRoundNumber;

    try {
        const scoreIndex = await buildSellerScoreIndex();
        const rows = Array.from(scoreIndex.entries()).map(([userId, info]) => {
            // คะแนน "รอบที่เลือก" ดูอยู่ — ไม่มีข้อมูลถ้าร้านนั้นไม่ได้ขาย/ไม่ถูกตรวจในรอบนี้
            const selectedRound = info.rounds.find((round) => round.roundNumber === roundNumber) || null;
            return {
                userId,
                sellerName: sellerDisplayName(info.seller),
                isBlacklisted: Boolean(info.seller?.isBlacklisted),
                blacklistReason: info.seller?.blacklistReason || '',
                selectedRoundScore: selectedRound,
                cumulativeScore: info.cumulativeScore,
                latestRoundScore: info.latestRoundScore,
                roundsCount: info.rounds.length
            };
        });

        // ผู้ขายที่มีสัญญาเช่าอยู่วันนี้แต่ยังไม่เคยถูกตรวจ — แสดงเป็น "ยังไม่มีข้อมูล" แทนการหายไปจากตาราง
        // แหล่งข้อมูลเดียวกับหน้าตรวจตลาด (คำขอ SUCCESS + ล็อกที่ยัง BOOKED) เพราะ Booking บางใบไม่มีวันเช่า
        const heldStalls = await require('./inspectionReportController').loadHeldStalls();
        const knownNames = new Set(rows.map((row) => row.sellerName));
        heldStalls.forEach((entry) => {
            if (!entry.isHeld) return;
            const name = sellerDisplayName(entry.seller);
            if (knownNames.has(name)) return;
            knownNames.add(name);
            rows.push({
                userId: null,
                sellerName: name,
                isBlacklisted: false,
                blacklistReason: '',
                selectedRoundScore: null,
                cumulativeScore: null,
                latestRoundScore: null,
                roundsCount: 0
            });
        });

        rows.sort((a, b) => (a.selectedRoundScore?.score ?? a.cumulativeScore ?? 101) - (b.selectedRoundScore?.score ?? b.cumulativeScore ?? 101));

        return res.render(templateName, {
            user: req.user,
            rows,
            isAdmin,
            roundNumber,
            currentRoundNumber,
            basePath,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Seller scores page error:', error);
        return res.status(500).render(templateName, {
            user: req.user,
            rows: [],
            isAdmin,
            roundNumber,
            currentRoundNumber,
            basePath,
            error: 'ไม่สามารถโหลดคะแนนร้านค้าได้',
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
exports.reportHelpers = { getSellerStallOccupancy, buildOccupancyEntries, getDailyInspectionMaps };
