const ExcelJS = require('exceljs');
const prisma = require('../config/prismaClient');
const {
    getBookingRoundMetaForDate,
    getRoundWindow,
    addDays,
    toStartOfDay
} = require('../utils/bookingRound');
const {
    computeDailyStallScore,
    getRoundCalendarDates,
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
                    shop: { select: { shopName: true } }
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
            select: { stallCode: true, smallCount: true, largeCount: true, createdAt: true }
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

// สร้างรายงานของ "หนึ่งรอบ" — ใช้ทั้งหน้ารายงาน (staff/inspection-report) และตัว export .xlsx
// selectedDateKey (optional, 'YYYY-MM-DD'): ถ้าระบุ จะกรองคะแนนร้านค้า/สรุปปัญหาให้เหลือแค่วันนั้นวันเดียว
// แทนการเฉลี่ยทั้งรอบ (ใช้ให้หน้ารายงานสลับดูได้ทั้งแบบรอบและรายวัน)
async function buildRoundReport(roundNumber, selectedDateKey = null) {
    const { cycleStart, cycleEnd } = getRoundWindow(roundNumber);
    const { scored, occupancy } = await buildScoredEntries(cycleStart, cycleEnd);

    const today = toStartOfDay(new Date());
    const todayKey = toDateKey(today);
    const progressDateKey = selectedDateKey || todayKey;
    const progressDateSet = new Set(
        occupancy.filter((entry) => entry.dateKey === progressDateKey).map((entry) => entry.stallCode)
    );
    const progressInspectedSet = new Set(
        scored.filter((entry) => entry.dateKey === progressDateKey).map((entry) => entry.stallCode)
    );
    const inspectionProgressToday = {
        total: progressDateSet.size,
        inspected: progressInspectedSet.size,
        isComplete: progressDateSet.size > 0 && progressInspectedSet.size >= progressDateSet.size
    };

    // เฉลี่ยคะแนนของร้าน ต่อวัน (ถ้าร้านมีหลายล็อกวันเดียวกัน เฉลี่ยก่อนเป็นคะแนนรายวันของร้าน)
    const sellerDayScores = new Map();
    scored.forEach((entry) => {
        const key = `${entry.sellerId}|${entry.dateKey}`;
        if (!sellerDayScores.has(key)) sellerDayScores.set(key, []);
        sellerDayScores.get(key).push(entry.dailyScore);
    });

    const sellerDayAverage = new Map();
    sellerDayScores.forEach((scores, key) => {
        sellerDayAverage.set(key, average(scores));
    });

    // กราฟรายวันของทั้งรอบ: เฉลี่ยคะแนนร้านทั้งหมดในวันนั้น
    const calendarDates = getRoundCalendarDates(roundNumber);
    const dailyOverview = calendarDates.map((date) => {
        const dateKey = toDateKey(date);
        const dayScores = [];
        sellerDayAverage.forEach((value, key) => {
            if (key.endsWith(`|${dateKey}`)) dayScores.push(value);
        });
        return {
            dateKey,
            dateLabel: date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }),
            averageScore: average(dayScores),
            sellerCount: dayScores.length
        };
    });

    // คะแนนรอบต่อร้าน (เฉลี่ยคะแนนรายวันของร้านนั้น เฉพาะวันที่มีข้อมูล)
    // stallCodesByDate: ร้านหนึ่งอาจมีหลายล็อคพร้อมกัน — เก็บไว้แสดง "จำนวนล็อค" ต่อแถว กันสับสนว่าทำไมร้านเดียว
    // ครอบคลุมหลายล็อคที่ถูกตรวจ (คะแนนยังคงเฉลี่ยเป็นคะแนนเดียวต่อร้านต่อวันเหมือนเดิม ไม่แยกเป็นหลายแถว)
    const sellerRoundMap = new Map();
    scored.forEach((entry) => {
        if (!sellerRoundMap.has(entry.sellerId)) {
            sellerRoundMap.set(entry.sellerId, { seller: entry.seller, dayScoresByDate: new Map(), stallCodesByDate: new Map() });
        }
        const stallCodesByDate = sellerRoundMap.get(entry.sellerId).stallCodesByDate;
        if (!stallCodesByDate.has(entry.dateKey)) stallCodesByDate.set(entry.dateKey, new Set());
        stallCodesByDate.get(entry.dateKey).add(entry.stallCode);
    });
    sellerDayAverage.forEach((value, key) => {
        const [sellerIdText, dateKey] = key.split('|');
        const sellerId = Number(sellerIdText);
        if (!sellerRoundMap.has(sellerId)) return;
        sellerRoundMap.get(sellerId).dayScoresByDate.set(dateKey, value);
    });

    // แบบทั้งรอบ: เฉลี่ยคะแนนทุกวันที่มีข้อมูลของร้านนั้น / แบบรายวัน: ใช้คะแนนเฉพาะวันที่เลือกวันเดียว
    // (ร้านที่ไม่มีข้อมูลของวันนั้นจะไม่ถูกนับ ไม่ใช่ได้ 0 คะแนน — สอดคล้องกับ "ไม่มีข้อมูล" ของ scored)
    const sellerRows = Array.from(sellerRoundMap.entries()).map(([sellerId, info]) => {
        if (selectedDateKey) {
            if (!info.dayScoresByDate.has(selectedDateKey)) return null;
            return {
                sellerId,
                sellerName: sellerDisplayName(info.seller),
                isBlacklisted: Boolean(info.seller?.isBlacklisted),
                daysInspected: 1,
                stallCount: (info.stallCodesByDate.get(selectedDateKey) || new Set()).size,
                roundScore: info.dayScoresByDate.get(selectedDateKey)
            };
        }
        const dayValues = Array.from(info.dayScoresByDate.values());
        const allStallCodes = new Set();
        info.stallCodesByDate.forEach((codes) => codes.forEach((code) => allStallCodes.add(code)));
        return {
            sellerId,
            sellerName: sellerDisplayName(info.seller),
            isBlacklisted: Boolean(info.seller?.isBlacklisted),
            daysInspected: dayValues.length,
            stallCount: allStallCodes.size,
            roundScore: average(dayValues)
        };
    }).filter(Boolean).sort((a, b) => (a.roundScore ?? 101) - (b.roundScore ?? 101));

    // สรุปจำนวนครั้งที่พบปัญหาแต่ละประเภท — ทั้งรอบ หรือเฉพาะวันที่เลือก
    const scopedEntries = selectedDateKey ? scored.filter((entry) => entry.dateKey === selectedDateKey) : scored;
    const issueCounts = { noShow: 0, sublease: 0, otherMarket: 0, wrongSeller: 0, otherIssueNote: 0 };
    let electricSmallTotal = 0;
    let electricLargeTotal = 0;
    scopedEntries.forEach((entry) => {
        if (entry.issue?.noShow) issueCounts.noShow += 1;
        if (entry.issue?.sublease) issueCounts.sublease += 1;
        if (entry.issue?.otherMarket) issueCounts.otherMarket += 1;
        if (entry.issue?.wrongSeller) issueCounts.wrongSeller += 1;
        if (entry.issue?.otherIssueNote && entry.issue.otherIssueNote.trim()) issueCounts.otherIssueNote += 1;
        if (entry.excess) {
            electricSmallTotal += entry.excess.smallCount || 0;
            electricLargeTotal += entry.excess.largeCount || 0;
        }
    });

    return {
        roundNumber,
        cycleStart,
        cycleEnd,
        selectedDateKey,
        todayKey,
        inspectionProgressToday,
        dailyOverview,
        sellerRows,
        issueCounts,
        electricSmallTotal,
        electricLargeTotal,
        overallAverageScore: average(sellerRows.map((row) => row.roundScore).filter((value) => value !== null))
    };
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

