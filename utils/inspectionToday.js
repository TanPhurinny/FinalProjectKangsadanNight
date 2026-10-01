const prisma = require('../config/prismaClient');
const { toStartOfDay } = require('./bookingRound');
const { buildPreferredWalkOrder } = require('./inspectionWalkOrder');

// สรุปผลตรวจตลาด "ของวันนี้" รายล็อก ใช้กับชั้นข้อมูล "ผลตรวจวันนี้" บนผังตลาด (แอดมิน/staff เท่านั้น)
//
// เจ้าหน้าที่ไม่ได้กดยืนยันตรวจทีละร้าน (บันทึกเฉพาะร้านที่พบปัญหา แล้วกด "ส่งงาน" ตอนจบวัน ซึ่งจะสร้าง
// StallInspectionCheckRecord ให้ทุกล็อกที่เหลือ — ดู staffInspectionController.submitDay) จึงนับว่า
// "ตรวจแล้ว" = มีบันทึกประเภทใดก็ได้ของวันนี้ และ "มีปัญหา" = บันทึกล่าสุดของวันนี้ในแต่ละประเภทยังมีปัญหาค้างอยู่
//
// ล็อกที่นับเป็นงานตรวจ = ล็อกที่จองและชำระเงินแล้ว (BookingRequest SUCCESS) เหมือน inspectionEnabled ในหน้าตรวจตลาด
// ยอดสรุป (ตรวจแล้ว x/y) นับฝั่ง client จากล็อกที่ผังแสดงว่ามีร้านเท่านั้น ให้ตัวเลขตรงกับสีที่เห็นบนผัง

function parseStallCodes(text) {
    return String(text || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
}

function latestByStallId(records) {
    const map = new Map();
    records.forEach((record) => {
        if (!map.has(record.stallId)) map.set(record.stallId, record);
    });
    return map;
}

async function buildTodayInspectionLayer() {
    const todayStart = toStartOfDay(new Date());

    const paidRequests = await prisma.bookingRequest.findMany({
        where: { status: 'SUCCESS', assignedStallCode: { not: null } },
        select: { assignedStallCode: true }
    });
    const paidCodes = new Set(paidRequests.flatMap((request) => parseStallCodes(request.assignedStallCode)));

    const stalls = paidCodes.size
        ? await prisma.stall.findMany({
            // ล็อกที่ถูกปล่อยแล้วยังมีคำขอ SUCCESS ค้าง (ตั้งใจ) — นับเฉพาะล็อกที่ยัง BOOKED ให้ตรงกับหน้าตรวจตลาด
            where: { stallCode: { in: [...paidCodes] }, status: 'BOOKED' },
            select: { id: true, stallCode: true }
        })
        : [];
    const stallIds = stalls.map((stall) => stall.id);

    const todayFilter = { stallId: { in: stallIds }, createdAt: { gte: todayStart } };
    const newestFirst = { orderBy: { createdAt: 'desc' } };
    const [checks, issues, excesses, cleanliness] = stallIds.length
        ? await Promise.all([
            prisma.stallInspectionCheckRecord.findMany({ where: todayFilter, ...newestFirst }),
            prisma.stallIssueRecord.findMany({ where: todayFilter, ...newestFirst }),
            prisma.stallElectricExcessRecord.findMany({ where: todayFilter, ...newestFirst }),
            prisma.stallCleanlinessInspection.findMany({ where: todayFilter, ...newestFirst })
        ])
        : [[], [], [], []];

    const checkById = latestByStallId(checks);
    const issueById = latestByStallId(issues);
    const excessById = latestByStallId(excesses);
    const cleanById = latestByStallId(cleanliness);

    const byCode = {};

    stalls.forEach((stall) => {
        const check = checkById.get(stall.id);
        const issue = issueById.get(stall.id);
        const excess = excessById.get(stall.id);
        const clean = cleanById.get(stall.id);

        const problems = [];
        if (issue?.noShow) problems.push('ไม่มาขาย');
        if (issue?.sublease) problems.push('ปล่อยเช่าช่วง');
        if (issue?.otherMarket) problems.push('ไปขายตลาดอื่น');
        if (issue?.wrongSeller) problems.push('คนขายไม่ตรงชื่อ');
        if (issue?.otherIssueNote && issue.otherIssueNote.trim()) problems.push(issue.otherIssueNote.trim());
        if (excess && (excess.smallCount > 0 || excess.largeCount > 0)) {
            problems.push(`ไฟเกิน (เล็ก ${excess.smallCount} / ใหญ่ ${excess.largeCount})`);
        }
        if (clean && !clean.overallPassed) problems.push('ความสะอาดไม่ผ่าน');

        const records = [check, issue, excess, clean].filter(Boolean);
        const checkedAt = records.length
            ? new Date(Math.max(...records.map((record) => new Date(record.createdAt).getTime())))
            : null;

        let status = 'pending';
        if (problems.length) status = 'issue';
        else if (records.length) status = 'ok';

        byCode[String(stall.stallCode).trim().toUpperCase()] = {
            stallId: stall.id,
            status,
            cleanlinessPassed: clean ? Boolean(clean.overallPassed) : null,
            // ค่าปัจจุบันของวันนี้ ใช้เติมฟอร์ม "บันทึกผลตรวจด่วน" บนผังของ staff
            issue: {
                noShow: Boolean(issue?.noShow),
                sublease: Boolean(issue?.sublease),
                otherMarket: Boolean(issue?.otherMarket),
                wrongSeller: Boolean(issue?.wrongSeller),
                otherIssueNote: issue?.otherIssueNote || ''
            },
            excess: { small: excess?.smallCount || 0, large: excess?.largeCount || 0 },
            checkedAt
        };
    });

    // ลำดับเดินตรวจจริง (เส้นทางเดียวกับหน้าตรวจตลาด) — ล็อกที่ไม่อยู่ในเส้นทางต่อท้ายตามรหัส
    const walkIndex = new Map(buildPreferredWalkOrder().map((code, idx) => [code, idx]));
    const walkOrder = Object.keys(byCode).sort((a, b) => {
        const ia = walkIndex.has(a) ? walkIndex.get(a) : Number.POSITIVE_INFINITY;
        const ib = walkIndex.has(b) ? walkIndex.get(b) : Number.POSITIVE_INFINITY;
        return ia === ib ? a.localeCompare(b) : ia - ib;
    });

    return {
        byCode,
        walkOrder,
        dateLabel: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    };
}

module.exports = { buildTodayInspectionLayer };
