const ExcelJS = require('exceljs');
const prisma = require('../config/prismaClient');
const { getBookingRoundMetaForDate, toStartOfDay, addDays } = require('../utils/bookingRound');
const { getRoundCalendarDates, toDateKey } = require('../utils/inspectionScoring');
const { normalizeProductType } = require('../utils/zoneAccess');
const { CLEANLINESS_CHECKLIST, CLEANLINESS_ITEM_IDS } = require('../utils/cleanlinessChecklist');
const { buildPreferredWalkOrder } = require('../utils/inspectionWalkOrder');
const { reportHelpers } = require('./scoreReportController');

// รายงานตรวจตลาด "รายวัน" ไม่เน้นคะแนน — งานตรวจปัญหา = มาขาย/ไม่มาขาย + ปัญหาย่อย (ไฟฟ้าเกิน ฯลฯ)
// งานตรวจความสะอาด = ผ่าน/ไม่ผ่านตาม overallPassed ที่บันทึกไว้ พร้อมข้อย่อยที่ไม่ผ่าน (แสดงทั้งร้านที่ผ่านและไม่ผ่าน)
// แยกรายวันเพราะร้านอาจไม่มาแค่วันเดียว ไม่ถือว่าไม่มาตลอดรอบ

const ISSUE_CATEGORIES = [
    { key: 'noShow', label: 'ไม่มาขาย' },
    { key: 'sublease', label: 'ปล่อยเช่าช่วง' },
    { key: 'otherMarket', label: 'ไปเปิดท้ายหรือขายอื่น' },
    { key: 'wrongSeller', label: 'ขายไม่ตรง (แจ้งเจ้าของล็อค)' },
    { key: 'electric', label: 'เครื่องใช้ไฟฟ้าเกิน' },
    { key: 'other', label: 'ปัญหาอื่นๆ' }
];

// id ข้อย่อย → { label, categoryId, categoryTitle } ใช้แปลงผล JSON ของเช็คลิสต์เป็นข้อความอ่านได้
const CHECKLIST_ITEM_INFO = {};
CLEANLINESS_CHECKLIST.forEach((category) => {
    category.items.forEach((item) => {
        CHECKLIST_ITEM_INFO[item.id] = { id: item.id, label: item.label, categoryId: category.id, categoryTitle: category.title };
    });
});

function parseDateKeyParam(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dateKeyToDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatThaiDate(date, withYear = false) {
    return date.toLocaleDateString('th-TH', withYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' });
}

// เลือกวันที่แสดง: ตามที่ขอถ้าอยู่ในรอบ → ไม่งั้นวันนี้ (ถ้าอยู่ในรอบ) → ไม่งั้นวันล่าสุดที่ไม่เกินวันนี้ → วันแรกของรอบ
function pickDateKey(requestedKey, dayKeys, todayKey) {
    if (requestedKey && dayKeys.includes(requestedKey)) return requestedKey;
    if (dayKeys.includes(todayKey)) return todayKey;
    const pastKeys = dayKeys.filter((key) => key <= todayKey);
    return pastKeys.length ? pastKeys[pastKeys.length - 1] : dayKeys[0];
}

async function getCleanlinessMap(stallCodes, dayStart) {
    if (!stallCodes.length) return new Map();
    const records = await prisma.stallCleanlinessInspection.findMany({
        where: {
            stallCode: { in: stallCodes },
            createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) }
        },
        orderBy: { createdAt: 'desc' },
        select: { stallCode: true, itemResults: true, overallPassed: true, note: true, createdAt: true }
    });

    // เรียงใหม่→เก่า เก็บแถวแรกต่อล็อค = ผลล่าสุดของวันนั้น
    const map = new Map();
    records.forEach((record) => {
        if (!map.has(record.stallCode)) map.set(record.stallCode, record);
    });
    return map;
}