// รับค่า ?date=YYYY-MM-DD จาก query — คืนค่าเฉพาะรูปแบบที่ถูกต้อง วันที่นอกรอบจะแค่ไม่มีข้อมูลให้แสดง (graceful)
function parseDateKeyParam(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

exports.getStaffReportPage = async (req, res) => {
    const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
    const requestedRound = Number.parseInt(req.query.round, 10);
    const roundNumber = Number.isFinite(requestedRound) ? requestedRound : currentRoundNumber;
    const selectedDateKey = parseDateKeyParam(req.query.date);

    try {
        const report = await buildRoundReport(roundNumber, selectedDateKey);

        return res.render('staff/inspection-report', {
            user: req.user,
            report,
            roundNumber,
            currentRoundNumber,
            selectedDateKey
        });
    } catch (error) {
        console.error('Staff inspection report error:', error);
        return res.status(500).render('staff/inspection-report', {
            user: req.user,
            report: null,
            roundNumber,
            currentRoundNumber,
            selectedDateKey,
            error: 'ไม่สามารถโหลดรายงานได้'
        });
    }
};

exports.exportStaffReportExcel = async (req, res) => {
    try {
        const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
        const requestedRound = Number.parseInt(req.query.round, 10);
        const roundNumber = Number.isFinite(requestedRound) ? requestedRound : currentRoundNumber;
        const selectedDateKey = parseDateKeyParam(req.query.date);
        const report = await buildRoundReport(roundNumber, selectedDateKey);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Kangsadan Night Market';
        workbook.created = new Date();

        const overviewSheet = workbook.addWorksheet('ภาพรวมรายวัน');
        overviewSheet.columns = [
            { header: 'วันที่', key: 'dateLabel', width: 14 },
            { header: 'คะแนนเฉลี่ย', key: 'averageScore', width: 14 },
            { header: 'จำนวนร้านที่ตรวจแล้ว', key: 'sellerCount', width: 20 }
        ];
        report.dailyOverview.forEach((day) => {
            overviewSheet.addRow({
                dateLabel: day.dateLabel,
                averageScore: day.averageScore !== null ? Number(day.averageScore.toFixed(1)) : '-',
                sellerCount: day.sellerCount
            });
        });
        overviewSheet.getRow(1).font = { bold: true };

        const sellerSheet = workbook.addWorksheet('คะแนนรายร้าน');
        sellerSheet.columns = [
            { header: 'ร้านค้า', key: 'sellerName', width: 28 },
            { header: 'คะแนน', key: 'roundScore', width: 14 },
            { header: 'จำนวนล็อค', key: 'stallCount', width: 14 },
            { header: 'จำนวนวันที่ตรวจ', key: 'daysInspected', width: 16 },
            { header: 'สถานะ', key: 'status', width: 16 }
        ];
        report.sellerRows.forEach((row) => {
            sellerSheet.addRow({
                sellerName: row.sellerName,
                roundScore: row.roundScore !== null ? Number(row.roundScore.toFixed(1)) : '-',
                stallCount: row.stallCount,
                daysInspected: row.daysInspected,
                status: row.isBlacklisted ? 'ถูก Blacklist' : 'ปกติ'
            });
        });
        sellerSheet.getRow(1).font = { bold: true };

        const summarySheet = workbook.addWorksheet('สรุปปัญหา');
        summarySheet.columns = [
            { header: 'หัวข้อ', key: 'label', width: 30 },
            { header: 'จำนวนครั้งที่พบ', key: 'count', width: 18 }
        ];
        summarySheet.addRows([
            { label: 'ไม่มาขาย', count: report.issueCounts.noShow },
            { label: 'ปล่อยเช่าช่วง', count: report.issueCounts.sublease },
            { label: 'ไปเปิดท้ายขายอื่น', count: report.issueCounts.otherMarket },
            { label: 'ขายไม่ตรง', count: report.issueCounts.wrongSeller },
            { label: 'ปัญหาอื่นๆ', count: report.issueCounts.otherIssueNote },
            { label: 'เครื่องใช้ไฟฟ้าเล็กเกิน (รวมจำนวนเครื่อง)', count: report.electricSmallTotal },
            { label: 'เครื่องใช้ไฟฟ้าใหญ่เกิน (รวมจำนวนเครื่อง)', count: report.electricLargeTotal }
        ]);
        summarySheet.getRow(1).font = { bold: true };

        const filenameSuffix = selectedDateKey ? `round-${roundNumber}-${selectedDateKey}` : `round-${roundNumber}`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="inspection-report-${filenameSuffix}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export inspection report error:', error);
        res.status(500).send('ไม่สามารถสร้างไฟล์รายงานได้');
    }
};

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
        }).sort((a, b) => (a.selectedRoundScore?.score ?? a.cumulativeScore ?? 101) - (b.selectedRoundScore?.score ?? b.cumulativeScore ?? 101));

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
