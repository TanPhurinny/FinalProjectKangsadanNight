// สถานะ "อ่านแล้ว" ของแจ้งเตือน — แจ้งเตือนทุกชิ้นคำนวณสดจากข้อมูลจริง (ดู loadSellerBookingStatus ใน routes/sellerRoute.js)
// ไม่มีตารางเก็บตัวแจ้งเตือน จึงเก็บแค่ key ที่ผู้ใช้อ่านแล้วในตาราง NotificationRead
// key = "<id>@<at>" — ถ้าเรื่องเดิมมีความเคลื่อนไหวใหม่ (เช่น คอมเมนต์ใหม่ในโพสต์เดิม เวลา at เปลี่ยน) จะกลับมาเป็นยังไม่อ่านเอง
const prisma = require('../config/prismaClient');

const MAX_KEYS_PER_REQUEST = 200;

// หมวดของแจ้งเตือน ใช้ทำแท็บกรองในหน้า /notifications — ดูจาก prefix ของ id ก่อน แล้วค่อยดู type
function categoryOf(item) {
    const id = String(item.id || '');
    if (id.startsWith('event-booth-')) return 'event';
    if (id.startsWith('repair-')) return 'repair';
    if (id.startsWith('tax-invoice-') || item.type === 'success-receipt') return 'document';
    if (id.startsWith('community-') || id.startsWith('shop-review-')) return 'shop';
    return 'booking';
}

function toIsoFromMs(ms) {
    const date = new Date(Number(ms));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function notificationKey(item) {
    return `${item.id}@${item.at || ''}`.slice(0, 191);
}

// เติม at / category / key ให้ครบทุกชิ้น แล้วรวมกับสถานะอ่านแล้วจาก DB
// isRead ที่ builder ตั้งมาเป็น true อยู่แล้ว (เช่น ขั้นการจองที่ผ่านมาแล้ว) ถือว่าอ่านแล้วเสมอ
async function applyReadState(userId, notifications) {
    const list = (notifications || []).map((item) => {
        const at = item.at !== undefined ? item.at : (item.sortAt ? toIsoFromMs(item.sortAt) : null);
        const decorated = { ...item, at, category: categoryOf(item) };
        if (item.type === 'shop-review' && !item.action) decorated.action = 'ตอบรีวิว';
        decorated.key = notificationKey(decorated);
        return decorated;
    });
    if (!userId || !list.length) return list;

    let readKeys = new Set();
    try {
        const rows = await prisma.notificationRead.findMany({
            where: { userId, key: { in: list.map((item) => item.key) } },
            select: { key: true }
        });
        readKeys = new Set(rows.map((row) => row.key));
    } catch (error) {
        // ตารางยังไม่มี/DB ล่มชั่วคราว: แสดงตามค่าเดิมจาก builder ไปก่อน
        console.error('applyReadState error', error.message);
    }

    return list.map((item) => {
        if (item.upcoming) return { ...item, isRead: true, isNew: false };
        if (readKeys.has(item.key)) return { ...item, isRead: true, isNew: false };
        return item;
    });
}

function cleanKeys(keys) {
    return [...new Set((Array.isArray(keys) ? keys : [keys])
        .map((key) => String(key || '').trim().slice(0, 191))
        .filter(Boolean))]
        .slice(0, MAX_KEYS_PER_REQUEST);
}

async function markRead(userId, keys) {
    const list = cleanKeys(keys);
    if (!list.length) return 0;
    const result = await prisma.notificationRead.createMany({
        data: list.map((key) => ({ userId, key })),
        skipDuplicates: true
    });
    return result.count;
}

async function markUnread(userId, keys) {
    const list = cleanKeys(keys);
    if (!list.length) return 0;
    const result = await prisma.notificationRead.deleteMany({ where: { userId, key: { in: list } } });
    return result.count;
}

module.exports = { applyReadState, markRead, markUnread, notificationKey };
