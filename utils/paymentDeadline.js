// กำหนดชำระเงินของคำขอจองที่แอดมินจัดล็อกให้แล้ว (สถานะ IN_PROGRESS)
// คำนวณครั้งเดียวตอนจัดล็อก แล้วเก็บไว้ที่ BookingRequest.paymentDueAt — แอดมินแก้รายใบได้จากหน้าอนุมัติ
// กติกา: ภายใน N ชม. หลังจัดล็อก หรือก่อนเวลาตัดของวันเริ่มขาย (ตลาดเปิด 15:00) แล้วแต่อย่างไหนถึงก่อน
//        แต่ถ้าเหลือเวลาน้อยกว่าขั้นต่ำ (จัดล็อกใกล้/เลยเวลาตัดแล้ว) ให้เป็น จัดล็อก + ขั้นต่ำ ร้านจะได้มีเวลาโอน
// ค่าทั้งสามแอดมินเปลี่ยนได้ (ตาราง AppSetting) มีผลกับการจัดล็อกครั้งถัดไป ไม่ย้อนไปเปลี่ยนใบที่จัดไปแล้ว
const prisma = require('../config/prismaClient');
const { toStartOfDay, PAYMENT_WINDOW_HOURS, getPaymentDeadlineFromLockAssignedAt } = require('./bookingRound');

const SETTING_KEY = 'paymentDeadline';
const DEFAULT_SETTINGS = { windowHours: PAYMENT_WINDOW_HOURS, cutoffTime: '15:00', minMinutes: 30 };
const CUTOFF_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CACHE_MS = 60 * 1000;

let cache = null;
let cachedAt = 0;

// ตรวจ/แปลงค่าที่รับมา (จากฟอร์มหรือจาก DB) — ค่าไหนผิดคืน error เป็นข้อความไทย
function normalizeSettings(raw = {}) {
    const windowHours = Number(raw.windowHours);
    const minMinutes = Number(raw.minMinutes);
    const cutoffTime = String(raw.cutoffTime || '').trim();
    if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 72) return { error: 'จำนวนชั่วโมงต้องเป็นจำนวนเต็ม 1–72' };
    if (!CUTOFF_PATTERN.test(cutoffTime)) return { error: 'เวลาตัดต้องอยู่ในรูปแบบ HH:MM เช่น 15:00' };
    if (!Number.isInteger(minMinutes) || minMinutes < 0 || minMinutes > 240) return { error: 'เวลาขั้นต่ำต้องเป็นจำนวนเต็ม 0–240 นาที' };
    return { settings: { windowHours, cutoffTime, minMinutes } };
}

async function getPaymentSettings() {
    if (cache && Date.now() - cachedAt < CACHE_MS) return cache;
    let settings = { ...DEFAULT_SETTINGS };
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
        if (row) {
            const parsed = normalizeSettings(JSON.parse(row.value));
            if (parsed.settings) settings = { ...parsed.settings, updatedAt: row.updatedAt, updatedByName: row.updatedByName };
        }
    } catch (error) {
        // อ่านค่าไม่ได้ (เช่น ยังไม่ได้สร้างตาราง) ใช้ค่าเริ่มต้นไปก่อน ไม่ให้การจัดล็อกพัง
        console.error('Payment settings read error:', error.message);
    }
    cache = settings;
    cachedAt = Date.now();
    return settings;
}

async function savePaymentSettings(raw, actorName) {
    const parsed = normalizeSettings(raw);
    if (parsed.error) return parsed;
    const value = JSON.stringify(parsed.settings);
    await prisma.appSetting.upsert({
        where: { key: SETTING_KEY },
        create: { key: SETTING_KEY, value, updatedByName: actorName || null },
        update: { value, updatedByName: actorName || null }
    });
    cache = null;
    return { settings: parsed.settings };
}

// คำนวณกำหนดชำระจากเวลาจัดล็อก + วันเริ่มขาย (ไม่มีวันเริ่มขาย = ใช้แค่ N ชม.)
function computePaymentDueAt(lockAssignedAt, rentalStartDate, settings = DEFAULT_SETTINGS) {
    const assigned = new Date(lockAssignedAt);
    if (Number.isNaN(assigned.getTime())) return null;
    const byWindow = new Date(assigned.getTime() + settings.windowHours * 60 * 60 * 1000);
    const startDay = rentalStartDate ? toStartOfDay(rentalStartDate) : null;
    if (!startDay) return byWindow;

    const [hour, minute] = settings.cutoffTime.split(':').map(Number);
    const cutoff = new Date(startDay);
    cutoff.setHours(hour, minute, 0, 0);
    if (cutoff >= byWindow) return byWindow;

    const minimum = new Date(assigned.getTime() + settings.minMinutes * 60 * 1000);
    return cutoff > minimum ? cutoff : minimum;
}

// กำหนดชำระของคำขอ — ใช้ค่าที่เก็บไว้ (paymentDueAt) ถ้าไม่มี (คำขอที่จัดล็อกก่อนมีคอลัมน์นี้) ใช้สูตรเดิม
// lockAssignedAt + 6 ชม. ไม่เกิน 15:00 ของวันเริ่มขาย (getPaymentDeadlineFromLockAssignedAt ใน utils/bookingRound.js)
function getPaymentDeadline(request, rentalStartDate = null) {
    if (!request) return null;
    if (request.paymentDueAt) {
        const due = new Date(request.paymentDueAt);
        if (!Number.isNaN(due.getTime())) return due;
    }
    return getPaymentDeadlineFromLockAssignedAt(request.lockAssignedAt, rentalStartDate);
}

module.exports = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    getPaymentSettings,
    savePaymentSettings,
    computePaymentDueAt,
    getPaymentDeadline
};
