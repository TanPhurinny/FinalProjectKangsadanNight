// สร้างประกาศ "เปิดจองรอบใหม่" อัตโนมัติทุกวันอาทิตย์ โดยคำนวณวันที่ทั้งหมดจาก
// utils/bookingRound.js (แหล่งความจริงเดียวกับที่ระบบใช้ตัดสินว่าใครจองได้วันไหน)
// เพื่อไม่ต้องพิมพ์ข้อความ/วันที่เองทุกรอบ

const {
    getBookingRoundMetaForDate,
    getRoundWindow,
    addDays,
    toStartOfDay
} = require('./bookingRound');

const ANNOUNCEMENT_CATEGORY = 'ระบบจองล็อค';
const ANNOUNCEMENT_IMAGE = 'ann-1787476736984.JPG'; // รูปปกมาตรฐานของประกาศเปิดจองรอบใหม่ (public/uploads/announcements/)

function formatThaiDate(dateValue) {
    return dateValue.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

// คำนวณวันสำคัญของ "รอบถัดไป" (รอบที่กำลังจะเปิดให้จอง) จากรอบที่ active อยู่ ณ วันที่ให้มา
function getNextRoundPlan(dateValue) {
    const currentMeta = getBookingRoundMetaForDate(dateValue);
    const nextRoundNumber = currentMeta.roundNumber + 1;
    const { cycleStart, cycleEnd } = getRoundWindow(nextRoundNumber);

    const openAt = addDays(cycleStart, 1); // เสาร์เสมอ (14 หาร 7 ลงตัว)
    const fullBookingOpen = addDays(openAt, -5); // จันทร์ — จองครบ 14 วันได้ตั้งแต่วันนี้
    const paymentDeadline = addDays(openAt, -4); // อังคาร 13:00 — ปิดรับชำระของกลุ่มจอง 14 วัน
    const shortBookingOpen = addDays(openAt, -3); // พุธ 13:00 — เปิดให้กลุ่มจอง 3 วันขึ้นไปเริ่มจอง

    return { roundNumber: nextRoundNumber, cycleStart, cycleEnd, fullBookingOpen, paymentDeadline, shortBookingOpen };
}

function buildRoundAnnouncement(dateValue = new Date()) {
    const plan = getNextRoundPlan(dateValue);

    const title = `ระบบจองล็อค กังไนท์ — เปิดจองรอบ ${formatThaiDate(plan.cycleStart)} - ${formatThaiDate(plan.cycleEnd)}`;

    const content = `เรียน ร้านค้าที่น่ารักทุกท่าน❤️

📍 ตลาดจะเปิดให้จอง สำหรับรอบวันที่ ${formatThaiDate(plan.cycleStart)} - ${formatThaiDate(plan.cycleEnd)} 📆

✅ ร้านค้าที่จอง 14 วัน สามารถจองล็อคได้ตั้งแต่วันที่ ${formatThaiDate(plan.fullBookingOpen)} และชำระค่าล็อค 💰 ภายในวันที่ ${formatThaiDate(plan.paymentDeadline)} เวลา 13.00 น.

✅ ร้านค้าที่ต้องการจอง 3 วันขึ้นไป สามารถจองได้ตั้งแต่วันที่ ${formatThaiDate(plan.shortBookingOpen)} เวลา 13.00 น. เป็นต้นไป

⚠️ หมายเหตุ
หากไม่ได้จองล็อคครบ 14 วัน ล็อคของท่านอาจเต็มก่อน และทางตลาดไม่สามารถรับประกันสิทธิ์เดิมได้
🚫 ทางตลาดไม่มีนโยบายสงวนล็อคไว้ให้

⚠️ สำคัญ — สำหรับการเปิดจองรอบใหม่
ผู้ที่จองสั้นในรอบก่อนหน้า และผู้ที่จองรอบก่อนหน้าแล้วไม่มาขายเลย ปล่อยเช่าช่วงตลอด หรือปล่อยล็อคว่างไปขายตลาดอื่น
✅ ทางตลาดขอสงวนสิทธิ์ให้ลูกค้าใหม่ที่ต้องการจองยาว 14 วันได้จองก่อน เพราะฉะนั้นล็อคของท่านอาจจะหลุดได้ เนื่องจากมีผู้สนใจจองล็อคเป็นจำนวนมาก
ขออภัยในความไม่สะดวกค่ะ`;

    return {
        title,
        content,
        category: ANNOUNCEMENT_CATEGORY,
        targetRole: 'SELLER',
        targetRoles: ['SELLER'],
        isImportant: true,
        image: ANNOUNCEMENT_IMAGE,
        roundNumber: plan.roundNumber
    };
}

// เรียกทุกครั้งที่แอปสตาร์ท + ทุกชั่วโมงหลังจากนั้น เช็คเองว่าวันนี้อาทิตย์ไหม
// และวันนี้เคยประกาศรอบนี้ไปหรือยัง กันซ้ำถ้า process รีสตาร์ทหรือ interval ยิงถี่
async function ensureWeeklyRoundAnnouncement(prisma, { now = new Date(), logger = console } = {}) {
    const today = toStartOfDay(now);
    if (today.getDay() !== 0) return null; // เฉพาะวันอาทิตย์

    const announcement = buildRoundAnnouncement(now);

    const alreadyPostedToday = await prisma.announcement.findFirst({
        where: {
            category: ANNOUNCEMENT_CATEGORY,
            title: announcement.title,
            createdAt: { gte: today }
        }
    });
    if (alreadyPostedToday) return null;

    const author = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });
    if (!author) {
        logger.error?.('ensureWeeklyRoundAnnouncement: ไม่พบผู้ใช้ ADMIN สำหรับตั้งเป็นผู้ประกาศ');
        return null;
    }

    const created = await prisma.announcement.create({
        data: {
            title: announcement.title,
            content: announcement.content,
            category: announcement.category,
            targetRole: announcement.targetRole,
            targetRoles: announcement.targetRoles,
            isImportant: announcement.isImportant,
            image: announcement.image,
            authorId: author.id
        }
    });

    logger.info?.(`ประกาศเปิดจองรอบ ${announcement.roundNumber} อัตโนมัติแล้ว (id ${created.id})`);
    return created;
}

module.exports = {
    getNextRoundPlan,
    buildRoundAnnouncement,
    ensureWeeklyRoundAnnouncement
};