// ร้านที่ถือครองล็อกอยู่จริงตามหน้างานตรวจ (BookingRequest SUCCESS + Stall ยัง BOOKED) — ใช้เสริมจาก Booking
// เพราะ Booking.rentalEndDate หมดแล้วแต่ล็อกยังไม่ถูกปล่อย หน้างานตรวจก็ยังนับเป็นล็อกที่ต้องตรวจ
// และใช้เป็นข้อมูลร้านของล็อกที่มีผลตรวจแต่หา Booking ของวันนั้นไม่เจอ
async function loadHeldStalls() {
    const requests = await prisma.bookingRequest.findMany({
        where: { status: 'SUCCESS', assignedStallCode: { not: null } },
        select: {
            assignedStallCode: true,
            sellerName: true,
            productName: true,
            description: true,
            createdAt: true,
            seller: { select: { shopName: true, productDetail: true, productType: { select: { name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
    });

    const missingNames = [...new Set(
        requests.filter((r) => !r.seller?.productType?.name).map((r) => r.sellerName).filter(Boolean)
    )];
    const shopByName = {};
    if (missingNames.length) {
        const users = await prisma.user.findMany({
            where: { role: 'SELLER', name: { in: missingNames } },
            select: { name: true, shop: { select: { shopName: true, productType: true, productDetail: true } } }
        });
        users.forEach((user) => { if (user.shop) shopByName[user.name] = user.shop; });
    }

    const bookedStalls = await prisma.stall.findMany({ where: { status: 'BOOKED' }, select: { stallCode: true } });
    const bookedSet = new Set(bookedStalls.map((stall) => String(stall.stallCode).toUpperCase()));

    const byCode = new Map();
    requests.forEach((request) => {
        const fallbackShop = shopByName[request.sellerName] || {};
        const entry = {
            seller: {
                name: request.sellerName || '-',
                shop: {
                    shopName: request.seller?.shopName || fallbackShop.shopName || request.productName || '',
                    productType: request.seller?.productType?.name || fallbackShop.productType || '',
                    productDetail: request.seller?.productDetail || fallbackShop.productDetail || request.description || ''
                }
            }
        };
        String(request.assignedStallCode || '').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean).forEach((code) => {
            if (!byCode.has(code)) byCode.set(code, { ...entry, isHeld: bookedSet.has(code) });
        });
    });
    return byCode;
}

// รหัสล็อกที่มีผลตรวจใดๆ ของวันนั้น (ไม่ว่ามี Booking ครอบวันนั้นหรือไม่) — ถ้าตรวจแล้วก็ต้องอยู่ในรายงาน
async function getInspectedStallCodes(dayStart) {
    const createdAt = { gte: dayStart, lt: addDays(dayStart, 1) };
    const [issues, excesses, cleans, checks] = await Promise.all([
        prisma.stallIssueRecord.findMany({ where: { createdAt }, select: { stallCode: true } }),
        prisma.stallElectricExcessRecord.findMany({ where: { createdAt }, select: { stallCode: true } }),
        prisma.stallCleanlinessInspection.findMany({ where: { createdAt }, select: { stallCode: true } }),
        prisma.stallInspectionCheckRecord.findMany({ where: { createdAt, isInspected: true }, select: { stallCode: true } })
    ]);
    return new Set([...issues, ...excesses, ...cleans, ...checks].map((record) => String(record.stallCode).toUpperCase()));
}

async function buildDailyReport(roundNumber, requestedDateKey) {
    const calendarDates = getRoundCalendarDates(roundNumber);
    const dayKeys = calendarDates.map((date) => toDateKey(date));
    const todayKey = toDateKey(toStartOfDay(new Date()));
    const selectedDateKey = pickDateKey(requestedDateKey, dayKeys, todayKey);
    const dayStart = toStartOfDay(dateKeyToDate(selectedDateKey));

    const days = calendarDates.map((date) => ({
        dateKey: toDateKey(date),
        label: formatThaiDate(date),
        isToday: toDateKey(date) === todayKey,
        isFuture: toDateKey(date) > todayKey
    }));

    const isFutureDay = selectedDateKey > todayKey;
    const bookings = await reportHelpers.getSellerStallOccupancy(dayStart, dayStart);
    // วันในอนาคตจะไม่มี entry (buildOccupancyEntries ตัดไม่เกินวันนี้) = รายงานว่าง
    const occupancy = reportHelpers.buildOccupancyEntries(bookings, dayStart, dayStart);

    const entryByStallCode = new Map();
    occupancy.forEach((entry) => {
        if (!entryByStallCode.has(entry.stallCode)) entryByStallCode.set(entry.stallCode, entry);
    });

    // เสริมล็อกที่ Booking ไม่ครอบวันนั้น: (1) วันนี้ = ล็อกที่ยังถือครองอยู่ (2) ล็อกที่มีผลตรวจของวันนั้น
    if (!isFutureDay) {
        const [heldByCode, inspectedCodes] = await Promise.all([loadHeldStalls(), getInspectedStallCodes(dayStart)]);
        const addFromHeld = (code) => {
            if (entryByStallCode.has(code)) return;
            const held = heldByCode.get(code);
            entryByStallCode.set(code, { stallCode: code, seller: held ? held.seller : { name: '-', shop: {} } });
        };
        if (selectedDateKey === todayKey) {
            heldByCode.forEach((held, code) => { if (held.isHeld) addFromHeld(code); });
        }
        inspectedCodes.forEach(addFromHeld);
    }
    const stallCodes = Array.from(entryByStallCode.keys());

    const [{ inspectionMap, issueMap, excessMap }, cleanlinessMap, stallRows] = await Promise.all([
        reportHelpers.getDailyInspectionMaps(stallCodes, dayStart, dayStart),
        getCleanlinessMap(stallCodes, dayStart),
        stallCodes.length
            ? prisma.stall.findMany({
                where: { stallCode: { in: stallCodes } },
                select: { stallCode: true, row: { select: { rowCode: true, zone: { select: { code: true } } } } }
            })
            : []
    ]);
    const stallMeta = new Map(stallRows.map((stall) => [stall.stallCode, stall]));

    const walkIndex = new Map(buildPreferredWalkOrder().map((code, idx) => [code, idx]));

    const rows = stallCodes.map((stallCode) => {
        const entry = entryByStallCode.get(stallCode);
        const key = `${stallCode}|${selectedDateKey}`;
        const issue = issueMap.get(key) || null;
        const excess = excessMap.get(key) || null;
        const cleanRecord = cleanlinessMap.get(stallCode) || null;
        const shop = entry.seller?.shop || {};
        const isFood = normalizeProductType(shop.productType) === 'FOOD';

        const electric = excess && (excess.smallCount > 0 || excess.largeCount > 0)
            ? { smallCount: excess.smallCount, largeCount: excess.largeCount, subtotal: excess.subtotal || 0, note: excess.note || '' }
            : null;
        const otherNote = issue?.otherIssueNote ? issue.otherIssueNote.trim() : '';

        const issueKeys = [];
        if (issue?.noShow) issueKeys.push('noShow');
        if (issue?.sublease) issueKeys.push('sublease');
        if (issue?.otherMarket) issueKeys.push('otherMarket');
        if (issue?.wrongSeller) issueKeys.push('wrongSeller');
        if (electric) issueKeys.push('electric');
        if (otherNote) issueKeys.push('other');

        // "ตรวจแล้ว" = มีเร็คคอร์ดปัญหา/ไฟฟ้า/ความสะอาดของวันนั้น หรือถูก auto-mark ตอนส่งงาน
        const isChecked = Boolean(issue || excess || cleanRecord || inspectionMap.get(key));
        const isNoShow = Boolean(issue?.noShow);

        let cleanliness = null;
        if (isFood) {
            if (isNoShow) {
                cleanliness = { status: 'skipped' };
            } else if (cleanRecord) {
                const results = cleanRecord.itemResults || {};
                const failedItems = CLEANLINESS_ITEM_IDS
                    .filter((id) => results[id] === false)
                    .map((id) => CHECKLIST_ITEM_INFO[id]);
                cleanliness = {
                    status: cleanRecord.overallPassed ? 'passed' : 'failed',
                    failedItems,
                    passedCount: CLEANLINESS_ITEM_IDS.length - failedItems.length,
                    totalCount: CLEANLINESS_ITEM_IDS.length,
                    note: cleanRecord.note || '',
                    checkedAt: cleanRecord.createdAt
                };
            } else {
                cleanliness = { status: 'pending' };
            }
        }

        const meta = stallMeta.get(stallCode);
        return {
            stallCode,
            zone: meta?.row?.zone?.code || '',
            rowCode: meta?.row?.rowCode || '',
            shopName: shop.shopName || entry.seller?.name || '-',
            sellerName: entry.seller?.name || '-',
            productDetail: shop.productDetail || '',
            isFood,
            attendance: !isChecked ? 'unchecked' : (isNoShow ? 'noShow' : 'present'),
            issueKeys,
            issues: {
                noShow: Boolean(issue?.noShow),
                sublease: Boolean(issue?.sublease),
                otherMarket: Boolean(issue?.otherMarket),
                wrongSeller: Boolean(issue?.wrongSeller),
                electric,
                otherNote
            },
            cleanliness,
            // ข้ามลำดับเดินจริงไว้ก่อน (ไม่อยู่ใน walk order = ท้ายสุด เรียงตามรหัสล็อค)
            sortIndex: walkIndex.has(stallCode) ? walkIndex.get(stallCode) : Number.POSITIVE_INFINITY
        };
    }).sort((a, b) => (a.sortIndex - b.sortIndex) || a.stallCode.localeCompare(b.stallCode));

    return {
        roundNumber,
        selectedDateKey,
        selectedDateLabel: formatThaiDate(dateKeyToDate(selectedDateKey), true),
        todayKey,
        days,
        isFutureDay,
        rows,
        summary: buildSummary(rows)
    };
}

function buildSummary(rows) {
    const summary = {
        totalStalls: rows.length,
        checked: rows.filter((row) => row.attendance !== 'unchecked').length,
        unchecked: rows.filter((row) => row.attendance === 'unchecked').length,
        noShow: rows.filter((row) => row.attendance === 'noShow').length,
        present: rows.filter((row) => row.attendance === 'present').length,
        // มาขายแต่พบปัญหาอย่างอื่น (ไม่นับไม่มาขาย)
        presentWithIssue: rows.filter((row) => row.attendance === 'present' && row.issueKeys.length > 0).length,
        issueCounts: {},
        electric: { stalls: 0, small: 0, large: 0, subtotal: 0 },
        clean: { foodTotal: 0, passed: 0, failed: 0, pending: 0, skipped: 0, failedItemRanking: [] }
    };

    ISSUE_CATEGORIES.forEach((category) => {
        summary.issueCounts[category.key] = rows.filter((row) => row.issueKeys.includes(category.key)).length;
    });

    const failedItemCount = new Map();
    rows.forEach((row) => {
        if (row.issues.electric) {
            summary.electric.stalls += 1;
            summary.electric.small += row.issues.electric.smallCount;
            summary.electric.large += row.issues.electric.largeCount;
            summary.electric.subtotal += row.issues.electric.subtotal;
        }
        if (!row.isFood) return;
        summary.clean.foodTotal += 1;
        const status = row.cleanliness.status;
        summary.clean[status] += 1;
        (row.cleanliness.failedItems || []).forEach((item) => {
            failedItemCount.set(item.id, (failedItemCount.get(item.id) || 0) + 1);
        });
    });

    summary.clean.failedItemRanking = Array.from(failedItemCount.entries())
        .map(([id, count]) => ({ ...CHECKLIST_ITEM_INFO[id], count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id, undefined, { numeric: true }));

    return summary;
}

function resolveRound(req) {
    const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
    const requestedRound = Number.parseInt(req.query.round, 10);
    const roundNumber = Number.isFinite(requestedRound) ? requestedRound : currentRoundNumber;
    return { currentRoundNumber, roundNumber };
}

exports.getStaffReportPage = async (req, res) => {
    const { currentRoundNumber, roundNumber } = resolveRound(req);

    try {
        const report = await buildDailyReport(roundNumber, parseDateKeyParam(req.query.date));
        return res.render('staff/inspection-report', {
            user: req.user,
            report,
            roundNumber,
            currentRoundNumber,
            issueCategories: ISSUE_CATEGORIES
        });
    } catch (error) {
        console.error('Staff inspection report error:', error);
        return res.status(500).render('staff/inspection-report', {
            user: req.user,
            report: null,
            roundNumber,
            currentRoundNumber,
            issueCategories: ISSUE_CATEGORIES,
            error: 'ไม่สามารถโหลดรายงานได้'
        });
    }
};

const ATTENDANCE_LABEL = { noShow: 'ไม่มาขาย', present: 'มาขาย', unchecked: 'ยังไม่ตรวจ' };
const CLEAN_LABEL = { passed: 'ผ่าน', failed: 'ไม่ผ่าน', pending: 'ยังไม่ตรวจ', skipped: 'ข้าม (ไม่มาขาย)' };

function issueText(row) {
    const parts = ISSUE_CATEGORIES
        .filter((category) => row.issueKeys.includes(category.key))
        .map((category) => {
            if (category.key === 'electric') {
                return `${category.label} (เล็ก ${row.issues.electric.smallCount} / ใหญ่ ${row.issues.electric.largeCount} = ${row.issues.electric.subtotal} บาท)`;
            }
            if (category.key === 'other') return `${category.label}: ${row.issues.otherNote}`;
            return category.label;
        });
    return parts.join(', ');
}

exports.exportStaffReportExcel = async (req, res) => {
    try {
        const { roundNumber } = resolveRound(req);
        const report = await buildDailyReport(roundNumber, parseDateKeyParam(req.query.date));
        const { summary } = report;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Kangsadan Night Market';
        workbook.created = new Date();

        const summarySheet = workbook.addWorksheet('สรุป');
        summarySheet.columns = [
            { header: 'หัวข้อ', key: 'label', width: 40 },
            { header: 'จำนวน', key: 'count', width: 14 }
        ];
        summarySheet.addRows([
            { label: `รายงานรอบที่ ${roundNumber} วันที่ ${report.selectedDateLabel}`, count: '' },
            { label: 'ล็อคที่มีร้านขายทั้งหมด', count: summary.totalStalls },
            { label: 'ตรวจแล้ว', count: summary.checked },
            { label: 'ยังไม่ตรวจ', count: summary.unchecked },
            { label: 'มาขาย', count: summary.present },
            ...ISSUE_CATEGORIES.map((category) => ({ label: category.label, count: summary.issueCounts[category.key] })),
            { label: 'เครื่องใช้ไฟฟ้าเกิน - เครื่องเล็กรวม', count: summary.electric.small },
            { label: 'เครื่องใช้ไฟฟ้าเกิน - เครื่องใหญ่รวม', count: summary.electric.large },
            { label: 'ร้านอาหารทั้งหมด', count: summary.clean.foodTotal },
            { label: 'ความสะอาด ผ่าน', count: summary.clean.passed },
            { label: 'ความสะอาด ไม่ผ่าน', count: summary.clean.failed },
            { label: 'ความสะอาด ยังไม่ตรวจ', count: summary.clean.pending }
        ]);
        summarySheet.getRow(1).font = { bold: true };

        const storeSheet = workbook.addWorksheet('รายร้าน');
        storeSheet.columns = [
            { header: 'ล็อค', key: 'stallCode', width: 10 },
            { header: 'โซน', key: 'zone', width: 8 },
            { header: 'ร้านค้า', key: 'shopName', width: 28 },
            { header: 'ผู้ขาย', key: 'sellerName', width: 24 },
            { header: 'สถานะ', key: 'attendance', width: 14 },
            { header: 'ปัญหาที่พบ', key: 'issues', width: 50 },
            { header: 'ความสะอาด', key: 'clean', width: 16 },
            { header: 'ข้อที่ไม่ผ่าน', key: 'failed', width: 60 }
        ];
        report.rows.forEach((row) => {
            storeSheet.addRow({
                stallCode: row.stallCode,
                zone: row.zone,
                shopName: row.shopName,
                sellerName: row.sellerName,
                attendance: ATTENDANCE_LABEL[row.attendance],
                issues: issueText(row),
                clean: row.cleanliness ? CLEAN_LABEL[row.cleanliness.status] : '-',
                failed: (row.cleanliness?.failedItems || []).map((item) => `${item.id} ${item.label}`).join(' | ')
            });
        });
        storeSheet.getRow(1).font = { bold: true };

        const rankSheet = workbook.addWorksheet('ข้อความสะอาดที่ไม่ผ่านบ่อย');
        rankSheet.columns = [
            { header: 'ข้อ', key: 'id', width: 8 },
            { header: 'หมวด', key: 'category', width: 30 },
            { header: 'หัวข้อ', key: 'label', width: 60 },
            { header: 'จำนวนร้านที่ไม่ผ่าน', key: 'count', width: 20 }
        ];
        summary.clean.failedItemRanking.forEach((item) => {
            rankSheet.addRow({ id: item.id, category: item.categoryTitle, label: item.label, count: item.count });
        });
        rankSheet.getRow(1).font = { bold: true };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="inspection-report-${report.selectedDateKey}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export inspection report error:', error);
        res.status(500).send('ไม่สามารถสร้างไฟล์รายงานได้');
    }
};
exports.loadHeldStalls = loadHeldStalls;
exports.buildDailyReport = buildDailyReport;
exports.ISSUE_CATEGORIES = ISSUE_CATEGORIES;
