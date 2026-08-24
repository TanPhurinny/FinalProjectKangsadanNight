const { getRoundWindow, addDays, toStartOfDay } = require('./bookingRound');

// น้ำหนักคะแนนที่หักต่อปัญหาที่พบระหว่างตรวจตลาด (เริ่มจาก 100 เต็มต่อวันต่อล็อค)
// ปรับตัวเลขได้ตรงนี้โดยไม่ต้อง migrate DB เพราะคำนวณสดจาก event log ไม่ได้ persist ไว้
const ISSUE_SCORE_WEIGHTS = {
    noShow: 100,
    sublease: 100,
    otherMarket: 70,
    wrongSeller: 50,
    otherIssueNote: 20,
    electricSmallPerUnit: 5,
    electricLargePerUnit: 10
};

// คำนวณคะแนนของล็อคเดียวในวันเดียว จาก flag ที่พบวันนั้น (ไม่ carry-forward ข้ามวัน)
function computeDailyStallScore({
    noShow = false,
    sublease = false,
    otherMarket = false,
    wrongSeller = false,
    smallCount = 0,
    largeCount = 0,
    otherIssueNote = ''
} = {}) {
    let deduction = 0;

    if (noShow) deduction += ISSUE_SCORE_WEIGHTS.noShow;
    if (sublease) deduction += ISSUE_SCORE_WEIGHTS.sublease;
    if (otherMarket) deduction += ISSUE_SCORE_WEIGHTS.otherMarket;
    if (wrongSeller) deduction += ISSUE_SCORE_WEIGHTS.wrongSeller;
    if (String(otherIssueNote || '').trim()) deduction += ISSUE_SCORE_WEIGHTS.otherIssueNote;

    deduction += Math.max(0, Number(smallCount) || 0) * ISSUE_SCORE_WEIGHTS.electricSmallPerUnit;
    deduction += Math.max(0, Number(largeCount) || 0) * ISSUE_SCORE_WEIGHTS.electricLargePerUnit;

    return Math.max(0, 100 - deduction);
}

// รายชื่อวันที่ (เที่ยงคืน) ทั้งหมดในรอบ ใช้ทำแกน X ของกราฟรายวัน
function getRoundCalendarDates(roundNumber) {
    const { cycleStart, cycleEnd } = getRoundWindow(roundNumber);
    const dates = [];
    let cursor = toStartOfDay(cycleStart);
    const end = toStartOfDay(cycleEnd);

    while (cursor.getTime() <= end.getTime()) {
        dates.push(new Date(cursor));
        cursor = addDays(cursor, 1);
    }

    return dates;
}

// ใช้ local date component แทน toISOString() เพราะ toISOString() แปลงเป็น UTC
// อาจทำให้วันที่เลื่อนไปวันก่อนหน้าถ้า server ไม่ได้รันที่ UTC (ระบบอื่นในโปรเจกต์ใช้ local date ล้วน)
function toDateKey(dateValue) {
    const date = toStartOfDay(dateValue);
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function average(numbers) {
    if (!numbers.length) return null;
    const sum = numbers.reduce((acc, value) => acc + value, 0);
    return sum / numbers.length;
}

module.exports = {
    ISSUE_SCORE_WEIGHTS,
    computeDailyStallScore,
    getRoundCalendarDates,
    toDateKey,
    average
};
