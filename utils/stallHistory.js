const prisma = require('../config/prismaClient');
const { toStartOfDay, addDays } = require('./bookingRound');
const { toDateKey } = require('./inspectionScoring');
const { CLEANLINESS_ITEM_IDS } = require('./cleanlinessChecklist');

// ประวัติผลตรวจรายวันของล็อกเดียว (ย้อนหลัง N วัน) ใช้ในการ์ดล็อกบนผังแอดมิน/staff
// แต่ละวันเอาบันทึกล่าสุดของวันนั้นในแต่ละประเภท (เหมือนรายงานตรวจตลาดรายวัน)

const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

async function buildStallHistory(stallCode, days = 7) {
    const code = String(stallCode || '').trim().toUpperCase();
    const today = toStartOfDay(new Date());
    const start = addDays(today, -(days - 1));
    const where = { stallCode: code, createdAt: { gte: start } };
    const newestFirst = { orderBy: { createdAt: 'desc' } };

    const [checks, issues, excesses, cleans] = await Promise.all([
        prisma.stallInspectionCheckRecord.findMany({ where, select: { isInspected: true, createdAt: true }, ...newestFirst }),
        prisma.stallIssueRecord.findMany({
            where,
            select: { noShow: true, sublease: true, otherMarket: true, wrongSeller: true, otherIssueNote: true, createdAt: true },
            ...newestFirst
        }),
        prisma.stallElectricExcessRecord.findMany({ where, select: { smallCount: true, largeCount: true, subtotal: true, createdAt: true }, ...newestFirst }),
        prisma.stallCleanlinessInspection.findMany({ where, select: { itemResults: true, overallPassed: true, createdAt: true }, ...newestFirst })
    ]);

    const latestPerDay = (records) => {
        const map = new Map();
        records.forEach((record) => {
            const key = toDateKey(record.createdAt);
            if (!map.has(key)) map.set(key, record);
        });
        return map;
    };
    const checkByDay = latestPerDay(checks);
    const issueByDay = latestPerDay(issues);
    const excessByDay = latestPerDay(excesses);
    const cleanByDay = latestPerDay(cleans);

    const result = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const date = addDays(today, -i);
        const key = toDateKey(date);
        const check = checkByDay.get(key);
        const issue = issueByDay.get(key);
        const excess = excessByDay.get(key);
        const clean = cleanByDay.get(key);

        const problems = [];
        if (issue?.sublease) problems.push('ปล่อยเช่าช่วง');
        if (issue?.otherMarket) problems.push('ไปขายตลาดอื่น');
        if (issue?.wrongSeller) problems.push('คนขายไม่ตรงชื่อ');
        if (issue?.otherIssueNote && issue.otherIssueNote.trim()) problems.push(issue.otherIssueNote.trim());
        const hasExcess = Boolean(excess && (excess.smallCount > 0 || excess.largeCount > 0));
        if (hasExcess) problems.push(`ไฟเกิน (เล็ก ${excess.smallCount} / ใหญ่ ${excess.largeCount})`);

        let cleanliness = null;
        let failedCount = 0;
        if (clean) {
            const results = clean.itemResults || {};
            failedCount = CLEANLINESS_ITEM_IDS.filter((id) => results[id] === false).length;
            cleanliness = clean.overallPassed ? 'passed' : 'failed';
        }

        let attendance = 'none';
        if (issue?.noShow) attendance = 'noShow';
        else if (check?.isInspected || issue || excess || clean) attendance = 'present';

        result.push({
            dateKey: key,
            label: `${THAI_DAYS[date.getDay()]} ${date.getDate()}`,
            isToday: i === 0,
            attendance,
            problems,
            cleanliness,
            failedCount
        });
    }
    return result;
}

module.exports = { buildStallHistory };
