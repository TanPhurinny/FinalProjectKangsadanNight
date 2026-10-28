const express = require('express');
const router = express.Router();
const prisma = require('../config/prismaClient');
const multer = require('multer');
const { createImageStorage, deleteImage } = require('../utils/imageStorage');
const { getAnnouncementsForUser } = require('../controllers/announcementController');
const { getMarketMapPage } = require('../controllers/marketController');
const marketMapCtrl = require('../controllers/marketMapController');
const { shopViewLimiter } = require('../middlewares/authRateLimit');
const { isStaffOrAdmin } = require('../middlewares/auth');
const { getShopViewStats } = require('../utils/shopViews');
const { getSellerReviewPanel, buildReviewNotifications } = require('../utils/shopReviews');
const { setOpenStatus, getOpenStatus, businessDateOf } = require('../utils/shopOpenStatus');
const stallLeave = require('../utils/stallLeave');
const { setPromo } = require('../utils/shopPromo');
const { buildProfileChecks } = require('../utils/shopCompleteness');
const { buildSellerHome } = require('../utils/sellerHome');
const { buildSellerCalendar } = require('../utils/sellerCalendar');
const { repairReportSchema, bookingStallInputSchema, sellerApplicationSchema, shopProfileSchema, THAI_BANK_NAMES } = require('../utils/validationSchemas');
const { loadCustomSubtypes, getProductSubtypeGroups } = require('../utils/productSubtypes');
const { buildPromptPayQrDataUrl, PROMPTPAY_ID } = require('../utils/promptpayQr');
const { verifySlip } = require('../utils/slipVerification');
const {
    toStartOfDay,
    addDays,
    getBookingRoundMetaForDate,
    getBookingPhaseForRound,
    getRoundTimeline,
    getSameDayPaymentCutoff,
    SAME_DAY_PAYMENT_CUTOFF_HOUR,
    getRoundWindow,
    getPaymentDeadlineForRound,
    BOOKING_ROUND_LENGTH_DAYS
} = require('../utils/bookingRound');
const { getPaymentDeadline, getPaymentSettings, computePaymentDueAt } = require('../utils/paymentDeadline');
const { getRenewalOptions, validateRenewal, isUnpaidPastDeadline } = require('../utils/stallRenewal');
const { getBillableDays, getHolidaysInRange } = require('../utils/bookingHolidays');
const { getNextRoundPlan } = require('../utils/autoRoundAnnouncement');
const { buildBookingRequestTag, stripBookingRequestTag, extractBookingRequestId, stripInternalTags } = require('../utils/bookingRequestTag');
const { buildQuotationData, COMPANY_INFO } = require('../controllers/quotationController');
const rentalStatement = require('../utils/rentalStatement');
const leaseContractCtrl = require('../controllers/leaseContractController');
const leaseContract = require('../utils/leaseContract');
const {
    APPLIANCE_KINDS,
    APPLIANCE_PRESETS,
    SMALL_APPLIANCE_MAX_WATT,
    MAX_QTY_PER_ITEM: APPLIANCE_MAX_QTY_PER_ITEM,
    parseApplianceItems,
    summarizeApplianceItems,
    dailyApplianceFee,
    readBookingApplianceItems,
    describeBookingAppliances
} = require('../utils/bookingAppliances');
const taxInvoiceCtrl = require('../controllers/taxInvoiceController');
const { buildCommunityNotifications } = require('../utils/communityNotifications');
const { applyReadState, markRead, markUnread } = require('../utils/notificationReads');
const { EVENT_ZONE_CODE } = require('../utils/eventBooth');
const { SHOP_ORDER, shopsRelation, primaryShop, getPrimaryShop, getUserShops, resolveShopForUser, pendingShopsOfUser } = require('../utils/shops');
const rainCompensation = require('../utils/rainCompensation');

// รูปแจ้งซ่อม (เก็บที่ Cloudinary หรือดิสก์ตาม utils/imageStorage.js)
const storage = createImageStorage({ folder: 'repairs' });

const REPAIR_MAX_IMAGES = 5;

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024, files: REPAIR_MAX_IMAGES } // 5MB/ไฟล์, สูงสุด 5 รูป/รายการ
});

// โฟลเดอร์เก็บสลิปโอนเงินยืนยันการจอง
const paymentSlipStorage = createImageStorage({ folder: 'payment-slips' });

const uploadPaymentSlip = multer({
    storage: paymentSlipStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// โฟลเดอร์เก็บรูปหน้าร้านตอนสมัครเปิดร้านค้า
const shopApplicationStorage = createImageStorage({ folder: 'shop-applications' });

const uploadShopApplication = multer({
    storage: shopApplicationStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// โฟลเดอร์เก็บรูปโปรไฟล์ร้านค้า (ผู้ขายแก้ไขเองหลังได้รับอนุมัติเป็น SELLER แล้ว)
const shopProfileStorage = createImageStorage({ folder: 'shop-profile' });

const uploadShopProfile = multer({
    storage: shopProfileStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const LIGHT_UNIT_PRICE = 15;
const SMALL_APPLIANCE_PRICE = APPLIANCE_KINDS.SMALL.price;
const LARGE_APPLIANCE_PRICE = APPLIANCE_KINDS.LARGE.price;
// จำนวนล็อคสูงสุดต่อร้านต่อรอบ — แอดมินตั้งได้ ดู utils/stallQuota.js (ใช้ใน POST /booking-stall)
const { getStallQuotaSettings, getShopQuota, countShopStallsInRound } = require('../utils/stallQuota');
// ตัวเลือกค่าธรรมเนียมแผงหัวมุม/แผงพิเศษ เรียงจากทำเลธรรมดาไปทำเลเด่นที่สุด
const CORNER_ZONE_OPTIONS = [
    { value: 20, label: 'ทำเลริมทางเดิน', desc: 'มองเห็นง่ายกว่าแผงทั่วไปเล็กน้อย' },
    { value: 29, label: 'ทำเลหัวแถว', desc: 'อยู่ต้นแถว คนเดินผ่านเยอะขึ้น' },
    { value: 69, label: 'ทำเลหัวมุม', desc: 'อยู่หัวมุม มองเห็นได้จากหลายทิศทาง' },
    { value: 89, label: 'ทำเลหัวมุมพิเศษ ริมถนนใหญ่', desc: 'จุดเด่นที่สุดในโซน มองเห็นชัดจากถนนใหญ่' }
];
const CORNER_ZONE_VALID_PRICES = CORNER_ZONE_OPTIONS.map((opt) => opt.value);

function resolveCornerZonePrice(rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    return CORNER_ZONE_VALID_PRICES.includes(parsed) ? parsed : 0;
}

// ความสนใจแผงหัวมุม/แผงพิเศษที่ผู้ขายแจ้งไว้ตอนจอง (ฝังใน description เหมือนกับที่ approvalController อ่าน)
function extractCornerZoneNote(descriptionText) {
    const match = String(descriptionText || '').match(/\[สนใจแผงพิเศษ:\s*([^\]]+)\]/);
    return match ? String(match[1] || '').trim() : null;
}

function getRentalDays(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const diffMs = endDate.getTime() - startDate.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor(diffMs / dayMs);
    return Math.max(1, diffDays + 1);
}

// รอบคำนวณจากสูตรใน utils/bookingRound.js ล้วนๆ — เดิม upsert ลงตาราง BookingRound ทุกครั้งที่เปิดหน้า
// แต่ไม่มีที่ไหนอ่านตารางนั้นกลับเลย จึงเลิกเขียน
function getBookingRoundInfoForDate(dateValue) {
    const meta = getBookingRoundMetaForDate(dateValue);
    const reminderDate = addDays(meta.cycleEnd, -5);
    const openAt = addDays(meta.cycleStart, 1);
    return { ...meta, reminderDate, openAt };
}

function safeInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

// หาราคาที่ "เป็นตัวแทนของโซน" จากแถวทั้งหมด โดยถ่วงน้ำหนักตามจำนวนล็อกในแต่ละแถว
// (ไม่ใช้ min ตรง ๆ เพราะบางโซน เช่น B มีแถวส่วนน้อยราคาต่างจากส่วนใหญ่ เช่น B6 แฟชั่น 209 ท่ามกลางอาหาร 259)
function dominantRowPrice(rows) {
    const stallCountByPrice = new Map();

    for (const row of rows) {
        const price = Number(row.price || 0);
        if (!Number.isFinite(price) || price < 0) continue;

        const start = Number(row.stallStartNumber);
        const end = Number(row.stallEndNumber);
        const stallCount = (Number.isFinite(start) && Number.isFinite(end) && end >= start) ? (end - start + 1) : 1;

        stallCountByPrice.set(price, (stallCountByPrice.get(price) || 0) + stallCount);
    }

    let bestPrice = 0;
    let bestCount = -1;
    for (const [price, count] of stallCountByPrice) {
        if (count > bestCount) {
            bestPrice = price;
            bestCount = count;
        }
    }

    return bestPrice;
}

async function loadZoneDetailsMap() {
    const zones = await prisma.zone.findMany({
        include: {
            rows: {
                select: {
                    price: true,
                    size: true,
                    stallStartNumber: true,
                    stallEndNumber: true
                }
            }
        }
    });

    // นับจำนวนล็อกว่างต่อโซน — ดึงล็อกว่างทั้งหมดมาครั้งเดียวแล้วนับทีละ zoneId ไม่ query ทีละโซน
    const availableStalls = await prisma.stall.findMany({
        where: { isAvailable: true, status: 'AVAILABLE' },
        select: { row: { select: { zoneId: true } } }
    });
    const availableCountByZoneId = new Map();
    for (const stall of availableStalls) {
        const zoneId = stall.row.zoneId;
        availableCountByZoneId.set(zoneId, (availableCountByZoneId.get(zoneId) || 0) + 1);
    }

    const map = {};
    for (const zone of zones) {
        const zoneCode = String(zone.code || '').toLowerCase();
        if (!zoneCode) continue;

        const size = zone.rows.find((row) => row.size)?.size || zone.size || '-';
        const availableCount = availableCountByZoneId.get(zone.id) || 0;

        map[zoneCode] = {
            label: `โซน ${zone.code}`,
            description: zone.description || `พื้นที่ขายสำหรับโซน ${zone.code}`,
            size,
            dailyPrice: dominantRowPrice(zone.rows),
            electricityFee: Number(zone.electricityFee || LIGHT_UNIT_PRICE),
            hasAvailableStalls: availableCount > 0,
            availableCount
        };
    }

    return map;
}

async function getDailyPriceByZoneCode(zoneCode) {
    const normalized = String(zoneCode || '').trim().toUpperCase();
    if (!normalized) return 0;

    const zone = await prisma.zone.findUnique({
        where: { code: normalized },
        include: {
            rows: {
                select: { price: true, stallStartNumber: true, stallEndNumber: true }
            }
        }
    });

    if (zone && zone.rows.length) {
        const price = dominantRowPrice(zone.rows);
        if (price > 0) return price;
    }

    const slot = await prisma.slot.findFirst({
        where: { zone: normalized },
        orderBy: { price: 'asc' }
    });

    return Number(slot?.price || 0);
}

function formatDateThai(dateValue) {
    if (!dateValue) return '-';

    try {
        return new Date(dateValue).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch (error) {
        return '-';
    }
}

function formatTimeThai(dateValue) {
    if (!dateValue) return '-';

    try {
        return new Date(dateValue).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return '-';
    }
}

// เวลาของเหตุการณ์ในแจ้งเตือน (ฟิลด์ at/deadline) — หน้า /notifications ใช้เรียงลำดับ จัดกลุ่มตามวัน และนับถอยหลัง
function toIso(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// เส้นตายต่อล็อก = 20:00 น. ของวันขายวันสุดท้าย (เหมือน utils/stallRenewal.js)
function atEightPm(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    date.setHours(20, 0, 0, 0);
    return date;
}

function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('th-TH')} บาท`;
}

function isWednesdayReminderDay(dateValue = new Date()) {
    const parsed = new Date(dateValue);
    return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 3;
}

function buildWednesdayReminderMessage() {
    return 'ทุกล็อคในรอบนี้ได้รับการแจ้งเตือนในวันพุธเพื่อเตรียมยืนยันการจองและตรวจสอบข้อมูลให้ครบถ้วนก่อนปิดรอบ';
}

// แจ้งเตือนกลุ่มจองครบ 14 วัน/ล็อกเต้ง (ช่วงที่ 1 จันทร์-อังคาร) ล่วงหน้าในวันพฤหัสบดี เวลา 15:00
// (พฤหัสบดีอยู่ในช่วงที่ 2 ของ getBookingPhaseForRound แต่ยังคงใช้เป็นวันแจ้งเตือนตามเดิม)
function isThursdayReminderDay(dateValue = new Date()) {
    const parsed = new Date(dateValue);
    return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 4;
}

function buildThursdayReminderMessage() {
    return 'แจ้งเตือนเวลา 15:00 น. — ร้านที่จองครบ 14 วันหรือขอล็อกเต็ง มีสิทธิ์จองล่วงหน้าในรอบถัดไปได้ตั้งแต่วันจันทร์-อังคารนี้';
}

// การ์ดแจ้งสลิปถูกแอดมินปฏิเสธ (ดู rejectPaymentSlip ใน approvalController.js) — โชว์เฉพาะตอนที่
// ยัง "ค้างรอสลิปใหม่" จริงๆ (สถานะ IN_PROGRESS, ล้าง paymentSlipImage ไปแล้ว แต่ยังไม่ได้อัปใหม่)
// ถ้าอัปสลิปใหม่ไปแล้ว paymentSlipImage จะไม่ว่าง การ์ดนี้หายไปเอง ไม่ต้องมี logic เคลียร์แยก
function buildSlipRejectedReminderEntry(latestBooking, status) {
    const reason = String(latestBooking?.slipVerifyReason || '');
    if (status !== 'IN_PROGRESS' || latestBooking?.paymentSlipImage || !reason.startsWith('[แอดมินปฏิเสธสลิป]')) {
        return [];
    }

    return [{
        id: `slip-rejected-${latestBooking.id || 'current'}`,
        type: 'cancelled',
        title: 'สลิปโอนเงินไม่ผ่านการตรวจสอบ',
        desc: `${reason.replace('[แอดมินปฏิเสธสลิป]', '').trim()} — กรุณาอัปโหลดสลิปโอนเงินใหม่ที่หน้าสถานะการจอง (ล็อกที่จัดไว้ยังเป็นของคุณเหมือนเดิม)`,
        date: formatDateThai(new Date()),
        time: formatTimeThai(new Date()),
        // ไม่มีเวลาที่แอดมินปฏิเสธสลิปเก็บไว้ — ไม่ใส่ at ให้ key อ่านแล้วคงที่ (ไม่งั้นเวลาเปลี่ยนทุกครั้งที่โหลดแล้วกลับเป็นยังไม่อ่าน)
        at: null,
        status: 'IN_PROGRESS',
        isRead: false,
        isNew: true,
        action: 'อัปโหลดสลิปใหม่',
        summary: `${reason.replace('[แอดมินปฏิเสธสลิป]', '').trim() || 'แอดมินปฏิเสธสลิป'} · ล็อกยังเป็นของคุณ`,
        link: '/booking-status',
        linkLabel: 'อัปโหลดสลิป',
        linkIcon: 'bi-upload'
    }];
}

// เหตุผลที่แอดมินปฏิเสธ (tag [REJECT_REASON: ...] ใน description ดู withRejectReason ใน controllers/approvalController.js)
function extractRejectReason(descriptionText) {
    const match = String(descriptionText || '').match(/\[REJECT_REASON:\s*([^\]]+)\]/);
    return match ? String(match[1] || '').trim() : null;
}

// หัวข้อ/ข้อความแจ้งเตือนของคำขอที่ถูกปฏิเสธ แยก 3 แบบให้ผู้ขายเข้าใจว่าเกิดอะไรขึ้น:
// คำขอต่อล็อกไม่ผ่าน (สัญญาเดิมยังใช้ได้) / ยกเลิกการจัดล็อก (เคยได้ล็อกแล้วแต่ไม่ชำระ ฯลฯ) / คำขอจองไม่ผ่านการตรวจสอบ
function describeRejection(request) {
    const reason = extractRejectReason(request.description);
    const reasonText = reason ? ` — เหตุผล: ${reason}` : ' กรุณาติดต่อแอดมินหากต้องการทราบเหตุผล';
    const zoneText = request.zone ? ` โซน ${request.zone}` : '';
    if (/^\[EXTEND_OF:\d+\]/.test(String(request.description || ''))) {
        return { title: 'คำขอต่อล็อกไม่ผ่าน', desc: `แอดมินไม่อนุมัติคำขอต่อล็อกของคุณ ล็อกยังใช้ได้ตามสัญญาเดิม${reasonText}` };
    }
    if (request.lockAssignedAt) {
        return { title: 'ยกเลิกการจัดล็อก', desc: `แอดมินยกเลิกล็อกที่จัดให้ในคำขอจอง${zoneText}${reasonText} หากยังต้องการขาย ส่งคำขอจองใหม่ได้` };
    }
    return { title: 'คำขอจองไม่ผ่านการตรวจสอบ', desc: `คำขอจอง${zoneText}ถูกปฏิเสธ${reasonText} หากต้องการจองใหม่ ส่งคำขอได้อีกครั้ง` };
}

// การ์ดย้ำเตือนต่อล็อก ผูกกับล็อกจริงที่แม่ค้าจองไว้ (assignedStallCode) โชว์ตั้งแต่ 1 วันก่อนวันขายสุดท้าย (D-1)
// จนถึง 20:00 ของวัน D (ดูกติกาใน utils/stallRenewal.js) — วัน D ตรงกับวันสิ้นรอบพอดีต่อไม่ได้ ชวนไปจองรอบใหม่แทน
function buildExtendLockReminderEntry(extendInfo) {
    if (!extendInfo?.currentBooking?.rentalEndDate) return [];
    if (extendInfo.pendingExtension) return []; // ยื่นคำขอต่อไปแล้ว ไม่ต้องย้ำ

    const { currentBooking, latestRequest, roundMeta } = extendInfo;
    const renewal = getRenewalOptions(currentBooking.rentalEndDate, new Date());
    if (!renewal || !renewal.isOpen || new Date().getTime() < renewal.opensAt.getTime()) return [];

    const stallLabel = latestRequest?.assignedStallCode ? `ล็อก ${latestRequest.assignedStallCode}` : 'ล็อกของคุณ';
    const cutoffText = `20:00 น. วันที่ ${formatDateThai(renewal.currentEnd)}`;
    const canExtend = renewal.fullRoundDays > 0;

    return [{
        id: `extend-reminder-${latestRequest.id}`,
        type: 'pending-review',
        title: canExtend ? 'ต่อล็อกไหม?' : 'ล็อกของคุณจะหมดรอบแล้ว',
        desc: canExtend
            ? `${stallLabel} ขายวันสุดท้ายวันที่ ${formatDateThai(renewal.currentEnd)} กด "ต่อล็อก" แล้วชำระเงิน ล็อกเดิมเป็นของคุณต่อทันที ไม่ต้องรอแอดมินจัดล็อกใหม่ (ต่อได้ถึงวันที่ ${formatDateThai(roundMeta.cycleEnd)}) ต้องต่อก่อน ${cutoffText} เลยเวลาแล้วล็อกจะถูกเปิดให้คนอื่นจอง`
            : `${stallLabel} ขายวันสุดท้ายของรอบวันที่ ${formatDateThai(renewal.currentEnd)} ต่อข้ามรอบไม่ได้ หากต้องการขายต่อให้จองรอบใหม่ ล็อกจะถูกเปิดให้คนอื่นหลัง ${cutoffText}`,
        date: formatDateThai(renewal.currentEnd),
        time: '20:00',
        at: toIso(renewal.opensAt),
        deadline: toIso(atEightPm(renewal.currentEnd)),
        status: 'IN_PROGRESS',
        isRead: false,
        isNew: true,
        action: canExtend ? 'ต่อล็อกก่อน 20:00 น.' : 'จองรอบใหม่',
        summary: `${stallLabel} · ขายวันสุดท้าย ${formatDateThai(renewal.currentEnd)}`,
        link: canExtend ? '/booking-stall/extend' : '/select-zone',
        linkLabel: canExtend ? 'ต่อล็อก' : 'จองรอบใหม่',
        linkIcon: 'bi-arrow-repeat',
        ...(canExtend && extendInfo.renewQuote ? { renew: extendInfo.renewQuote } : {})
    }];
}

// ข้อมูลปุ่ม "ต่อล็อก" ในการ์ดแจ้งเตือน — ต่อจนจบรอบด้วยราคาเดิม กดจากแจ้งเตือนแล้วไปหน้าชำระเงินเลย (POST /booking-stall/extend)
// days/total หักวันหยุดตลาดแล้ว (getBillableDays) ตรงกับยอดที่ POST คิดจริง
async function buildRenewQuote(extendInfo) {
    if (!extendInfo?.currentBooking?.rentalEndDate || extendInfo.pendingExtension) return null;
    const renewal = getRenewalOptions(extendInfo.currentBooking.rentalEndDate, new Date());
    if (!renewal?.canRenewFullRound) return null;
    const days = await getBillableDays(renewal.extendStart, renewal.roundEnd);
    if (days <= 0) return null;
    const dailyTotal = getExtensionDailyTotal(extendInfo.latestRequest, extendInfo.currentBooking);
    const end = renewal.roundEnd;
    return {
        stallCode: extendInfo.latestRequest.assignedStallCode || '',
        currentEndText: formatDateThai(renewal.currentEnd),
        newEndText: formatDateThai(end),
        newEndDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
        days,
        dailyTotal,
        total: dailyTotal * days
    };
}

// ประกาศต่อล็อกรอบถัดไป เฉพาะร้านล็อกเต็ง (Stall.extraPrice > 0) และร้านที่จองเต็มรอบ 14 วัน ที่ล็อกขายถึงวันสิ้นรอบนี้
// วันที่ทั้งหมดมาจาก getNextRoundPlan (utils/autoRoundAnnouncement.js) ชุดเดียวกับประกาศเปิดจองรอบใหม่ —
// ขึ้นตั้งแต่วันประกาศ (อาทิตย์) จนถึงกำหนดชำระของกลุ่มจอง 14 วัน (อังคาร 13:00) แล้วหายไปเอง
// ระบบยังต่อข้ามรอบให้อัตโนมัติไม่ได้ (utils/stallRenewal.js) ปุ่มเลยพาไปจองรอบถัดไปแบบ 14 วันตามปกติ
// preview = ทดสอบหน้าตาการ์ดนอกช่วงเวลาจริง (?previewNotice=1 นอก production ดู isNoticePreview) ข้ามเงื่อนไขช่วงเวลา/สิทธิ์ทั้งหมด
const NEXT_ROUND_PAYMENT_HOUR = 13;
async function buildNextRoundRenewEntry(userId, extendInfo, now = new Date(), { preview = false } = {}) {
    if (!extendInfo?.currentBooking?.rentalEndDate || !extendInfo.latestRequest) return [];
    const { currentBooking, latestRequest, roundMeta } = extendInfo;
    // ล็อกที่ยังต่อในรอบนี้ได้ ใช้การ์ด "ต่อล็อกไหม?" เดิม
    if (!preview && toStartOfDay(currentBooking.rentalEndDate).getTime() !== toStartOfDay(roundMeta.cycleEnd).getTime()) return [];

    const plan = getNextRoundPlan(now);
    if (!preview && plan.roundNumber !== roundMeta.roundNumber + 1) return [];
    const announceAt = addDays(plan.fullBookingOpen, -1);
    const deadline = new Date(plan.paymentDeadline);
    deadline.setHours(NEXT_ROUND_PAYMENT_HOUR, 0, 0, 0);
    if (!preview && (now.getTime() < announceAt.getTime() || now.getTime() >= deadline.getTime())) return [];

    const codes = String(latestRequest.assignedStallCode || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (!codes.length) return [];
    const [cornerCount, fullRoundBooking, nextRoundBooking] = await Promise.all([
        prisma.stall.count({ where: { stallCode: { in: codes }, extraPrice: { gt: 0 } } }),
        // จองตั้งแต่วันแรกของรอบ + ขายถึงวันสิ้นรอบ = จองเต็มรอบ — นับเฉพาะล็อกที่จะต่อ ร้านหลายล็อกไม่ได้สิทธิ์จากล็อกอื่น
        prisma.booking.findFirst({
            where: { userId, status: 'SUCCESS', slot: { slotNumber: { in: codes } }, rentalStartDate: { lt: addDays(roundMeta.cycleStart, 1) }, rentalEndDate: { gte: roundMeta.cycleStart } },
            select: { id: true }
        }),
        // จองรอบถัดไปไว้แล้ว ไม่ต้องเตือน
        prisma.booking.findFirst({
            where: { userId, status: { not: 'REJECTED' }, rentalStartDate: { gte: plan.cycleStart } },
            select: { id: true }
        })
    ]);
    const isCorner = cornerCount > 0;
    if (!preview && ((!isCorner && !fullRoundBooking) || nextRoundBooking)) return [];

    const stallText = codes.join(', ');
    const rangeText = `${formatDateThai(plan.cycleStart)} – ${formatDateThai(plan.cycleEnd)}`;
    const deadlineDay = deadline.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const deadlineText = `${deadlineDay} เวลา ${formatTimeThai(deadline)} น.`;
    const audience = isCorner ? 'ร้านค้าล็อกเต็ง' : 'ร้านค้าที่จองเต็มรอบ 14 วัน';

    return [{
        id: `next-round-renew-${plan.roundNumber}`,
        type: 'pending-review',
        title: 'ต่อล็อกรอบถัดไป',
        desc: `เรียน ${audience} ตลาดเปิดให้จองรอบถัดไป ${rangeText} หากต้องการต่อล็อกเดิม (${stallText}) ให้จองครบทั้งรอบ 14 วันและชำระค่าล็อกภายใน ${deadlineText}`,
        date: formatDateThai(announceAt),
        time: formatTimeThai(announceAt),
        at: toIso(preview ? now : announceAt),
        deadline: toIso(deadline),
        status: 'IN_PROGRESS',
        isRead: false,
        isNew: true,
        action: `ต่อล็อกรอบที่ ${plan.roundNumber} · ชำระก่อน ${formatTimeThai(deadline)} น.`,
        summary: `ล็อก ${stallText} · รอบ ${rangeText}`,
        link: '/select-zone',
        linkLabel: 'จองรอบถัดไป 14 วัน',
        linkIcon: 'bi-arrow-repeat',
        notice: {
            audience,
            isCorner,
            roundNumber: plan.roundNumber,
            stallCodes: codes,
            startText: formatDateThai(plan.cycleStart),
            endText: formatDateThai(plan.cycleEnd),
            days: BOOKING_ROUND_LENGTH_DAYS,
            deadlineDay,
            deadlineTime: `${formatTimeThai(deadline)} น.`,
            shortOpenText: formatDateThai(plan.shortBookingOpen),
            currentEndText: formatDateThai(currentBooking.rentalEndDate)
        }
    }];
}

// ประกาศเปิดจองรอบถัดไปให้ร้านค้าที่เหลือ — ตั้งแต่พุธ 13:00 (ช่วงจองสั้น ขั้นต่ำ 3 วัน / รายวัน) จนถึงวันเริ่มขายรอบถัดไป
// ร้านล็อกเต็ง/จองเต็มรอบได้การ์ด buildNextRoundRenewEntry ไปก่อนแล้ว (อาทิตย์–อังคาร 13:00) การ์ดนี้จึงไม่ซ้อนกัน
// ร้านที่จองรอบถัดไปไว้แล้วไม่ต้องเห็น
const SHORT_BOOKING_OPEN_HOUR = 13;
async function buildNextRoundOpenEntry(userRecord, now = new Date(), { preview = false } = {}) {
    if (!userRecord?.id || userRecord.role !== 'SELLER') return [];
    const plan = getNextRoundPlan(now);
    const opensAt = new Date(plan.shortBookingOpen);
    opensAt.setHours(SHORT_BOOKING_OPEN_HOUR, 0, 0, 0);
    const sellStart = toStartOfDay(plan.cycleStart);
    if (!preview && (now.getTime() < opensAt.getTime() || now.getTime() >= sellStart.getTime())) return [];

    const nextRoundBooking = await prisma.booking.findFirst({
        where: { userId: userRecord.id, status: { not: 'REJECTED' }, rentalStartDate: { gte: sellStart } },
        select: { id: true }
    });
    if (!preview && nextRoundBooking) return [];

    const rangeText = `${formatDateThai(plan.cycleStart)} – ${formatDateThai(plan.cycleEnd)}`;
    const sellStartDay = sellStart.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    return [{
        id: `next-round-open-${plan.roundNumber}`,
        type: 'info',
        title: 'เปิดจองรอบถัดไป',
        desc: `เรียน ร้านค้าทุกท่าน ตลาดเปิดให้จองรอบถัดไป ${rangeText} สำหรับร้านที่จองตั้งแต่ 3 วันขึ้นไปหรือจองรายวัน`,
        date: formatDateThai(opensAt),
        time: formatTimeThai(opensAt),
        at: toIso(preview ? now : opensAt),
        deadline: toIso(sellStart),
        status: 'PENDING',
        isRead: false,
        isNew: true,
        action: `จองรอบที่ ${plan.roundNumber} · เริ่มขาย ${formatDateThai(plan.cycleStart)}`,
        summary: `รอบ ${rangeText}`,
        link: '/select-zone',
        linkLabel: 'จองรอบถัดไป',
        linkIcon: 'bi-calendar-plus',
        notice: {
            kind: 'open',
            audience: 'ร้านค้าทุกท่าน',
            roundNumber: plan.roundNumber,
            stallCodes: [],
            startText: formatDateThai(plan.cycleStart),
            endText: formatDateThai(plan.cycleEnd),
            days: BOOKING_ROUND_LENGTH_DAYS,
            sellStartDay
        }
    }];
}

// PENDING = ยื่นคำขอแล้ว รอแอดมินตรวจสอบร้าน
// APPROVED = ร้านผ่านการตรวจสอบแล้ว รอแอดมินจัดล็อกให้
// IN_PROGRESS = แอดมินจัดล็อกให้แล้ว รอผู้ขายอัปโหลดสลิปยืนยันการชำระเงิน
// SUCCESS = ชำระเงินแล้ว ล็อกเป็นของผู้ขายรายนี้อย่างเป็นทางการ
function getBookingStep(status) {
    switch (status) {
        case 'APPROVED':
            return 1;
        case 'IN_PROGRESS':
            return 2;
        case 'SUCCESS':
            return 3;
        case 'REJECTED':
        case 'PENDING':
        default:
            return 1;
    }
}

function getBookingStatusText(status, awaitingPaymentVerification) {
    switch (status) {
        case 'APPROVED':
            return 'ร้านผ่านการตรวจสอบแล้ว รอแอดมินจัดสรรล็อก';
        case 'IN_PROGRESS':
            return awaitingPaymentVerification
                ? 'ส่งสลิปโอนเงินแล้ว รอแอดมินตรวจสอบและยืนยัน'
                : 'ได้รับล็อกแล้ว กรุณาชำระเงิน';
        case 'SUCCESS':
            return 'ชำระเงินสำเร็จ เสร็จสิ้นการจอง';
        case 'REJECTED':
            return 'รายการไม่ผ่านการตรวจสอบ';
        case 'PENDING':
        default:
            return 'รอการตรวจสอบร้านค้า';
    }
}



// รายการ "วันที่ขาย" แบบแจกแจงทีละวัน (เอาเฉพาะเลขวันที่ ไม่เอาเดือน) ตามฟอร์แมตใบเสนอราคาเดิม
// เช่น จอง 29 ส.ค. - 10 ก.ย. -> "29,30,31,1,2,3,4,5,6,7,8,9,10"
function buildSellDaysList(startDate, endDate) {
    if (!startDate || !endDate) return '';
    const days = [];
    const cursor = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return '';
    while (cursor.getTime() <= end.getTime()) {
        days.push(cursor.getDate());
        cursor.setDate(cursor.getDate() + 1);
    }
    return days.join(',');
}

function buildBookingView(latestBooking) {
    if (!latestBooking) return null;

    const zoneLabel = latestBooking.selectedZoneLabel || (latestBooking.zoneCode ? `โซน ${latestBooking.zoneCode}` : '-');
    const roundNumber = latestBooking.rentalStartDate
        ? getBookingRoundMetaForDate(latestBooking.rentalStartDate).roundNumber
        : null;
    const roundWindow = roundNumber ? getRoundWindow(roundNumber) : null;

    return {
        id: latestBooking.id,
        status: latestBooking.status,
        statusText: getBookingStatusText(latestBooking.status),
        stage: getBookingStep(latestBooking.status),
        roundNumber,
        roundDateRangeText: roundWindow
            ? `${formatDateThai(roundWindow.cycleStart)} ถึง ${formatDateThai(roundWindow.cycleEnd)}`
            : '-',
        sellDaysList: buildSellDaysList(latestBooking.rentalStartDate, latestBooking.rentalEndDate),
        zoneLabel,
        // ไม่เปิดเผยเลขล็อก (ทั้งเลขจริงและ placeholder ภายใน) จนกว่าจะยืนยันสลิปโอนเงินเสร็จ
        // ป้องกันลูกค้าเห็นตำแหน่งล็อกโดยยังไม่ต้องจ่ายเงิน — ดูการ merge สถานะจริงที่ loadSellerBookingStatus
        slotLabel: null,
        rentalStartDate: formatDateThai(latestBooking.rentalStartDate),
        rentalEndDate: formatDateThai(latestBooking.rentalEndDate),
        rentalDays: latestBooking.rentalDays || 1,
        stallCount: latestBooking.stallCount || 1,
        dailyStallPrice: Number(latestBooking.dailyStallPrice || 0),
        rentTotal: Number(latestBooking.rentTotal || 0),
        lightTotal: Number(latestBooking.lightTotal || 0),
        applianceTotal: Number(latestBooking.applianceTotal || 0),
        grandTotal: Number(latestBooking.grandTotal || 0),
        lightEnabled: Boolean(latestBooking.lightEnabled),
        smallApplianceCount: latestBooking.smallApplianceCount || 0,
        largeApplianceCount: latestBooking.largeApplianceCount || 0,
        smallFanCount: latestBooking.smallFanCount || 0,
        largeFanCount: latestBooking.largeFanCount || 0,
        applianceText: describeBookingAppliances(latestBooking),
        createdAt: formatDateThai(latestBooking.createdAt),
        createdTime: formatTimeThai(latestBooking.createdAt),
        storeDetailSnapshot: stripBookingRequestTag(latestBooking.storeDetailSnapshot) || '-',
        isFinalPrice: false
    };
}

function buildBookingNotifications(latestBooking, awaitingPaymentVerification, extendInfo) {
    const extendReminderEntry = buildExtendLockReminderEntry(extendInfo);

    if (!latestBooking) {
        return [
            ...extendReminderEntry,
            {
                id: 1,
                type: 'info',
                title: 'ยังไม่มีรายการจอง',
                desc: 'คุณยังไม่เคยทำรายการจองผ่านระบบ',
                date: '-',
                time: '-',
                at: null,
                status: 'PENDING',
                // ไม่ใช่เหตุการณ์ที่เกิดขึ้นจริง — หน้า /notifications แสดงเป็นแถบความคืบหน้าแทน ไม่นับเป็นยังไม่อ่าน
                upcoming: true
            }
        ];
    }

    const status = String(latestBooking.status || 'PENDING').toUpperCase();
    const statusText = getBookingStatusText(status, awaitingPaymentVerification);
    // ไม่เปิดเผยเลขล็อกจนกว่าจะยืนยันสลิปโอนเงินเสร็จ (ดู loadSellerBookingStatus)
    const stallLabel = latestBooking.slot?.slotNumber || null;
    const lockMention = stallLabel ? `ล็อก ${stallLabel}` : 'ล็อกของคุณ';
    const zoneLabel = latestBooking.zoneCode ? `โซน ${latestBooking.zoneCode}` : 'ที่แจ้งไว้';
    const receiptRequestId = extractBookingRequestId(latestBooking.storeDetailSnapshot);
    const extendStallCode = latestBooking.extendStallCode || null;

    const slipRejectedEntry = buildSlipRejectedReminderEntry(latestBooking, status);

    const reminderEntry = isWednesdayReminderDay(latestBooking.createdAt || new Date())
        ? [{
            id: `wednesday-reminder-${latestBooking.id || 'current'}`,
            type: 'pending-review',
            title: 'แจ้งเตือนวันพุธ',
            desc: buildWednesdayReminderMessage(),
            date: formatDateThai(latestBooking.createdAt || new Date()),
            time: formatTimeThai(latestBooking.createdAt || new Date()),
            at: toIso(latestBooking.createdAt),
            status,
            isRead: false,
            isNew: true
        }]
        : [];

    const thursdayReminderEntry = isThursdayReminderDay(latestBooking.createdAt || new Date())
        ? [{
            id: `thursday-reminder-${latestBooking.id || 'current'}`,
            type: 'pending-review',
            title: 'แจ้งเตือนวันพฤหัสบดี',
            desc: buildThursdayReminderMessage(),
            date: formatDateThai(latestBooking.createdAt || new Date()),
            time: formatTimeThai(latestBooking.createdAt || new Date()),
            at: toIso(latestBooking.createdAt),
            status,
            isRead: false,
            isNew: true
        }]
        : [];

    // สถานะปฏิเสธไม่ได้เดินตาม timeline ปกติ (รอตรวจสอบ -> จัดล็อก -> เสร็จสิ้น) จึงต้องแยก
    // แสดงเป็นการ์ดแจ้งเตือนของตัวเอง ไม่งั้นผู้ขายจะเห็นข้อความ "รอการตรวจสอบ" ค้างอยู่ทั้งที่คำขอถูกปฏิเสธไปแล้ว
    if (status === 'REJECTED') {
        return [
            ...extendReminderEntry,
            {
                id: 1,
                type: 'cancelled',
                title: latestBooking.rejection?.title || 'คำขอจองไม่ผ่านการตรวจสอบ',
                desc: latestBooking.rejection?.desc || `คำขอจอง${zoneLabel} ถูกปฏิเสธ กรุณาติดต่อแอดมินหรือส่งคำขอจองใหม่อีกครั้ง`,
                date: formatDateThai(latestBooking.createdAt),
                time: formatTimeThai(latestBooking.createdAt),
                at: toIso(latestBooking.createdAt),
                status: 'REJECTED',
                isRead: false,
                isNew: true,
                link: '/select-zone',
                linkLabel: 'จองใหม่',
                linkIcon: 'bi-shop'
            }
        ];
    }

    const timeline = [
        {
            id: 1,
            type: 'pending-review',
            title: 'รอการตรวจสอบรายการจอง',
            desc: `ระบบได้รับรายการจอง${zoneLabel} แล้ว`,
            date: formatDateThai(latestBooking.createdAt),
            time: formatTimeThai(latestBooking.createdAt),
            at: toIso(latestBooking.createdAt),
            step: 1,
            status: 'PENDING'
        },
        {
            id: 2,
            type: 'pending-payment',
            title: awaitingPaymentVerification
                ? 'ส่งสลิปโอนเงินแล้ว รอแอดมินตรวจสอบ'
                : (status === 'IN_PROGRESS'
                    ? (extendStallCode ? `ต่อล็อก ${extendStallCode} แล้ว รอชำระเงิน` : 'แอดมินจัดล็อกให้แล้ว รอชำระเงิน')
                    : 'ชำระเงินค่าจอง'),
            desc: awaitingPaymentVerification
                ? 'แอดมินกำลังตรวจสอบสลิปโอนเงินของคุณ เมื่อยืนยันแล้วระบบจะแจ้งเลขล็อกและยืนยันว่าเป็นของคุณอย่างเป็นทางการ'
                : (status === 'IN_PROGRESS'
                    ? (extendStallCode
                        ? `ระบบกันล็อกเดิม ${extendStallCode} ไว้ให้คุณแล้ว ไม่ต้องรอแอดมินจัดล็อกใหม่ กรุณาชำระเงินและอัปโหลดสลิปที่หน้าสถานะการจองภายในกำหนด ไม่งั้นล็อกจะกลับไปหมดสัญญาตามวันเดิม`
                        : 'แอดมินจัดล็อกให้คุณแล้ว กรุณาชำระเงินและอัปโหลดสลิปโอนเงินที่หน้าสถานะการจองเพื่อยืนยัน (เลขล็อกจะแจ้งให้ทราบหลังยืนยันการชำระเงิน)')
                    : `สถานะล่าสุด: ${statusText}`),
            date: formatDateThai(latestBooking.createdAt),
            time: formatTimeThai(latestBooking.createdAt),
            at: toIso(latestBooking.createdAt),
            step: 2,
            status: 'IN_PROGRESS',
            ...(status === 'IN_PROGRESS' && !awaitingPaymentVerification ? {
                action: 'ชำระเงินและอัปโหลดสลิป',
                summary: `คำขอจอง${zoneLabel}${latestBooking.paymentDueAt ? ` · ชำระก่อน ${formatDateThai(latestBooking.paymentDueAt)} ${formatTimeThai(latestBooking.paymentDueAt)} น.` : ''}`,
                deadline: toIso(latestBooking.paymentDueAt),
                link: '/booking-status',
                linkLabel: 'ไปชำระเงิน',
                linkIcon: 'bi-wallet2'
            } : {})
        },
        {
            id: 3,
            type: 'success-payment',
            title: 'เสร็จสิ้นการจอง',
            desc: `ยืนยันการชำระเงินเรียบร้อย ${lockMention} เป็นของร้านคุณอย่างเป็นทางการ`,
            date: formatDateThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            time: formatTimeThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            at: toIso(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            step: 3,
            status: 'SUCCESS',
            link: '/booking-status',
            linkLabel: 'ดูสถานะการจอง',
            linkIcon: 'bi-shop'
        },
        // การ์ดแจ้งว่าใบเสร็จ/ใบกำกับภาษีพร้อมแล้ว — โผล่เฉพาะตอนจ่ายเงินสำเร็จจริง (มีใบเสร็จให้ดูที่ /quotations/:id แล้ว)
        // type: 'success-receipt' ตรงกับไอคอน bi-file-earmark-text ที่ map ไว้ใน public/js/seller/statusbook.js อยู่แล้ว
        // ลิงก์ต้องใช้ BookingRequest.id (คนละ sequence กับ Booking.id) เหมือนที่หน้าประวัติการจองดึงผ่าน extractBookingRequestId
        ...(status === 'SUCCESS' && receiptRequestId ? [{
            id: 4,
            type: 'success-receipt',
            title: 'ใบเสนอราคาพร้อมแล้ว',
            desc: 'ใบเสนอราคาของคุณพร้อมให้ดูและดาวน์โหลดแล้ว',
            date: formatDateThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            time: formatTimeThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            at: toIso(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            status: 'SUCCESS',
            link: `/quotations/${receiptRequestId}`,
            linkLabel: 'ดูใบเสนอราคา',
            linkIcon: 'bi-receipt'
        }] : [])
    ];

    const stage = getBookingStep(status);
    return [...extendReminderEntry, ...slipRejectedEntry, ...thursdayReminderEntry, ...reminderEntry, ...timeline].map((item, index) => ({
        ...item,
        isRead: typeof item.isRead === 'boolean' ? item.isRead : index < stage,
        isNew: typeof item.isNew === 'boolean' ? item.isNew : index + 1 === stage,
        // ขั้นที่ยังไปไม่ถึง (เช่น "เสร็จสิ้นการจอง" ตอนยังรอตรวจ) ไม่ใช่แจ้งเตือนจริง — หน้า /notifications โชว์เป็นแถบความคืบหน้า
        // และไม่นับในเลขกระดิ่ง
        ...(item.step && item.step > stage ? { upcoming: true } : {})
    }));
}

// สร้างการ์ดแจ้งเตือนตอนคำขอใบกำกับภาษีมีความคืบหน้า (แอดมินออกให้แล้ว/ปฏิเสธ) — pattern เดียวกับ
// buildRepairNotifications ไม่แจ้งตอนยัง PENDING (รอแอดมินดำเนินการ ยังไม่มีความคืบหน้าให้แจ้ง)
function buildTaxInvoiceNotifications(taxInvoiceRequests) {
    return (taxInvoiceRequests || [])
        .filter((request) => request.status === 'ISSUED' || (request.status === 'CANCELLED' && !request.replacedBy))
        .map((request) => {
            const isIssued = request.status === 'ISSUED';
            const taxpayerName = request.taxInvoiceProfile?.taxpayerName || '-';
            return {
                id: `tax-invoice-${request.id}`,
                type: isIssued ? 'tax-invoice-issued' : 'tax-invoice-cancelled',
                title: isIssued ? 'ใบกำกับภาษีได้รับการอนุมัติแล้ว' : 'คำขอใบกำกับภาษีถูกปฏิเสธ',
                desc: isIssued
                    ? `ใบกำกับภาษีในนาม "${taxpayerName}" เลขที่ ${request.documentNumber} พร้อมให้ดูและดาวน์โหลดแล้ว`
                    : `คำขอใบกำกับภาษีในนาม "${taxpayerName}" ถูกปฏิเสธ${request.rejectReason ? ` เหตุผล: ${request.rejectReason}` : ''}`,
                date: formatDateThai(request.issuedAt || request.requestedAt),
                time: formatTimeThai(request.issuedAt || request.requestedAt),
                at: toIso(request.issuedAt || request.requestedAt),
                status: isIssued ? 'SUCCESS' : 'REJECTED',
                isRead: false,
                isNew: true,
                ...(isIssued
                    ? { link: `/tax-invoices/${request.id}`, linkLabel: 'ดูใบกำกับภาษี', linkIcon: 'bi-file-earmark-text' }
                    : { link: '/documents/tax-invoice', linkLabel: 'ขอใหม่', linkIcon: 'bi-file-earmark-plus' })
            };
        });
}

// สร้างการ์ดแจ้งเตือนตอนสถานะแจ้งซ่อมของผู้ใช้เปลี่ยน (รับเรื่อง/เสร็จ/ปฏิเสธ) ให้ขึ้นในหน้า
// /notifications เดียวกับแจ้งเตือนการจอง — ไม่แจ้งตอนยังเป็น PENDING (ยังไม่มีความคืบหน้าให้แจ้ง)
function buildRepairNotifications(reports) {
    const REPAIR_NOTIFICATION_META = {
        IN_PROGRESS: { type: 'repair-in_progress', title: 'เจ้าหน้าที่รับเรื่องแจ้งซ่อมแล้ว', verb: 'กำลังดำเนินการซ่อม' },
        SUCCESS: { type: 'repair-success', title: 'ซ่อมเสร็จเรียบร้อยแล้ว', verb: 'ซ่อมเสร็จแล้ว' },
        REJECTED: { type: 'repair-rejected', title: 'คำร้องแจ้งซ่อมถูกปฏิเสธ', verb: 'ถูกปฏิเสธ' }
    };

    return (reports || [])
        .filter((report) => REPAIR_NOTIFICATION_META[String(report.status || '').toUpperCase()])
        .map((report) => {
            const meta = REPAIR_NOTIFICATION_META[String(report.status).toUpperCase()];
            const reasonSuffix = report.status === 'REJECTED' && report.rejectReason
                ? ` เหตุผล: ${report.rejectReason}`
                : '';
            return {
                id: `repair-${report.id}`,
                type: meta.type,
                title: meta.title,
                desc: `คำร้องแจ้งซ่อม "${report.location} — ${report.category}" ${meta.verb}${reasonSuffix}`,
                date: formatDateThai(report.updatedAt),
                time: formatTimeThai(report.updatedAt),
                at: toIso(report.updatedAt),
                status: report.status,
                isRead: false,
                isNew: true
            };
        });
}


// การ์ดแจ้งเตือนคำขอบูธกิจกรรมของผู้ใช้ที่ login ตอนส่ง (EventBoothRequest.userId) — แจ้งเมื่อแอดมินตัดสินแล้ว
// desc ถูกใส่เป็น HTML ใน statusbook.js จึงต้อง escape ชื่องานที่ผู้ใช้พิมพ์เอง
function buildEventBoothNotifications(requests) {
    const META = {
        IN_PROGRESS: { type: 'pending-payment', title: 'อนุมัติบูธกิจกรรมแล้ว รอชำระเงิน' },
        SUCCESS: { type: 'success-payment', title: 'ยืนยันการชำระเงินบูธกิจกรรมแล้ว' },
        REJECTED: { type: 'cancelled', title: 'คำขอบูธกิจกรรมไม่ได้รับการอนุมัติ' }
    };
    const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    return (requests || [])
        .filter((request) => META[request.status])
        .map((request) => {
            const meta = META[request.status];
            const detail = request.status === 'REJECTED' && request.rejectReason
                ? ` เหตุผล: ${escape(request.rejectReason)}`
                : request.assignedStallCode ? ` บูธ ${escape(request.assignedStallCode)}` : '';
            return {
                id: `event-booth-${request.id}-${request.status}`,
                type: meta.type,
                title: meta.title,
                desc: `งาน "${escape(request.eventTitle)}"${detail}`,
                date: formatDateThai(request.updatedAt),
                time: formatTimeThai(request.updatedAt),
                at: toIso(request.updatedAt),
                status: request.status,
                isRead: false,
                isNew: true,
                ...(request.status === 'IN_PROGRESS' && !request.paymentSlipImage ? { action: 'ชำระเงินค่าบูธ' } : {}),
                link: `/event-booth/track/${request.trackingToken}`,
                linkLabel: request.status === 'IN_PROGRESS' && !request.paymentSlipImage ? 'ชำระเงิน' : 'ดูคำขอบูธ',
                linkIcon: 'bi-calendar-event'
            };
        });
}

function getBookingStatusClass(status) {
    switch (status) {
        case 'SUCCESS':
            return 'status-pill--success';
        case 'REJECTED':
            return 'status-pill--danger';
        case 'APPROVED':
        case 'IN_PROGRESS':
            return 'status-pill--warning';
        case 'PENDING':
        default:
            return 'status-pill--neutral';
    }
}



// Middleware ตรวจสอบการ Login
const isAuthenticated = (req, res, next) => {
    if (!req.user) {
        return res.redirect("/");
    }
    next();
};

const isSellerOnly = (req, res, next) => {
    if (!req.user) {
        return res.redirect('/');
    }

    if (req.user.role !== 'SELLER') {
        return res.redirect('/shop-application?error=sellers_only');
    }

    next();
};

// อนุญาตให้ผู้ขายจริง (SELLER) หรือลูกค้าที่สมัครเปิดร้านค้าแล้ว (รอแอดมินอนุมัติ)
// เข้าเลือกโซน/ล็อกและจ่ายเงินได้เลย ไม่ต้องรอ admin อนุมัติเป็น SELLER ก่อน
const isSellerOrApplicant = async (req, res, next) => {
    if (!req.user) {
        return res.redirect('/');
    }

    if (req.user.role === 'SELLER') {
        return next();
    }

    if (req.user.role === 'CUSTOMER') {
        const application = await prisma.sellerApplication.findFirst({
            where: {
                userId: req.user.id,
                status: { in: ['PENDING', 'APPROVED'] }
            },
            orderBy: { createdAt: 'desc' }
        });
        if (application) {
            req.sellerApplication = application;
            return next();
        }
    }

    return res.redirect('/shop-application?error=not_applied');
};

// ไฟล์ปฏิทิน .ics ของผู้ขาย (เส้นตายต่อล็อก + วันสำคัญรอบจองถัดไป) — ปุ่ม "เพิ่มลงปฏิทิน" ในหน้าหลักผู้ขาย
router.get('/seller/calendar.ics', isSellerOnly, async (req, res) => {
    try {
        const home = await buildSellerHome(req.user.id);
        const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const { text } = buildSellerCalendar(home, baseUrl);
        res.set('Content-Type', 'text/calendar; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="kangsadan-night.ics"');
        return res.send(text);
    } catch (error) {
        console.error('Seller calendar error:', error);
        return res.status(500).send('สร้างไฟล์ปฏิทินไม่สำเร็จ');
    }
});

router.get('/seller', isSellerOnly, async (req, res) => {
    // ข้อมูลหน้าแรกผู้ขายรวมอยู่ที่ utils/sellerHome.js (สถานะร้านคืนนี้, สิ่งที่ต้องทำ, ล็อกของฉัน, ตัวเลขสรุป, ความเคลื่อนไหว)
    const home = await buildSellerHome(req.user.id);
    return res.render('seller/indexseller', { user: req.user, home });
});

// --- หน้าประวัติการจองย้อนหลังทั้งหมดของผู้ขาย (ทุกรอบ ไม่ใช่แค่รายการล่าสุด) ---
router.get('/booking-history', isAuthenticated, async (req, res) => {
    const bookings = await prisma.booking.findMany({
        where: { userId: req.user.id },
        include: { slot: true },
        orderBy: { createdAt: 'desc' }
    });

    const bookingHistoryView = bookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        statusText: getBookingStatusText(booking.status),
        statusClass: getBookingStatusClass(booking.status),
        roundNumber: booking.rentalStartDate ? getBookingRoundMetaForDate(booking.rentalStartDate).roundNumber : null,
        zoneLabel: booking.selectedZoneLabel || (booking.zoneCode ? `โซน ${booking.zoneCode}` : '-'),
        slotLabel: booking.status === 'SUCCESS' ? (booking.slot?.slotNumber || '-') : null,
        receiptRequestId: booking.status === 'SUCCESS' ? extractBookingRequestId(booking.storeDetailSnapshot) : null,
        rentalStartDate: formatDateThai(booking.rentalStartDate),
        rentalEndDate: formatDateThai(booking.rentalEndDate),
        stallCount: booking.stallCount || 1,
        grandTotal: Number(booking.grandTotal || 0),
        createdAt: formatDateThai(booking.createdAt)
    }));

    res.render('seller/bookingHistory', {
        user: req.user,
        bookings: bookingHistoryView
    });
});

// --- รายงานการเช่าและชำระเงินของร้าน (หลายรอบ ยอดสะสม) — อ่านอย่างเดียว ดู utils/rentalStatement.js ---
router.get('/rental-statement', isSellerOnly, async (req, res) => {
    try {
        const range = rentalStatement.parseStatementRange(req.query);
        // ?shop= กรองเฉพาะร้านนั้น (ต้องเป็นร้านของตัวเอง) ไม่ระบุ = ทุกร้าน
        const shops = await getUserShops(req.user.id, { select: { id: true, shopName: true } });
        const shopId = shops.some((shop) => String(shop.id) === String(req.query.shop)) ? Number(req.query.shop) : null;
        const statement = await rentalStatement.buildSellerStatement(req.user.id, range, shopId);
        if (!statement) return res.redirect('/seller');
        const queryString = rentalStatement.rangeQueryString(range) + (shopId ? `&shop=${shopId}` : '');
        return res.render('seller/rentalStatement', {
            user: req.user,
            statement,
            shops,
            company: COMPANY_INFO,
            queryString,
            printedAt: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
        });
    } catch (error) {
        console.error('rental statement error', error);
        return res.redirect('/booking-history');
    }
});

// --- ขอเอกสาร: ใบกำกับภาษี + สัญญาเช่า อยู่ที่เดียวกัน แต่แยกหน้า/แยกฟอร์ม กันสับสน ---
// /documents = หน้าเลือกว่าจะขออะไร, /documents/tax-invoice และ /documents/lease-contract = ฟอร์มของแต่ละอย่าง
router.get('/documents', isSellerOnly, async (req, res) => {
    try {
        const [taxInvoiceRequests, leaseRequests] = await Promise.all([
            taxInvoiceCtrl.buildTaxInvoiceListRows({ requestedByUserId: req.user.id }),
            leaseContractCtrl.getLeaseRequestsForUser(req.user.id)
        ]);
        return res.render('seller/documents', { user: req.user, taxInvoiceRequests, leaseRequests });
    } catch (error) {
        console.error('documents hub error', error);
        return res.redirect('/seller');
    }
});

router.get('/documents/tax-invoice', isSellerOnly, async (req, res) => {
    try {
        const [eligibleQuotations, taxInvoiceProfiles, taxInvoiceRequests] = await Promise.all([
            taxInvoiceCtrl.getEligibleQuotationsForUser(req.user.id),
            taxInvoiceCtrl.getTaxInvoiceProfilesForUser(req.user.id),
            taxInvoiceCtrl.buildTaxInvoiceListRows({ requestedByUserId: req.user.id })
        ]);
        return res.render('seller/documentTaxInvoice', {
            user: req.user,
            eligibleQuotations,
            eligibleGroupsByShop: taxInvoiceCtrl.groupEligibleByShop(eligibleQuotations),
            taxInvoiceProfiles,
            taxInvoiceRequests,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('tax invoice documents page error', error);
        return res.redirect('/documents');
    }
});

router.get('/documents/lease-contract', isSellerOnly, async (req, res) => {
    try {
        // 1 สัญญา = 1 ร้าน — เลือกร้านด้วย ?shop= (ไม่ระบุ = ร้านหลัก) ช่วงวันเริ่มต้นคำนวณจากร้านที่เลือก
        const [shops, selectedShop] = await Promise.all([
            getUserShops(req.user.id, { select: { id: true, shopName: true } }),
            resolveShopForUser(req.user.id, req.query.shop, { select: { id: true, shopName: true } })
        ]);
        const shop = selectedShop || shops[0] || null;
        const [leaseRequests, paidSpan] = await Promise.all([
            leaseContractCtrl.getLeaseRequestsForUser(req.user.id),
            shop ? leaseContract.getPaidSpan(req.user.id, shop.id) : null
        ]);
        const today = new Date();
        return res.render('seller/documentLeaseContract', {
            user: req.user,
            shops,
            shop,
            leaseRequests,
            paidSpan: paidSpan ? {
                ...paidSpan,
                startKey: rentalStatement.toDateKey(paidSpan.start),
                endKey: rentalStatement.toDateKey(paidSpan.end),
                text: `${rentalStatement.formatThaiDate(paidSpan.start)} – ${rentalStatement.formatThaiDate(paidSpan.end)}`
            } : null,
            defaults: {
                start: paidSpan ? rentalStatement.toDateKey(paidSpan.start) : rentalStatement.toDateKey(new Date(today.getFullYear(), 0, 1)),
                end: paidSpan ? rentalStatement.toDateKey(paidSpan.end) : rentalStatement.toDateKey(today)
            },
            leaseSuccess: req.query.lease === 'requested',
            leaseError: req.query.leaseError || null
        });
    } catch (error) {
        console.error('lease documents page error', error);
        return res.redirect('/documents');
    }
});

// ขอสัญญาเช่า — ระบบสร้างร่างจากประวัติการจอง แอดมินอนุมัติ (controllers/leaseContractController.js)
router.post('/lease-contracts', isSellerOnly, async (req, res) => {
    try {
        const error = await leaseContractCtrl.createLeaseRequest(req.user.id, req.body);
        const shopQuery = /^\d+$/.test(String(req.body.shopId || '')) ? `&shop=${req.body.shopId}` : '';
        if (error) return res.redirect(`/documents/lease-contract?leaseError=${error}${shopQuery}`);
        return res.redirect(`/documents/lease-contract?lease=requested${shopQuery}`);
    } catch (error) {
        console.error('lease contract request error', error);
        return res.redirect('/documents/lease-contract?leaseError=action_failed');
    }
});

router.get('/lease-contracts/:id', isSellerOnly, leaseContractCtrl.getSellerDocument);

router.get('/rental-statement.csv', isSellerOnly, async (req, res) => {
    try {
        const range = rentalStatement.parseStatementRange(req.query);
        const shops = await getUserShops(req.user.id, { select: { id: true } });
        const shopId = shops.some((shop) => String(shop.id) === String(req.query.shop)) ? Number(req.query.shop) : null;
        const rows = await rentalStatement.loadStatementRows({ userId: req.user.id, shopId, range });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${rentalStatement.csvFilename('rental-statement', range)}"`);
        return res.send(rentalStatement.statementRowsToCsv(rows));
    } catch (error) {
        console.error('rental statement csv error', error);
        return res.redirect('/rental-statement');
    }
});

// จำนวนรูปสินค้า/รูปเมนูสูงสุดที่แกลเลอรีในหน้าโปรไฟล์ร้านค้ารับได้
const MAX_SHOP_PRODUCT_IMAGES = 6;
const MAX_SHOP_MENU_IMAGES = 4;
const SHOP_GALLERY_INCLUDE = {
    productImages: { orderBy: { createdAt: 'asc' } },
    menuImages: { orderBy: { createdAt: 'asc' } }
};

// แยกรูปเดิมที่จะลบ/เก็บไว้ และรับรูปใหม่ได้ไม่เกินจำนวนช่องที่เหลือ — ใช้ทั้งแกลเลอรีรูปสินค้าและรูปเมนู
function planGalleryUpdate(existingImages, removeIdsText, newFiles, maxCount) {
    const removeIds = String(removeIdsText || '')
        .split(',')
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id));
    const toRemove = existingImages.filter((img) => removeIds.includes(img.id));
    const kept = existingImages.filter((img) => !removeIds.includes(img.id));
    const accepted = (newFiles || []).slice(0, Math.max(0, maxCount - kept.length));
    return { toRemove, kept, accepted };
}

// ร้านที่กำลังแก้ใน /shop-profile (?shop=<id>) — 1 ผู้ใช้มีได้หลายร้าน ไม่ระบุ/ไม่ใช่ร้านตัวเอง = ร้านหลัก
async function loadProfileShop(req) {
    const [shops, shop] = await Promise.all([
        getUserShops(req.user.id, { select: { id: true, shopName: true } }),
        resolveShopForUser(req.user.id, req.query.shop, { include: SHOP_GALLERY_INCLUDE })
    ]);
    return { shops, shop: shop || await getPrimaryShop(req.user.id, { include: SHOP_GALLERY_INCLUDE }) };
}

// ส่วน "แผงของร้านนี้" ในหน้าร้านค้าของฉัน: แผงที่ชำระแล้ว สัญญายังไม่หมด + คำขอลาหยุด/เช่าช่วงที่ยังไม่จบ
async function loadShopStallPanel(userId, shop) {
    if (!shop) return null;
    const [stalls, openStatus] = await Promise.all([
        stallLeave.loadShopStalls(userId, shop.id),
        getOpenStatus(shop.id)
    ]);
    const codes = stalls.map((s) => s.code);
    const leaves = codes.length
        ? await prisma.stallLeaveRequest.findMany({
            where: { stallCode: { in: codes }, shopId: shop.id, status: { in: stallLeave.ACTIVE_STATUSES }, endDate: { gte: businessDateOf() } },
            orderBy: { startDate: 'asc' }
        })
        : [];
    return {
        shopId: shop.id,
        openStatus,
        stalls: stalls.map((s) => ({
            code: s.code,
            contractText: `${stallLeave.thaiDate(s.contractStart)} – ${stallLeave.thaiDate(s.contractEnd)}`,
            leaves: leaves.filter((l) => l.stallCode === s.code).map((l) => ({
                kindLabel: stallLeave.KIND_LABEL[l.kind],
                statusLabel: stallLeave.STATUS_LABEL[l.status],
                status: l.status,
                rangeText: stallLeave.rangeText(l)
            }))
        }))
    };
}

// --- หน้าแก้ไขโปรไฟล์ร้านค้า (เฉพาะผู้ขายที่ได้รับอนุมัติเป็น SELLER แล้ว) ---
router.get('/shop-profile', isSellerOnly, async (req, res) => {
    const { shops, shop } = await loadProfileShop(req);

    // ขอใบกำกับภาษีย้ายไปอยู่หน้า /documents/tax-invoice (รวมกับขอสัญญาเช่าที่ /documents)
    const [viewStats, reviewPanel, myStalls] = await Promise.all([
        getShopViewStats(req.user.id),
        // รีวิวร้านจากสมาชิก — ผู้ขายตอบ/รายงานรีวิวได้ (public/js/seller/shopReviews.js)
        getSellerReviewPanel(req.user.id),
        // แผงของร้านนี้ + สถานะเปิด/ปิดวันนี้ + คำขอลาหยุดที่ยังมีผล
        loadShopStallPanel(req.user.id, shop)
    ]);

    res.render('seller/shopProfile', {
        user: req.user,
        shop: shop || null,
        shops,
        profile: buildProfileChecks(shop),
        maxProductImages: MAX_SHOP_PRODUCT_IMAGES,
        maxMenuImages: MAX_SHOP_MENU_IMAGES,
        viewStats,
        reviewPanel,
        myStalls,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

router.post('/shop-profile', isSellerOnly, (req, res) => {
    async function renderWithError(errorCode) {
        const { shops, shop } = await loadProfileShop(req);
        return res.render('seller/shopProfile', {
            user: req.user,
            shop: shop || null,
            shops,
            profile: buildProfileChecks(shop),
            maxProductImages: MAX_SHOP_PRODUCT_IMAGES,
            maxMenuImages: MAX_SHOP_MENU_IMAGES,
            error: errorCode,
            success: null,
            formData: req.body
        });
    }

    uploadShopProfile.fields([
        { name: 'productImages', maxCount: MAX_SHOP_PRODUCT_IMAGES },
        { name: 'menuImages', maxCount: MAX_SHOP_MENU_IMAGES },
        { name: 'shopCoverImage', maxCount: 1 },
        { name: 'logoImage', maxCount: 1 }
    ])(req, res, async (err) => {
        if (err) {
            return renderWithError('upload_failed');
        }

        try {
            const parsed = shopProfileSchema.safeParse(req.body);
            if (!parsed.success) {
                return renderWithError('missing_fields');
            }

            const { productDetail, shopSummary, shopTags } = parsed.data;
            const shopCoverImage = req.files?.shopCoverImage?.[0]
                ? req.files.shopCoverImage[0].url
                : undefined;
            const removeShopCoverImage = !shopCoverImage && req.body.removeShopCoverImage === '1';
            const logoImage = req.files?.logoImage?.[0]?.url;
            const removeLogoImage = !logoImage && req.body.removeLogoImage === '1';

            // ชื่อร้าน/ประเภทสินค้าไม่รับจากฟอร์มนี้ (ดูเหตุผลใน utils/validationSchemas.js) — ถ้ายังไม่มี
            // ShopDetail มาก่อนเลย (กรณีข้อมูลเก่าก่อนมีการซิงก์อัตโนมัติ) ค่อย fallback ไปเอาจากใบสมัครล่าสุด
            // ร้านที่แก้มาจาก ?shop= ใน action ของฟอร์ม (ตรวจว่าเป็นร้านของผู้ใช้เอง) ไม่ระบุ = ร้านหลัก
            const existingShop = await resolveShopForUser(req.user.id, req.query.shop, { include: SHOP_GALLERY_INCLUDE });
            if (req.query.shop && !existingShop) {
                return renderWithError('shop_not_found');
            }
            let fallbackShopName = existingShop?.shopName;
            let fallbackProductType = existingShop?.productType;
            if (!fallbackShopName || !fallbackProductType) {
                const latestApplication = await prisma.sellerApplication.findFirst({
                    where: { userId: req.user.id },
                    orderBy: { createdAt: 'desc' }
                });
                fallbackShopName = fallbackShopName || latestApplication?.shopName || 'ยังไม่ได้ตั้งชื่อร้าน';
                fallbackProductType = fallbackProductType || latestApplication?.productType || null;
            }

            const product = planGalleryUpdate(existingShop?.productImages || [], req.body.removeProductImageIds, req.files?.productImages, MAX_SHOP_PRODUCT_IMAGES);
            const menu = planGalleryUpdate(existingShop?.menuImages || [], req.body.removeMenuImageIds, req.files?.menuImages, MAX_SHOP_MENU_IMAGES);
            const keptProductImages = product.kept;
            const acceptedNewFiles = product.accepted;

            // ลบไฟล์รูปเดิมออกจากที่เก็บ (Cloudinary/disk) เมื่อมีการกดลบรูปทิ้ง หรืออัปโหลดรูปหน้าปกใหม่ทับ
            const oldFilesToDelete = [...product.toRemove, ...menu.toRemove].map((img) => img.imageUrl);
            if ((shopCoverImage || removeShopCoverImage) && existingShop?.shopCoverImage) {
                oldFilesToDelete.push(existingShop.shopCoverImage);
            }
            if ((logoImage || removeLogoImage) && existingShop?.logoImage) {
                oldFilesToDelete.push(existingShop.logoImage);
            }
            await Promise.all(oldFilesToDelete.map((oldUrl) => deleteImage(oldUrl)));

            const shopDetail = existingShop
                ? await prisma.shopDetail.update({
                    where: { id: existingShop.id },
                    data: {
                        productDetail: productDetail || null,
                        shopSummary: shopSummary || null,
                        shopTags: shopTags || null,
                        ...(shopCoverImage ? { shopCoverImage } : removeShopCoverImage ? { shopCoverImage: null } : {}),
                        ...(logoImage ? { logoImage } : removeLogoImage ? { logoImage: null } : {})
                    }
                })
                : await prisma.shopDetail.create({
                    data: {
                        userId: req.user.id,
                        shopName: fallbackShopName,
                        productType: fallbackProductType,
                        productDetail: productDetail || null,
                        shopSummary: shopSummary || null,
                        shopTags: shopTags || null,
                        shopCoverImage: shopCoverImage || null,
                        logoImage: logoImage || null
                    }
                });

            if (product.toRemove.length) {
                await prisma.shopProductImage.deleteMany({
                    where: { id: { in: product.toRemove.map((img) => img.id) }, shopDetailId: shopDetail.id }
                });
            }
            if (menu.toRemove.length) {
                await prisma.shopMenuImage.deleteMany({
                    where: { id: { in: menu.toRemove.map((img) => img.id) }, shopDetailId: shopDetail.id }
                });
            }
            if (menu.accepted.length) {
                await prisma.shopMenuImage.createMany({
                    data: menu.accepted.map((file) => ({ shopDetailId: shopDetail.id, imageUrl: file.url }))
                });
            }
            if (acceptedNewFiles.length) {
                await prisma.shopProductImage.createMany({
                    data: acceptedNewFiles.map((file) => ({
                        shopDetailId: shopDetail.id,
                        imageUrl: file.url
                    }))
                });
            }

            // productImage (scalar) คงไว้เป็นรูปแรกของแกลเลอรีเสมอ เพื่อไม่ให้หน้าอื่นที่ยังอ้างอิงรูปเดียว (ผังตลาด/คอมมูนิตี้/แดชบอร์ด) พัง
            const newPrimaryImage = keptProductImages[0]?.imageUrl
                || (acceptedNewFiles[0] ? acceptedNewFiles[0].url : null);
            if (newPrimaryImage !== existingShop?.productImage) {
                await prisma.shopDetail.update({
                    where: { id: shopDetail.id },
                    data: { productImage: newPrimaryImage }
                });
            }

            return res.redirect(`/shop-profile?success=profile_updated${req.query.shop ? `&shop=${shopDetail.id}` : ''}`);
        } catch (dbErr) {
            return renderWithError('db_error');
        }
    });
});

// เส้นทาง community ถูกแยกไปจัดการที่ routes/communityRoutes.js แล้ว

// --- ผังตลาด (read-only สำหรับลูกค้าทั่วไป/ผู้ขาย ดูร้านค้า+ค้นหาร้านค้า) ---
// เปิดได้โดยไม่ต้องล็อกอิน — ลูกค้าหน้าตลาดสแกน QR ที่ป้ายหน้าร้านแล้วเข้ามาดูร้าน/เมนูได้ทันที
// ข้อมูลภายใน (ล็อกว่าง/วันหมดสัญญา/ผลตรวจ/ราคา) server ตัดออกตาม role อยู่แล้ว ดู getMarketMapPage
router.get('/market-map', getMarketMapPage);

// โปรวันนี้ (ผู้ขาย) — ข้อความว่าง = ลบโปร / หมดอายุเองวันขายถัดไป
router.post('/shop-promo', isSellerOnly, async (req, res) => {
    try {
        const promo = await setPromo(req.user.id, req.body?.text);
        return res.json({ success: true, text: promo ? promo.text : null });
    } catch (error) {
        console.error('Shop promo error:', error);
        return res.status(500).json({ success: false, message: 'บันทึกโปรไม่สำเร็จ กรุณาลองใหม่' });
    }
});

// "ปิดร้านวันนี้" / ยกเลิกการปิด (ผู้ขาย) — เรียกจากหน้าแรกผู้ขายและการ์ดล็อกตัวเองบนผัง
router.post('/shop-status', isSellerOnly, async (req, res) => {
    try {
        const open = req.body?.open === true || req.body?.open === 'true';
        // ปิดแยกต่อร้าน — ไม่ส่ง shopId มา = ร้านหลัก / ส่งร้านที่ไม่ใช่ของตัวเองมา = ไม่พบร้าน
        const shop = await resolveShopForUser(req.user.id, req.body?.shopId);
        if (!shop) return res.status(404).json({ success: false, message: 'ไม่พบร้านของคุณ' });
        const status = await setOpenStatus(shop, open);
        return res.json({ success: true, shopId: shop.id, ...status });
    } catch (error) {
        console.error('Shop open status error:', error);
        return res.status(500).json({ success: false, message: 'บันทึกสถานะร้านไม่สำเร็จ กรุณาลองใหม่' });
    }
});
router.get('/market-map/qr/:code.svg', marketMapCtrl.getStallQr);
router.get('/market-map/sign/:code', marketMapCtrl.getStallSign);
router.get('/market-map/print', isStaffOrAdmin, marketMapCtrl.getPrintableMap);
router.post('/market-map/track', shopViewLimiter, marketMapCtrl.trackShopView);

// --- หน้าประกาศ (แยกประกาศสำคัญ / ข่าวสารทั่วไป) ---
// ไม่ต้องล็อกอิน: คนทั่วไปเห็นเฉพาะประกาศที่แอดมินตั้งกลุ่ม "ผู้เยี่ยมชม" (GUEST) เหมือนหน้าแรก
router.get('/announcements', async (req, res) => {
    const roleToFetch = !req.user ? 'GUEST' : (req.user.role === 'SELLER' ? 'SELLER' : 'CUSTOMER');
    const announcements = await getAnnouncementsForUser(roleToFetch);
    const importantAnnouncements = announcements.filter((a) => a.isImportant);
    const generalAnnouncements = announcements.filter((a) => !a.isImportant);

    res.render('announcements', {
        user: req.user || null,
        importantAnnouncements,
        generalAnnouncements
    });
});

// --- สมัครเปิดร้านค้า (CUSTOMER สมัครแล้วรออนุมัติเป็น SELLER) ---
// ประเภทสินค้าที่เลือกในใบสมัครกำหนดโซนที่จองได้หลังอนุมัติ (utils/zoneAccess.js) — โชว์ให้ผู้สมัครเห็นก่อนเลือก
const SHOP_APPLICATION_PRODUCT_TYPES = ['FOOD', 'FASHION', 'อื่นๆ'];
// req.user มาจาก JWT ซึ่งไม่มีเบอร์โทร — ดึงจาก DB เพื่อเติมช่องเบอร์ในฟอร์มให้ล่วงหน้า
async function getUserPhoneNumber(userId) {
    const record = await prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } });
    return record?.phoneNumber || '';
}

function getApplicationZonesByType() {
    return Object.fromEntries(SHOP_APPLICATION_PRODUCT_TYPES.map((type) => [
        type,
        zoneAccess.allowedZonesFor(type).map((z) => String(z).toUpperCase())
    ]));
}

function parseUrlList(value) {
    try {
        const list = JSON.parse(value || '[]');
        return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

// ใบสมัครไม่ผ่าน → เติมข้อมูลเดิมให้แก้เฉพาะจุด ไม่ต้องพิมพ์ใหม่ทั้งฟอร์ม (ยกเว้นการยอมรับกฎ ต้องกดใหม่ทุกครั้ง)
function applicationToFormData(application) {
    return {
        shopName: application.shopName || '',
        productType: application.productType || '',
        productSubtype: application.productSubtype || '',
        productSubtypeOther: application.productSubtypeOther || '',
        productDetail: application.productDetail || '',
        shopSummary: application.shopSummary || '',
        shopTags: application.shopTags || '',
        phoneNumber: application.phoneNumber || '',
        bankName: application.bankName || '',
        bankAccountNumber: application.bankAccountNumber || '',
        bankAccountName: application.bankAccountName || ''
    };
}

// รูปของใบสมัครที่ไม่ผ่านไม่ถูกลบ (ดู rejectSellerApplication) — ให้ติ๊กใช้ซ้ำได้แทนการอัปโหลดใหม่
function getReusableImages(application) {
    if (!application || application.status !== 'REJECTED') return null;
    const images = {
        cover: application.shopCoverImage || null,
        logo: application.logoImage || null,
        products: parseUrlList(application.productImages),
        menus: parseUrlList(application.menuImages)
    };
    return images.cover || images.logo || images.products.length || images.menus.length ? images : null;
}

// ผู้ขายที่มีร้านแล้วสมัครเปิดร้านเพิ่ม (?new=1) — 1 ผู้ใช้มีได้หลายร้าน ใบสมัครร้านใหม่ยังไม่ผูกร้าน (shopId null)
// อนุมัติแล้วสร้างร้านใหม่ (sellerApplicationController.approveSellerApplication)
function isNewShopRequest(req) {
    return req.user.role === 'SELLER' && req.query.new === '1';
}

// ใบสมัครที่ใช้แสดงสถานะ/เติมฟอร์ม: โหมดร้านใหม่ดูเฉพาะใบสมัครร้านใหม่ (ยังไม่ผูกร้าน) ไม่งั้นใบสมัครล่าสุดของผู้ใช้
function findLatestApplication(req) {
    return prisma.sellerApplication.findFirst({
        where: { userId: req.user.id, ...(isNewShopRequest(req) ? { shopId: null } : {}) },
        orderBy: { createdAt: 'desc' }
    });
}

async function renderShopApplication(req, res, { latestApplication, error = null, success = null, formData = null }) {
    await loadCustomSubtypes();
    return res.render('seller/shopApplication', {
        user: req.user,
        latestApplication,
        newShopMode: isNewShopRequest(req),
        bankNames: THAI_BANK_NAMES,
        productSubtypeGroups: getProductSubtypeGroups(),
        zonesByType: getApplicationZonesByType(),
        maxProductImagesCount: MAX_SHOP_PRODUCT_IMAGES,
        maxMenuImagesCount: MAX_SHOP_MENU_IMAGES,
        userPhoneNumber: await getUserPhoneNumber(req.user.id),
        previousImages: getReusableImages(latestApplication),
        prefilledFromRejected: !formData && latestApplication?.status === 'REJECTED',
        error,
        success,
        formData: formData || (latestApplication?.status === 'REJECTED' ? applicationToFormData(latestApplication) : null)
    });
}

router.get('/shop-application', isAuthenticated, async (req, res) => {
    const latestApplication = await findLatestApplication(req);

    return renderShopApplication(req, res, {
        latestApplication,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// เช็คชื่อร้านซ้ำระหว่างพิมพ์ (แค่เตือน ไม่บล็อก) — ร้านที่อนุมัติแล้ว (รวมร้านอื่นของตัวเอง เพราะ 1 ผู้ใช้มีได้หลายร้าน) + ใบสมัครที่รอตรวจของคนอื่น
// ชื่อซ้ำทำให้จับคู่ร้าน/คำขอจองจากชื่อปนกันได้ (ดูหมายเหตุ "ล็อกของฉัน" ใน CLAUDE.md)
// ใช้ limiter เดียวกับสถิติเปิดดูร้าน (60 ครั้ง/นาที) กันยิงไล่เดาชื่อร้าน
router.get('/shop-application/check-name', isAuthenticated, shopViewLimiter, async (req, res) => {
    const name = String(req.query.name || '').trim().slice(0, 200);
    if (!name) return res.json({ taken: false });
    try {
        const [shop, pendingApplication] = await Promise.all([
            prisma.shopDetail.findFirst({ where: { shopName: name }, select: { id: true } }),
            prisma.sellerApplication.findFirst({ where: { shopName: name, status: 'PENDING', NOT: { userId: req.user.id } }, select: { id: true } })
        ]);
        return res.json({ taken: !!(shop || pendingApplication) });
    } catch (error) {
        return res.json({ taken: false });
    }
});

router.post('/shop-application', isAuthenticated, (req, res) => {
    // ส่งไม่ผ่าน = ไม่มีใบสมัครอ้างถึงรูปที่เพิ่งอัปโหลด ลบทิ้งกันไฟล์ค้างใน Cloudinary/uploads
    function uploadedFileUrls() {
        return Object.values(req.files || {}).flat().map((file) => file.url).filter(Boolean);
    }

    async function renderWithError(errorCode) {
        await Promise.all(uploadedFileUrls().map((url) => deleteImage(url).catch(() => {})));
        const latestApplication = await findLatestApplication(req);
        // checkbox หลายตัวชื่อเดียวกัน (productSubtype) req.body ส่งมาเป็น array/string/undefined
        // แปลงเป็น comma string ก่อนส่งกลับให้ view เพื่อ pre-check กล่องเดิมไว้ (ดู sellerApplicationSchema)
        const rawSubtype = req.body.productSubtype;
        const formData = {
            ...req.body,
            productSubtype: Array.isArray(rawSubtype) ? rawSubtype.join(',') : (rawSubtype || '')
        };
        return renderShopApplication(req, res, { latestApplication, error: errorCode, formData });
    }

    const newShop = isNewShopRequest(req);
    if (req.user.role !== 'CUSTOMER' && !newShop) {
        return res.redirect('/shop-application?error=not_customer');
    }

    uploadShopApplication.fields([
        { name: 'shopCoverImage', maxCount: 1 },
        { name: 'logoImage', maxCount: 1 },
        { name: 'productImages', maxCount: MAX_SHOP_PRODUCT_IMAGES },
        { name: 'menuImages', maxCount: MAX_SHOP_MENU_IMAGES }
    ])(req, res, async (err) => {
        if (err) {
            return renderWithError('upload_failed');
        }

        try {
            // รายการที่แอดมินเพิ่มต้องอยู่ใน cache ก่อน validate (refine ของ productSubtype เป็น sync)
            await loadCustomSubtypes();
            const parsed = sellerApplicationSchema.safeParse(req.body);
            if (!parsed.success) {
                return renderWithError('missing_fields');
            }

            const pendingApplication = await prisma.sellerApplication.findFirst({
                where: { userId: req.user.id, status: 'PENDING' }
            });
            if (pendingApplication) {
                return renderWithError('already_pending');
            }

            const {
                shopName,
                productType,
                productSubtype,
                productSubtypeOther,
                productDetail,
                shopSummary,
                shopTags,
                sellerName,
                bankName,
                bankAccountNumber,
                bankAccountName,
                phoneNumber
            } = parsed.data;
            const toUrlList = (files) => (files && files.length ? JSON.stringify(files.map((file) => file.url)) : null);

            // ติ๊ก "ใช้รูปจากใบสมัครครั้งก่อน" — ช่องไหนไม่ได้อัปโหลดใหม่ ใช้รูปของใบสมัครที่ไม่ผ่านล่าสุดของตัวเองแทน
            // (ดึงจาก DB ด้วย userId เสมอ ไม่รับ URL จากฟอร์ม กันอ้างรูปของคนอื่น)
            let previousImages = null;
            if (req.body.reusePreviousImages === '1') {
                const previousApplication = await prisma.sellerApplication.findFirst({
                    where: { userId: req.user.id, status: 'REJECTED', ...(newShop ? { shopId: null } : {}) },
                    orderBy: { createdAt: 'desc' },
                    select: { shopCoverImage: true, logoImage: true, productImages: true, menuImages: true }
                });
                previousImages = previousApplication || null;
            }
            const shopCoverImage = req.files?.shopCoverImage?.[0]?.url || previousImages?.shopCoverImage || null;
            const logoImage = req.files?.logoImage?.[0]?.url || previousImages?.logoImage || null;
            const productImagesValue = toUrlList(req.files?.productImages) || previousImages?.productImages || null;
            const menuImagesValue = toUrlList(req.files?.menuImages) || previousImages?.menuImages || null;

            await prisma.sellerApplication.create({
                data: {
                    userId: req.user.id,
                    shopName,
                    productType,
                    productSubtype,
                    productSubtypeOther,
                    productDetail,
                    shopSummary: shopSummary || null,
                    shopTags: shopTags || null,
                    sellerName,
                    bankName,
                    bankAccountNumber,
                    bankAccountName,
                    phoneNumber,
                    shopCoverImage,
                    logoImage,
                    productImages: productImagesValue,
                    menuImages: menuImagesValue,
                    termsAcceptedAt: new Date(),
                    status: 'PENDING'
                }
            });

            // ร้านใหม่ของผู้ขายเดิมจองแผงได้หลังอนุมัติแล้วเท่านั้น (ตอนจองต้องเลือกร้านที่มีอยู่จริง)
            if (newShop) return res.redirect('/shop-application?new=1&success=application_submitted');
            return res.redirect('/select-zone');
        } catch (dbErr) {
            return renderWithError('db_error');
        }
    });
});

// รหัสล็อคที่ผู้ขายกำลังใช้งานอยู่จริง — เดินตามเส้นทางเดียวกับที่ scoreReportController.js/approvalController.js
// ใช้กันทั้งระบบ: Booking(SUCCESS).storeDetailSnapshot -> [BOOKING_REQUEST_ID:x] -> BookingRequest.assignedStallCode
// (ไม่ใช้ BookingItem/Stall เพราะ BookingItem ไม่เคยถูกเติมข้อมูลจริงในระบบนี้)
async function getActiveStallCodesForUser(userId) {
    const activeBookings = await prisma.booking.findMany({
        where: { userId, status: 'SUCCESS' },
        select: { storeDetailSnapshot: true }
    });

    const requestIds = Array.from(new Set(
        activeBookings
            .map((b) => extractBookingRequestId(b.storeDetailSnapshot))
            .filter(Boolean)
    ));

    if (!requestIds.length) return [];

    const requests = await prisma.bookingRequest.findMany({
        where: { id: { in: requestIds } },
        select: { assignedStallCode: true }
    });

    const codes = requests.flatMap((r) => String(r.assignedStallCode || '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean));

    return Array.from(new Set(codes));
}

// --- 1. หน้าแจ้งซ่อม ---
router.get("/repair", isAuthenticated, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id }
    });
    const reports = await prisma.maintenanceReport.findMany({
        where: { userId: req.user.id },
        include: { assignedTo: { select: { name: true } }, images: true },
        orderBy: { createdAt: 'desc' }
    });
    const activeStallCodes = await getActiveStallCodesForUser(req.user.id);
    res.render("seller/repair", {
        user: user,
        reports: reports,
        activeStallCodes: activeStallCodes,
        prefillStall: req.query.stall || '',
        maxImages: REPAIR_MAX_IMAGES,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// บันทึกแจ้งซ่อม (POST)
router.post("/repair", isAuthenticated, (req, res) => {
    upload.array('images', REPAIR_MAX_IMAGES)(req, res, async (err) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
                return res.redirect(`/repair?error=too_many_images`);
            }
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.redirect("/repair?error=file_too_large");
            }
            return res.redirect("/repair?error=upload_failed");
        }

        try {
            const parsed = repairReportSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.redirect("/repair?error=missing_fields");
            }
            const { location, category, description } = parsed.data;

            await prisma.maintenanceReport.create({
                data: {
                    location,
                    category,
                    description,
                    userId: req.user.id,
                    images: {
                        create: (req.files || []).map((f) => ({ imageUrl: f.url }))
                    }
                }
            });
            res.redirect("/repair?success=true");
        } catch (error) {
            console.error("Repair Error:", error);
            res.redirect("/repair?error=db_error");
        }
    });
});

// --- 2. หน้าเลือกโซน/แผงค้า ---
const zoneAccess = require('../utils/zoneAccess');

// ร้านที่กำลังจองให้ — 1 ผู้ใช้มีได้หลายร้าน เลือกด้วย ?shop= (หน้าเลือกโซน/ฟอร์มจอง) หรือ shopId (POST)
// ไม่ระบุ/ไม่ใช่ร้านของผู้ใช้ = ร้านหลัก / ผู้สมัครที่ยังไม่มีร้าน = null (ใช้ข้อมูลจากใบสมัครแทนเหมือนเดิม)
// ใบสมัครเปิดร้านใหม่ที่ยังรอตรวจเลือกจองได้ด้วย (id `app-<id>`, ดู pendingShopsOfUser ใน utils/shops.js)
// — ร้านจริงสร้างตอนแอดมินยืนยันสลิป เหมือนร้านแรกของผู้สมัครใหม่
const ALL_SHOPS_INCLUDE = { shops: SHOP_ORDER };
async function loadBookingUser(userId) {
    const [record, pendingShops] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, include: ALL_SHOPS_INCLUDE }),
        pendingShopsOfUser(userId)
    ]);
    if (record) record.bookingShops = [...(record.shops || []), ...pendingShops];
    return record;
}
function pickBookingShop(userRecord, rawShopId) {
    const shops = userRecord?.bookingShops || userRecord?.shops || [];
    const wanted = String(rawShopId ?? '').trim();
    return (wanted && shops.find((shop) => String(shop.id) === wanted)) || shops[0] || null;
}

router.get("/select-zone", isAuthenticated, isSellerOrApplicant, async (req, res) => {
    try {
        // ดึงข้อมูลผู้ขายจากฐานข้อมูล (รวมถึง shop.productType ของร้านที่เลือก)
        // ถ้ายังไม่ใช่ SELLER จริง (สมัครแล้วรออนุมัติอยู่) ใช้ productType จากใบสมัครแทน
        const userRecord = await loadBookingUser(req.user.id);
        const selectedShop = pickBookingShop(userRecord, req.query.shop);

        const productType = selectedShop?.productType || req.sellerApplication?.productType || null;
        const allowedZones = zoneAccess.allowedZonesFor(productType);

        const zoneDetails = await loadZoneDetailsMap();

        res.render("seller/select_zone", {
            user: req.user,
            shops: userRecord?.bookingShops || [],
            selectedShop,
            productType,
            allowedZones,
            zoneDetails,
            cornerZoneOptions: CORNER_ZONE_OPTIONS,
            roundTimeline: getRoundTimeline(new Date())
        });
    } catch (err) {
        console.error('select-zone error', err);
        res.render("seller/select_zone", {
            user: req.user,
            productType: null,
            allowedZones: ['a'],
            zoneDetails: {},
            cornerZoneOptions: CORNER_ZONE_OPTIONS
        });
    }
});

// --- 3. หน้าจองแผงค้า ---
// ค่าที่ผู้ขายกรอกมา ส่งกลับไปเติมฟอร์มเมื่อเซิร์ฟเวอร์ตีกลับ (เดิมทุกช่องรีเซ็ตเป็นค่าเริ่มต้น ต้องกรอกใหม่หมด)
function pickBookingFormValues(body) {
    const b = body || {};
    const asText = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
    return {
        roundChoice: asText(b.roundChoice, 10),
        dateStart: asText(b.dateStart, 20),
        dateEnd: asText(b.dateEnd, 20),
        stallCount: asText(b.stallCount, 4),
        storeDetail: asText(b.storeDetail, 2000),
        cornerZone: asText(b.cornerZone, 4),
        applianceItems: asText(b.applianceItems, 8000)
    };
}

// รายละเอียดร้านที่เคยพิมพ์ในคำขอก่อน (ตัด tag ภายในและหมายเหตุแผงพิเศษที่ระบบต่อท้ายให้ออก)
function cleanStoreDetailSnapshot(snapshot) {
    const text = stripBookingRequestTag(snapshot || '').replace(/\[สนใจแผงพิเศษ:[^\]]+\]/g, '').trim();
    return text === 'ไม่มีรายละเอียดเพิ่มเติม' ? '' : text;
}

function toDateKey(dateValue) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// render หน้าจองแผงจากจุดเดียว (GET และทุกกรณีที่ POST ตีกลับ) ให้ข้อมูลรอบ/ราคา/โควตาครบเสมอ
// gate (ถูกระงับสิทธิ์ / ไม่ได้เลือกโซน / ไม่มีสิทธิ์โซน / ไม่มีราคา) จะซ่อนฟอร์มและบอกเหตุผลแทน
async function renderBookingStallPage(req, res, { status = 200, zoneCode = '', error = null, userRecord = null, formValues = null, cornerParam = null, shopId = null } = {}) {
    const record = userRecord || await loadBookingUser(req.user.id);
    const shop = pickBookingShop(record, shopId);
    const productType = shop?.productType || req.sellerApplication?.productType || null;
    const allowedZones = zoneAccess.allowedZonesFor(productType).map((z) => String(z).toUpperCase());
    const now = new Date();
    const bookingRoundInfo = getBookingRoundInfoForDate(now);
    const nextRoundInfo = getBookingRoundInfoForDate(addDays(bookingRoundInfo.cycleEnd, 1));

    let gateError = null;
    let zone = String(zoneCode || '').toUpperCase();
    let zonePrice = 0;
    if (record?.isBlacklisted) {
        gateError = 'ร้านค้าของคุณถูกระงับสิทธิ์การจองแผง (Blacklist) กรุณาติดต่อผู้ดูแลตลาด';
    } else if (!zone) {
        gateError = 'กรุณาเลือกโซนจากหน้าเลือกโซนก่อนทำรายการจอง';
    } else if (allowedZones.length && !allowedZones.includes(zone)) {
        gateError = 'คุณไม่มีสิทธิ์จองโซนนี้ตามประเภทสินค้าของคุณ';
    } else {
        zonePrice = await getDailyPriceByZoneCode(zone);
        if (!zonePrice) gateError = 'ไม่พบราคาของโซนนี้ในฐานข้อมูล';
    }
    if (gateError) {
        return res.status(status === 200 ? 400 : status).render('seller/booking_stall', {
            user: record,
            zone: null,
            zonePrice: 0,
            error: error || gateError,
            gateError
        });
    }

    // โควตานับต่อร้าน (ดู utils/stallQuota.js)
    const countLocks = (round) => countShopStallsInRound(req.user.id, shop?.id, round);
    const [stallQuotaSettings, currentLockCount, nextLockCount, holidaysInView, roundBookings, recentBookings] = await Promise.all([
        getStallQuotaSettings(),
        countLocks(bookingRoundInfo),
        countLocks(nextRoundInfo),
        getHolidaysInRange(bookingRoundInfo.cycleStart, nextRoundInfo.cycleEnd),
        prisma.booking.findMany({
            where: {
                userId: req.user.id,
                status: { not: 'REJECTED' },
                rentalEndDate: { gte: bookingRoundInfo.cycleStart },
                rentalStartDate: { lte: nextRoundInfo.cycleEnd }
            },
            select: { rentalStartDate: true, rentalEndDate: true }
        }),
        prisma.booking.findMany({
            where: { userId: req.user.id, status: { not: 'REJECTED' } },
            orderBy: { createdAt: 'desc' },
            take: 10
        })
    ]);

    // วันที่ผู้ขายมีคำขอ/ล็อกอยู่แล้ว โชว์บนปฏิทินย่อของรอบ กันจองซ้อนวันเดิมโดยไม่รู้ตัว
    const bookedDates = new Set();
    roundBookings.forEach((b) => {
        if (!b.rentalStartDate || !b.rentalEndDate) return;
        for (let d = toStartOfDay(b.rentalStartDate); d <= toStartOfDay(b.rentalEndDate); d = addDays(d, 1)) {
            bookedDates.add(toDateKey(d));
        }
    });

    // "จองเหมือนรอบที่แล้ว" — ใช้คำขอจองใหม่ล่าสุด (ข้ามคำขอต่อล็อกที่ไม่มีรายละเอียดร้าน/เครื่องใช้ไฟฟ้าของตัวเอง)
    const lastBookingRow = recentBookings.find((b) => !cleanStoreDetailSnapshot(b.storeDetailSnapshot).startsWith('ขอต่อล็อก')) || null;
    const lastBooking = lastBookingRow ? {
        roundNumber: lastBookingRow.rentalStartDate ? getBookingRoundMetaForDate(lastBookingRow.rentalStartDate).roundNumber : null,
        zoneCode: lastBookingRow.zoneCode,
        stallCount: lastBookingRow.stallCount || 1,
        storeDetail: cleanStoreDetailSnapshot(lastBookingRow.storeDetailSnapshot),
        items: readBookingApplianceItems(lastBookingRow),
        applianceText: describeBookingAppliances(lastBookingRow)
    } : null;

    const buildRoundOption = (key, round, lockCount) => {
        const phaseInfo = getBookingPhaseForRound(round, now);
        return {
            key,
            roundNumber: round.roundNumber,
            cycleStart: toDateKey(round.cycleStart),
            cycleEnd: toDateKey(round.cycleEnd),
            phase: phaseInfo.phase,
            allowCornerZone: Boolean(phaseInfo.allowCornerZone),
            minDays: phaseInfo.minDays || 1,
            allowSingleDay: Boolean(phaseInfo.allowSingleDay),
            maxAdvanceStart: phaseInfo.maxAdvanceStart ? toDateKey(phaseInfo.maxAdvanceStart) : '',
            // วันเปิดจอง (จันทร์ก่อนรอบ) — สูตรเดียวกับ phase1Start ใน getBookingPhaseForRound
            openDate: toDateKey(addDays(addDays(round.cycleStart, 1), -5)),
            // จองยาวช่วงจันทร์-อังคาร ต้องชำระก่อนวันพุธ (ช่วงรายวันคำนวณจากวันเริ่มขายฝั่ง client)
            paymentDeadline: phaseInfo.phase === 1 ? toDateKey(getPaymentDeadlineForRound(round)) : '',
            existingLockCount: lockCount
        };
    };

    return res.status(status).render('seller/booking_stall', {
        user: record,
        zone,
        zonePrice,
        error,
        gateError: null,
        defaultStoreDetail: shop?.productDetail || shop?.shopSummary || req.sellerApplication?.productDetail || '',
        shop,
        shopCount: (record?.bookingShops || record?.shops || []).length,
        formValues,
        cornerZoneValue: resolveCornerZonePrice(formValues ? formValues.cornerZone : cornerParam),
        roundOptions: [
            buildRoundOption('current', bookingRoundInfo, currentLockCount),
            buildRoundOption('next', nextRoundInfo, nextLockCount)
        ],
        holidaysInView,
        bookedDates: [...bookedDates],
        lastBooking,
        todayKey: toDateKey(now),
        // เลยบ่าย 3 แล้ว จองเริ่มขายวันนี้ไม่ได้ (ขายวันนี้ต้องชำระก่อน 15:00)
        sameDayClosed: now.getHours() >= SAME_DAY_PAYMENT_CUTOFF_HOUR,
        serverNowMs: now.getTime(),
        sameDayCutoffMs: getSameDayPaymentCutoff(now).getTime(),
        sameDayCutoffHour: SAME_DAY_PAYMENT_CUTOFF_HOUR,
        allowedZoneCount: allowedZones.length,
        pricing: {
            lightUnitPrice: LIGHT_UNIT_PRICE,
            maxStallsPerSeller: getShopQuota(shop, stallQuotaSettings),
            isFashionSeller: zoneAccess.normalizeProductType(productType) === 'FASHION',
            cornerZoneOptions: CORNER_ZONE_OPTIONS,
            applianceKinds: APPLIANCE_KINDS,
            appliancePresets: APPLIANCE_PRESETS,
            smallApplianceMaxWatt: SMALL_APPLIANCE_MAX_WATT,
            maxQtyPerItem: APPLIANCE_MAX_QTY_PER_ITEM
        }
    });
}

// โซนกิจกรรม (บูธกิจกรรม) ไม่ได้จองผ่านฟอร์มจองแผง — ส่งไปฟอร์มขอจัดบูธกิจกรรม (controllers/eventBoothController.js)
const isEventZoneCode = (zone) => String(zone || '').trim().toUpperCase() === EVENT_ZONE_CODE;

router.get("/booking-stall", isAuthenticated, isSellerOrApplicant, async (req, res) => {
    if (isEventZoneCode(req.query.zone)) return res.redirect('/event-booth');
    return renderBookingStallPage(req, res, { zoneCode: req.query.zone, cornerParam: req.query.corner, shopId: req.query.shop });
});

router.post('/booking-stall', isSellerOrApplicant, async (req, res) => {
    const zoneCode = String(req.body.zone || '').trim().toUpperCase();
    if (isEventZoneCode(zoneCode)) return res.redirect('/event-booth');
    const formValues = pickBookingFormValues(req.body);
    let userRecord = null;
    const rejectBooking = (message, status = 400) => renderBookingStallPage(req, res, { status, zoneCode, error: message, userRecord, formValues, shopId: req.body.shopId });

    try {
        userRecord = await loadBookingUser(req.user.id);
        const bookingShop = pickBookingShop(userRecord, req.body.shopId);
        if (req.body.shopId && bookingShop && String(bookingShop.id) !== String(req.body.shopId)) {
            return rejectBooking('ไม่พบร้านที่เลือก กรุณาเลือกร้านใหม่จากหน้าเลือกโซน');
        }
        const productType = bookingShop?.productType || req.sellerApplication?.productType || null;
        const allowedZones = zoneAccess.allowedZonesFor(productType).map(z => String(z).toUpperCase());

        // ร้านที่แอดมิน Blacklist จากคะแนนตรวจตลาด จองแผงรอบใหม่ไม่ได้ (ดู controllers/scoreReportController.js)
        if (userRecord?.isBlacklisted) {
            return rejectBooking('ร้านค้าของคุณถูกระงับสิทธิ์การจองแผง (Blacklist) กรุณาติดต่อผู้ดูแลตลาด', 403);
        }
        if (!zoneCode) {
            return rejectBooking('ไม่พบโซนที่ต้องการจอง');
        }
        if (allowedZones.length && !allowedZones.includes(zoneCode)) {
            return rejectBooking('คุณไม่มีสิทธิ์จองโซนนี้ตามประเภทสินค้าของคุณ', 403);
        }

        const zonePrice = await getDailyPriceByZoneCode(zoneCode);
        if (!zonePrice) {
            return rejectBooking('ไม่พบราคาโซนจากฐานข้อมูล', 404);
        }

        const inputValidation = bookingStallInputSchema.safeParse(req.body);
        if (!inputValidation.success) {
            return rejectBooking('ข้อมูลจำนวนแผง/เครื่องใช้ไฟฟ้าหรือวันที่ที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
        }

        const stallCount = Math.max(1, safeInt(req.body.stallCount, 1));
        const lightEnabled = true;
        const cornerZoneValue = resolveCornerZonePrice(req.body.cornerZone);
        const cornerZoneOption = CORNER_ZONE_OPTIONS.find((opt) => opt.value === cornerZoneValue) || null;
        const storeDetail = String(req.body.storeDetail || '').trim();

        // ฟอร์มใหม่ส่งรายการเครื่องใช้ไฟฟ้าพร้อมชื่อเป็น JSON (applianceItems) — นับจำนวนแต่ละประเภทจากรายการนี้เท่านั้น
        // ถ้าไม่ได้ส่งมา (API/ฟอร์มเก่า) ใช้ช่องจำนวนเครื่องเล็ก/ใหญ่แบบเดิม
        let applianceItems = null;
        let applianceCounts;
        if (typeof req.body.applianceItems === 'string') {
            const parsedAppliances = parseApplianceItems(req.body.applianceItems);
            if (parsedAppliances.error) return rejectBooking(parsedAppliances.error);
            applianceItems = parsedAppliances.items;
            applianceCounts = summarizeApplianceItems(applianceItems);
        } else {
            applianceCounts = {
                smallApplianceCount: Math.max(0, safeInt(req.body.smallApplianceCount, 0)),
                largeApplianceCount: Math.max(0, safeInt(req.body.largeApplianceCount, 0)),
                smallFanCount: 0,
                largeFanCount: 0
            };
        }

        const startDate = toStartOfDay(req.body.dateStart);
        const endDate = toStartOfDay(req.body.dateEnd);
        if (!startDate || !endDate || endDate < startDate) {
            return rejectBooking('กรุณาเลือกวันที่เช่าให้ถูกต้อง');
        }

        const rentalDays = getRentalDays(startDate, endDate);

        // กันเลือกวันที่ผ่านมาแล้ว (เช่น เลือก dateStart เป็นเมื่อวานในรอบที่กำลังเปิดอยู่)
        if (startDate < toStartOfDay(new Date())) {
            return rejectBooking('ไม่สามารถเลือกวันที่ที่ผ่านมาแล้วได้ กรุณาเลือกวันที่ปัจจุบันหรือวันในอนาคต');
        }

        // ขายวันนี้เลยต้องชำระก่อน 15:00 — เลยเวลานั้นแล้วจึงจองเริ่มวันนี้ไม่ได้ (ดู getSameDayPaymentCutoff)
        if (startDate.getTime() === toStartOfDay(new Date()).getTime() && new Date() >= getSameDayPaymentCutoff(startDate)) {
            return rejectBooking(`เลย ${SAME_DAY_PAYMENT_CUTOFF_HOUR}:00 น. แล้ว จองขายวันนี้ไม่ได้ (ขายวันนี้ต้องชำระเงินก่อน ${SAME_DAY_PAYMENT_CUTOFF_HOUR}:00 น.) กรุณาเลือกเริ่มขายพรุ่งนี้`);
        }

        // จองข้ามรอบไม่ได้ (วันเริ่ม/สิ้นสุดต้องอยู่ในรอบ 14 วันเดียวกัน)
        const targetRoundMeta = getBookingRoundMetaForDate(startDate);
        const endRoundMeta = getBookingRoundMetaForDate(endDate);

        if (endRoundMeta.roundNumber !== targetRoundMeta.roundNumber) {
            return rejectBooking('ห้ามจองข้ามรอบ กรุณาเลือกวันที่เริ่มและสิ้นสุดให้อยู่ในรอบการจองเดียวกัน');
        }

        // กติกา 2 ช่วงก่อนรอบจะเปิด (ดู utils/bookingRound.js: getBookingPhaseForRound)
        const phaseInfo = getBookingPhaseForRound(targetRoundMeta, new Date());

        if (phaseInfo.phase === 'not_open_yet') {
            return rejectBooking('ยังไม่ถึงช่วงเปิดจองสำหรับรอบนี้ กรุณารอให้ถึงวันจันทร์ก่อนรอบจะเปิด');
        }

        if (cornerZoneValue > 0 && !phaseInfo.allowCornerZone) {
            return rejectBooking('เลือกล็อคเต็ง (แผงพิเศษ) ได้เฉพาะช่วงจันทร์-อังคารก่อนเปิดรอบเท่านั้น');
        }

        if (phaseInfo.phase === 1) {
            // ช่วงจันทร์-อังคารก่อนเปิดรอบ: ทั้งล็อคเต็งและล็อคปกติที่ต้องการจองช่วงนี้
            // ต้องจองเต็มรอบ 14 วันเท่านั้น บังคับน้อยกว่านี้ไม่ได้ (ใช้กับล็อคเต็งด้วย ไม่ใช่แค่ล็อคปกติ)
            const isFullRound = startDate.getTime() === toStartOfDay(targetRoundMeta.cycleStart).getTime()
                && endDate.getTime() === toStartOfDay(targetRoundMeta.cycleEnd).getTime();
            if (!isFullRound) {
                return rejectBooking('ช่วงจันทร์-อังคารก่อนเปิดรอบ จองได้เฉพาะเต็มรอบ 14 วันเท่านั้น (รวมถึงล็อคเต็งด้วย)');
            }
        }

        if (phaseInfo.minDays && rentalDays < phaseInfo.minDays && !(phaseInfo.allowSingleDay && rentalDays === 1)) {
            return rejectBooking(`ช่วงนี้ต้องจองต่อเนื่องอย่างน้อย ${phaseInfo.minDays} วัน หรือจองทีละ 1 วัน`);
        }

        if (phaseInfo.maxAdvanceStart && startDate.getTime() > toStartOfDay(phaseInfo.maxAdvanceStart).getTime()) {
            return rejectBooking('จองล่วงหน้าได้แค่ 1 วันก่อนวันขายเท่านั้น');
        }

        // วันหยุดที่แอดมินประกาศ (ปีใหม่/สงกรานต์ ฯลฯ) จองไม่ได้ ไม่คิดเงิน แต่ไม่กระทบโครงสร้างรอบ
        // (ดู utils/bookingHolidays.js) — ถ้าทั้งช่วงที่เลือกเป็นวันหยุดหมดเลย (เช่น จองทีละวันตรงวันหยุด) ต้อง reject ทันที
        const billableDays = await getBillableDays(startDate, endDate);
        if (billableDays <= 0) {
            return rejectBooking('ช่วงวันที่เลือกเป็นวันหยุดทั้งหมด ไม่สามารถจองได้ กรุณาเลือกวันอื่น');
        }

        // จำกัดจำนวนล็อคต่อร้าน (นับรวมทุกโซนในรอบเดียวกัน) กันร้านเดียวกวาดหลายล็อคแล้วปล่อยเช่าต่อ
        // โควตา = ค่าที่แอดมินตั้งให้ร้านนี้ หรือค่ากลาง (utils/stallQuota.js, /admin/stall-quota) — FASHION ให้แอดมิน
        // ใช้ดุลยพินิจ (ไม่บล็อกตรงนี้ แต่ปล่อยให้แอดมินเห็น/ตัดสินใจตอนจัดล็อก)
        const sellerProductType = zoneAccess.normalizeProductType(productType);
        const isUncappedFashion = sellerProductType === 'FASHION';
        const shopQuota = getShopQuota(bookingShop, await getStallQuotaSettings());

        if (stallCount > shopQuota && !isUncappedFashion) {
            return rejectBooking(`ร้านนี้จองได้ไม่เกิน ${shopQuota} ล็อคต่อคำขอ (ติดกันหรือไม่ติดกันก็ได้) ยกเว้นร้านแฟชั่นที่ขึ้นอยู่กับดุลยพินิจแอดมิน`);
        }

        if (!isUncappedFashion) {
            const existingLockCount = await countShopStallsInRound(req.user.id, bookingShop?.id, targetRoundMeta);
            if (existingLockCount + stallCount > shopQuota) {
                return rejectBooking(`ร้านนี้มีล็อคอยู่แล้ว ${existingLockCount} ล็อคในรอบนี้ จองเพิ่มได้อีกไม่เกิน ${Math.max(0, shopQuota - existingLockCount)} ล็อคเท่านั้น (รวมทุกโซน ไม่เกิน ${shopQuota} ล็อค/ร้าน/รอบ)`);
            }
        }

        // คิดเงินตาม billableDays (วันปฏิทินของช่วงที่เลือก หักวันหยุดที่ประกาศออกแล้ว) ไม่ใช่ rentalDays ดิบ
        // rentalDays ดิบยังเก็บไว้แสดง/เช็คความต่อเนื่องของการจองเหมือนเดิม — ดูหัวข้อวันหยุดด้านบน
        const rentTotal = zonePrice * stallCount * billableDays;
        // เครื่องใช้ไฟฟ้า + พัดลม นับรวมทั้งคำขอแล้ว จึงไม่คูณจำนวนล็อก (เดิมคูณ ทำให้ยอดจริงไม่ตรงกับที่ฟอร์ม/ใบเสนอราคาแสดง)
        const applianceTotal = dailyApplianceFee(applianceCounts) * billableDays;
        const lightTotal = LIGHT_UNIT_PRICE * stallCount * billableDays;
        // ค่าแผงหัวมุม/แผงพิเศษยังไม่คิดตอนจอง เป็นแค่การแจ้งความสนใจ
        // จะคิดเงินจริงต่อเมื่อแอดมินจัดแผงพิเศษให้ในขั้นตอน "จัดล็อก" เท่านั้น
        const cornerZoneTotal = cornerZoneValue * stallCount * billableDays;
        const grandTotal = rentTotal + applianceTotal + lightTotal;

        // Slot (ตาราง legacy) เป็นแค่ที่เก็บ placeholder ให้ Booking.slotId ชี้ไปหา ไม่ใช่
        // ตัวเก็บจำนวนแผงจริง (จำนวนแผงจริงอยู่ที่ตาราง Stall ซึ่งแอดมินจะเป็นคนจัดให้ทีหลัง
        // ตอนขั้นตอน "จัดล็อก") ขั้นตอนนี้จึงแค่ "สนใจโซน" เท่านั้น - ถ้า placeholder ในโซนนี้
        // มีไม่พอ ให้สร้างเพิ่มแทนที่จะบล็อกไม่ให้ผู้ขายส่งคำขอ
        const availableSlots = await prisma.slot.findMany({
            where: {
                zone: zoneCode,
                isAvailable: true
            },
            orderBy: { id: 'asc' },
            take: stallCount
        });

        await prisma.$transaction(async (tx) => {
            const detailForRequest = [
                storeDetail || bookingShop?.productDetail || bookingShop?.shopSummary || req.sellerApplication?.productDetail || 'ไม่มีรายละเอียดเพิ่มเติม',
                cornerZoneOption ? `[สนใจแผงพิเศษ: ${cornerZoneOption.label} +${cornerZoneOption.value} บาท/ล็อก/วัน]` : ''
            ].filter(Boolean).join(' ').trim();

            const bookingRequestRecord = await tx.bookingRequest.create({
                data: {
                    productName: bookingShop?.shopName || req.sellerApplication?.shopName || `ร้านของ ${userRecord?.name || req.user.username || 'ผู้ขาย'}`,
                    description: detailForRequest,
                    sellerName: userRecord?.name || req.user.username || 'ไม่ระบุ',
                    phone: userRecord?.phoneNumber || req.sellerApplication?.phoneNumber || '-',
                    zone: zoneCode,
                    productImage: bookingShop?.productImage || req.sellerApplication?.shopCoverImage || null,
                    userId: req.user.id,
                    // ผู้สมัครที่ยังไม่มีร้าน / จองด้วยใบสมัครร้านใหม่ = null แล้วผูกร้านให้ตอนแอดมินยืนยันสลิป
                    // (approvalController.markPaymentConfirmed ใช้ sellerApplicationId หาใบสมัครที่จะสร้างร้าน)
                    shopId: bookingShop && !bookingShop.isPending ? bookingShop.id : null,
                    sellerApplicationId: bookingShop?.isPending ? bookingShop.applicationId : null,
                    status: 'PENDING'
                }
            });

            const requestTag = buildBookingRequestTag(bookingRequestRecord.id);
            const snapshotWithRequestRef = [requestTag, detailForRequest].filter(Boolean).join(' ').trim();

            const slotsToUse = [...availableSlots];
            const shortfall = stallCount - slotsToUse.length;
            for (let i = 0; i < shortfall; i += 1) {
                const newSlot = await tx.slot.create({
                    data: {
                        slotNumber: `${zoneCode}-REQ${bookingRequestRecord.id}-${i + 1}`,
                        zone: zoneCode,
                        price: zonePrice,
                        isAvailable: true
                    }
                });
                slotsToUse.push(newSlot);
            }

            for (const slot of slotsToUse) {
                await tx.booking.create({
                    data: {
                        slotId: slot.id,
                        userId: req.user.id,
                        zoneCode,
                        selectedZoneLabel: `โซน ${zoneCode}`,
                        stallCount,
                        rentalStartDate: startDate,
                        rentalEndDate: endDate,
                        rentalDays,
                        billableDays,
                        dailyStallPrice: zonePrice,
                        lightEnabled,
                        lightUnitPrice: LIGHT_UNIT_PRICE,
                        smallApplianceCount: applianceCounts.smallApplianceCount,
                        largeApplianceCount: applianceCounts.largeApplianceCount,
                        smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                        largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                        smallFanCount: applianceCounts.smallFanCount,
                        largeFanCount: applianceCounts.largeFanCount,
                        smallFanPrice: APPLIANCE_KINDS.FAN_SMALL.price,
                        largeFanPrice: APPLIANCE_KINDS.FAN_LARGE.price,
                        applianceItems: applianceItems ? JSON.stringify(applianceItems) : null,
                        applianceTotal,
                        lightTotal,
                        rentTotal,
                        totalExtraPrice: cornerZoneTotal,
                        grandTotal,
                        storeDetailSnapshot: snapshotWithRequestRef || null
                    }
                });

                await tx.slot.update({
                    where: { id: slot.id },
                    data: { isAvailable: false }
                });
            }
        });

        // พา tabToken ของแท็บที่ส่งฟอร์มไปด้วย ไม่งั้นหน้าสถานะจะใช้ cookie ที่แชร์กันทุกแท็บ (อาจเป็นอีกบัญชี)
        const tabToken = typeof req.body.tabToken === 'string' ? req.body.tabToken : '';
        return res.redirect(tabToken ? `/booking-status?tabToken=${encodeURIComponent(tabToken)}` : '/booking-status');
    } catch (error) {
        console.error('booking-stall POST error', error);
        try {
            return await rejectBooking('เกิดข้อผิดพลาดขณะบันทึกการจอง กรุณาลองใหม่อีกครั้ง', 500);
        } catch (renderError) {
            console.error('booking-stall error page render failed', renderError);
            return res.status(500).send('เกิดข้อผิดพลาดขณะบันทึกการจอง กรุณาลองใหม่อีกครั้ง');
        }
    }
});

// --- ต่อล็อค: สำหรับคนที่มีล็อกที่แอดมินจัดให้แล้วในรอบปัจจุบัน อยากต่อเวลาขาย ---
// เข้าเงื่อนไขเดียวกับที่ market-map ใช้เช็ค "ล็อกที่จัดสรรแล้ว"
// (BookingRequest.status ใน APPROVED/IN_PROGRESS/SUCCESS + มี assignedStallCode)
// คำขอต่อล็อกนับเป็น "ล็อกที่ใช้อยู่" ก็ต่อเมื่อจ่ายเงินแล้ว (SUCCESS) — ระหว่างรอแอดมิน/รอชำระ ยังใช้คำขอเดิมเป็นฐาน
// และ pendingExtension บอกว่ามีคำขอต่อค้างอยู่ (กันยื่นซ้ำ) ตัดคำขอที่เลยกำหนดชำระและยังไม่ส่งสลิปออก
// (isUnpaidPastDeadline ตัวเดียวกับ job ตัดสิทธิ์ใน utils/stallRenewal.js)
const isExtendRequest = (request) => String(request.description || '').startsWith('[EXTEND_OF:');

// shopId = ต่อล็อกของร้านไหน (1 ผู้ใช้มีได้หลายร้าน) ไม่ระบุ = สัญญาล่าสุดของทุกร้าน (การ์ดแจ้งเตือน/หน้าสถานะ)
// คำขอเก่าที่ยังไม่มี shopId นับเป็นของร้านหลัก
async function findActiveLockForExtension(userRecord, shopId = null) {
    if (!userRecord?.id) return null;

    let shopFilter = {};
    const wantedShopId = Number.parseInt(shopId, 10);
    if (Number.isInteger(wantedShopId) && wantedShopId > 0) {
        const primary = await getPrimaryShop(userRecord.id, { select: { id: true } });
        shopFilter = { OR: [{ shopId: wantedShopId }, ...(primary?.id === wantedShopId ? [{ shopId: null }] : [])] };
    }

    const candidates = await prisma.bookingRequest.findMany({
        where: {
            status: { in: ['PENDING', 'APPROVED', 'IN_PROGRESS', 'SUCCESS'] },
            userId: userRecord.id,
            ...shopFilter
        },
        orderBy: { createdAt: 'desc' },
        take: 20
    });

    const now = new Date();
    const pendingExtension = candidates.find((request) => isExtendRequest(request)
        && request.status !== 'SUCCESS'
        && !isUnpaidPastDeadline(request, now)) || null;

    const latestRequest = candidates.find((request) => request.assignedStallCode
        && request.status !== 'PENDING'
        && (request.status === 'SUCCESS' || !isExtendRequest(request)));

    if (!latestRequest) return null;

    const requestTag = buildBookingRequestTag(latestRequest.id);
    const currentBooking = await prisma.booking.findFirst({
        where: {
            userId: userRecord.id,
            storeDetailSnapshot: { startsWith: requestTag }
        },
        orderBy: { id: 'desc' }
    });

    if (!currentBooking || !currentBooking.rentalEndDate) return null;

    const roundMeta = getBookingRoundMetaForDate(currentBooking.rentalEndDate);
    const currentRoundNumber = getBookingRoundMetaForDate(new Date()).roundNumber;
    if (roundMeta.roundNumber !== currentRoundNumber) return null; // ล็อกอยู่คนละรอบกับตอนนี้ ต่อไม่ได้แล้ว

    return { latestRequest, currentBooking, roundMeta, pendingExtension };
}

router.get('/booking-stall/extend', isAuthenticated, async (req, res) => {
    const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: ALL_SHOPS_INCLUDE });

    // ร้านที่แอดมิน Blacklist จากคะแนนตรวจตลาด ต่อล็อกไม่ได้ (ดู controllers/scoreReportController.js)
    if (userRecord?.isBlacklisted) {
        return res.redirect('/booking-status?error=blacklisted');
    }

    const active = await findActiveLockForExtension(userRecord, req.query.shop);

    if (!active) {
        return res.redirect('/booking-status?error=no_active_lock_to_extend');
    }
    if (active.pendingExtension) {
        return res.redirect('/booking-status?error=extend_already_requested');
    }

    // กติกาต่อล็อก (ต่อสุดรอบได้ทันที / ต่อสั้นเริ่มได้ 1 วันก่อนวันขายสุดท้าย / ต้องต่อก่อน 20:00) ดู utils/stallRenewal.js
    const renewal = getRenewalOptions(active.currentBooking.rentalEndDate, new Date());

    res.render('seller/extendLock', {
        user: userRecord,
        activeLock: active.currentBooking,
        request: active.latestRequest,
        roundMeta: active.roundMeta,
        renewal,
        dailyTotal: getExtensionDailyTotal(active.latestRequest, active.currentBooking),
        // ร้านเจ้าของสัญญาที่ต่อ (คำขอเก่าที่ยังไม่มี shopId = ร้านหลัก) + แถบสลับร้านถ้ามีหลายร้าน
        shops: userRecord?.shops || [],
        extendShopId: active.latestRequest.shopId || userRecord?.shops?.[0]?.id || null,
        error: req.query.error || null
    });
});

// ค่าต่อล็อกต่อ 1 วันที่คิดเงิน — ราคาล็อก/ไฟ/เครื่องใช้ไฟฟ้าชุดเดิมของสัญญาที่ต่อ (หน้าต่อล็อกโชว์ + POST ใช้คิดยอดจริง)
function getExtensionDailyTotal(latestRequest, currentBooking) {
    const stallCount = parseStallCodeList(latestRequest.assignedStallCode).length || currentBooking.stallCount;
    const light = currentBooking.lightEnabled ? currentBooking.lightUnitPrice * stallCount : 0;
    return currentBooking.dailyStallPrice * stallCount + light + dailyApplianceFee(currentBooking, currentBooking);
}

function parseStallCodeList(text) {
    return String(text || '').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean);
}

router.post('/booking-stall/extend', isAuthenticated, async (req, res) => {
    try {
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { shops: shopsRelation() } });

        // ร้านที่แอดมิน Blacklist จากคะแนนตรวจตลาด ต่อล็อกไม่ได้ (ดู controllers/scoreReportController.js)
        if (userRecord?.isBlacklisted) {
            return res.redirect('/booking-status?error=blacklisted');
        }

        const active = await findActiveLockForExtension(userRecord, req.body.shopId);
        const extendShopQuery = req.body.shopId ? `&shop=${encodeURIComponent(req.body.shopId)}` : '';

        if (!active) {
            return res.redirect('/booking-status?error=no_active_lock_to_extend');
        }
        if (active.pendingExtension) {
            return res.redirect('/booking-status?error=extend_already_requested');
        }

        const { latestRequest, currentBooking } = active;
        const newEndDate = toStartOfDay(req.body.newEndDate);
        const currentEndDate = toStartOfDay(currentBooking.rentalEndDate);

        const renewalError = validateRenewal(currentEndDate, newEndDate, new Date());
        if (renewalError) {
            return res.redirect(`/booking-stall/extend?error=${renewalError}${extendShopQuery}`);
        }

        const extendStartDate = addDays(currentEndDate, 1);
        const rentalDays = getRentalDays(extendStartDate, newEndDate);

        // วันหยุดที่แอดมินประกาศระหว่างช่วงต่อล็อก ไม่คิดเงิน (ดู utils/bookingHolidays.js เหมือนตอนจองใหม่)
        const billableDays = await getBillableDays(extendStartDate, newEndDate);
        if (billableDays <= 0) {
            return res.redirect(`/booking-stall/extend?error=all_days_are_holiday${extendShopQuery}`);
        }

        // ต่อล็อกเดิมที่แอดมินจัดไว้จริง (assignedStallCode) จำนวนล็อกนับจากที่ได้จริง ไม่ใช่ที่ขอตอนแรก
        const stallCodes = parseStallCodeList(latestRequest.assignedStallCode);
        const stallCount = stallCodes.length || currentBooking.stallCount;
        if (!stallCodes.length) {
            return res.redirect('/booking-status?error=no_active_lock_to_extend');
        }

        const rentTotal = currentBooking.dailyStallPrice * stallCount * billableDays;
        // เครื่องใช้ไฟฟ้า/พัดลมชุดเดิมของคำขอที่ต่อ คิดรวมทั้งคำขอ ไม่คูณจำนวนล็อก (เหมือนตอนจองใหม่)
        const applianceTotal = dailyApplianceFee(currentBooking, currentBooking) * billableDays;
        const lightTotal = currentBooking.lightEnabled ? currentBooking.lightUnitPrice * stallCount * billableDays : 0;
        const grandTotal = rentTotal + applianceTotal + lightTotal;

        // ต่อล็อกเดิมไม่ต้องรอแอดมินจัดล็อก — คำขอต่อเข้าสถานะ IN_PROGRESS (รอชำระเงิน) ทันที ล็อกเดิมถูกขยายวันสิ้นสุดเลย
        // แบบเดียวกับที่ confirmBookingStall ทำกับคำขอต่อ แอดมินแค่ยืนยันสลิปตามปกติ
        // ไม่จ่ายภายในกำหนด → restoreUnpaidExtensions (job ใน app.js) คืนวันสิ้นสุดเดิม แล้วล็อกหลุดตามกติกา 20:00
        const lockAssignedAt = new Date();
        const paymentDueAt = computePaymentDueAt(lockAssignedAt, extendStartDate, await getPaymentSettings());
        let stallNoLongerYours = false;

        await prisma.$transaction(async (tx) => {
            // ล็อกต้องยังเป็นของสัญญาเดิมอยู่ (BOOKED + วันสิ้นสุดตรงกัน) — ถ้าแอดมินปล่อย/ย้ายไปแล้ว ต่ออัตโนมัติไม่ได้
            const stalls = await tx.stall.findMany({ where: { stallCode: { in: stallCodes } } });
            const stillOurs = stalls.length === stallCodes.length && stalls.every((stall) => stall.status === 'BOOKED'
                && toStartOfDay(stall.bookingEndDate)?.getTime() === currentEndDate.getTime());
            if (!stillOurs) {
                stallNoLongerYours = true;
                throw new Error('ROLLBACK_STALL_NOT_OURS');
            }

            const detailForRequest = `ขอต่อล็อก ${latestRequest.assignedStallCode || ''} ถึงวันที่ ${newEndDate.toLocaleDateString('th-TH')}`.trim();
            const assignedStallCode = stallCodes.join(', ');

            const extendRequestRecord = await tx.bookingRequest.create({
                data: {
                    productName: latestRequest.productName,
                    // [LOG:...] รูปแบบเดียวกับ withActionLog ใน approvalController ให้ไทม์ไลน์หน้าแอดมินเห็นว่าระบบจัดให้เอง
                    description: `[EXTEND_OF:${latestRequest.id}] ${detailForRequest} [LOG:${lockAssignedAt.getTime()}|ระบบ|ต่อล็อกเดิม ${assignedStallCode} อัตโนมัติ]`,
                    sellerName: userRecord?.name || req.user.username || 'ไม่ระบุ',
                    phone: userRecord?.phoneNumber || '-',
                    zone: latestRequest.zone,
                    productImage: latestRequest.productImage || null,
                    userId: req.user.id,
                    // ต่อให้ร้านเดียวกับสัญญาเดิม (คำขอเก่าที่ยังไม่มี shopId = ร้านหลัก)
                    shopId: latestRequest.shopId || primaryShop(userRecord)?.id || null,
                    status: 'IN_PROGRESS',
                    assignedStallCode,
                    lockAssignedAt,
                    paymentDueAt
                }
            });

            // ขยายแค่วันสิ้นสุด วันเริ่มของสัญญาเดิมคงไว้ (เหมือน confirmBookingStall ต่อล็อกเดิม)
            await tx.stall.updateMany({
                where: { stallCode: { in: stallCodes } },
                data: { isAvailable: false, status: 'BOOKED', bookingEndDate: newEndDate }
            });

            const requestTag = buildBookingRequestTag(extendRequestRecord.id);
            const snapshotWithRequestRef = `${requestTag} ${detailForRequest}`.trim();

            // ผูก Booking กับ Slot ของล็อกเดิม (slotNumber = รหัสล็อก) ไม่ไปกินช่องว่างอื่นในโซน
            const slotsToUse = [];
            for (const code of stallCodes) {
                slotsToUse.push(await tx.slot.upsert({
                    where: { slotNumber: code },
                    update: { isAvailable: false },
                    create: {
                        slotNumber: code,
                        zone: code.replace(/[0-9].*$/, '') || latestRequest.zone,
                        price: currentBooking.dailyStallPrice,
                        isAvailable: false
                    }
                }));
            }

            for (const slot of slotsToUse) {
                await tx.booking.create({
                    data: {
                        slotId: slot.id,
                        userId: req.user.id,
                        zoneCode: latestRequest.zone,
                        selectedZoneLabel: `โซน ${latestRequest.zone}`,
                        stallCount,
                        rentalStartDate: extendStartDate,
                        rentalEndDate: newEndDate,
                        rentalDays,
                        billableDays,
                        dailyStallPrice: currentBooking.dailyStallPrice,
                        lightEnabled: currentBooking.lightEnabled,
                        lightUnitPrice: currentBooking.lightUnitPrice,
                        smallApplianceCount: currentBooking.smallApplianceCount,
                        largeApplianceCount: currentBooking.largeApplianceCount,
                        smallAppliancePrice: currentBooking.smallAppliancePrice,
                        largeAppliancePrice: currentBooking.largeAppliancePrice,
                        smallFanCount: currentBooking.smallFanCount,
                        largeFanCount: currentBooking.largeFanCount,
                        smallFanPrice: currentBooking.smallFanPrice,
                        largeFanPrice: currentBooking.largeFanPrice,
                        applianceItems: currentBooking.applianceItems,
                        applianceTotal,
                        lightTotal,
                        rentTotal,
                        grandTotal,
                        status: 'IN_PROGRESS',
                        storeDetailSnapshot: snapshotWithRequestRef || null
                    }
                });

                await tx.slot.update({
                    where: { id: slot.id },
                    data: { isAvailable: false }
                });
            }
        }).catch((error) => {
            if (!stallNoLongerYours) throw error;
        });

        if (stallNoLongerYours) {
            return res.redirect(`/booking-stall/extend?error=stall_no_longer_yours${extendShopQuery}`);
        }
        return res.redirect('/booking-status?success=extend_ready_to_pay');
    } catch (error) {
        console.error('booking-stall extend POST error', error);
        return res.redirect('/booking-stall/extend?error=extend_failed');
    }
});

// การ์ดจากปุ่ม "แจ้งเตือนร้านค้า" ของแอดมิน (StallRenewalNotice) — โชว์เฉพาะล็อกที่ยังจองอยู่และวันหมดสัญญายังตรงกับตอนแจ้ง
// (ต่อสัญญาแล้ววันเปลี่ยน การ์ดหายเอง) ล้มเหลวเงียบๆ ได้ (เช่นตารางยังไม่ถูกสร้างใน DB) ไม่ให้พังหน้าแจ้งเตือนทั้งหน้า
async function loadAdminRenewalNotices(userId) {
    try {
        const notices = await prisma.stallRenewalNotice.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 20 });
        if (!notices.length) return [];
        const stalls = await prisma.stall.findMany({ where: { stallCode: { in: notices.map((n) => n.stallCode) }, status: 'BOOKED' } });
        const stallByCode = new Map(stalls.map((s) => [s.stallCode, s]));
        const seen = new Set();
        const entries = [];
        // แอดมินกดย้ำได้หลายครั้ง — ใช้แถวล่าสุด (id/เวลาใหม่ การ์ดจึงกลับเป็นยังไม่อ่าน) และนับจำนวนครั้งของสัญญาเดียวกัน
        const sameContract = (notice, stall) => toStartOfDay(stall.bookingEndDate)?.getTime() === toStartOfDay(notice.bookingEndDate)?.getTime();
        notices.forEach((notice) => {
            const stall = stallByCode.get(notice.stallCode);
            if (!stall || seen.has(notice.stallCode)) return;
            if (!sameContract(notice, stall)) return;
            seen.add(notice.stallCode);
            const nudgeCount = notices.filter((n) => n.stallCode === notice.stallCode && sameContract(n, stall)).length;
            const renewal = getRenewalOptions(stall.bookingEndDate, new Date());
            const closed = !renewal || !renewal.isOpen;
            entries.push({
                id: `renewal-notice-${notice.id}`,
                type: 'pending-review',
                title: nudgeCount > 1
                    ? `ผู้ดูแลตลาดย้ำเตือนครั้งที่ ${nudgeCount}: ต่อล็อก ${notice.stallCode} ไหม?`
                    : `ผู้ดูแลตลาดแจ้ง: ต่อล็อก ${notice.stallCode} ไหม?`,
                nudgeCount,
                stallCode: notice.stallCode,
                desc: closed
                    ? `ล็อก ${notice.stallCode} เลยเวลา 20:00 น. วันที่ ${formatDateThai(stall.bookingEndDate)} แล้ว หมดสิทธิ์ต่อและถูกเปิดให้คนอื่นจอง`
                    : `ล็อก ${notice.stallCode} ขายวันสุดท้ายวันที่ ${formatDateThai(stall.bookingEndDate)} กด "ต่อล็อก" แล้วชำระเงิน ล็อกเดิมเป็นของคุณต่อทันที ไม่ต้องรอแอดมินจัดล็อกใหม่ ต้องต่อก่อน 20:00 น. ของวันนั้น เลยเวลาแล้วล็อกจะถูกเปิดให้คนอื่นจอง`,
                date: formatDateThai(notice.createdAt),
                time: formatTimeThai(notice.createdAt),
                at: toIso(notice.createdAt),
                status: 'IN_PROGRESS',
                isRead: false,
                isNew: true,
                ...(closed ? {} : {
                    action: 'ต่อล็อกก่อน 20:00 น.',
                    summary: `ล็อก ${notice.stallCode} · ผู้ดูแลตลาดแจ้งเตือน · ขายวันสุดท้าย ${formatDateThai(stall.bookingEndDate)}`,
                    deadline: toIso(atEightPm(stall.bookingEndDate)),
                    link: '/booking-stall/extend', linkLabel: 'ต่อล็อก', linkIcon: 'bi-arrow-repeat'
                })
            });
        });
        return entries;
    } catch (error) {
        console.error('loadAdminRenewalNotices error', error.message);
        return [];
    }
}

// รวม logic การหาคำขอ/รายการจองล่าสุดของผู้ขาย ให้ /booking-status และ /notifications
// ใช้สถานะเดียวกัน (อิง BookingRequest.status เป็นหลัก ไม่ใช่ Booking.status แบบเดิม
// ซึ่งไม่มีสถานะ IN_PROGRESS/SUCCESS ตามความหมายใหม่)
// ?previewNotice=1 บังคับโชว์การ์ดต่อล็อกรอบถัดไปไว้ดูหน้าตา — ใช้ได้เฉพาะเครื่อง dev
// ?previewNotice=open บังคับโชว์การ์ดเปิดจองวันพุธแทน
function isNoticePreview(req) {
    if (process.env.NODE_ENV === 'production') return false;
    if (req.query.previewNotice === '1') return 'priority';
    if (req.query.previewNotice === 'open') return 'open';
    return false;
}

async function loadSellerBookingStatus(userId, { previewNotice = false } = {}) {
    const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        include: { shops: shopsRelation() }
    });

    // เอารายการคำขอล่าสุดของผู้ขายรายนี้เสมอ (ไม่ว่าจะอยู่สถานะไหน) เพื่อให้สะท้อน
    // ความคืบหน้าจริงล่าสุด ไม่ใช่แค่รายการที่เคยผ่านสถานะใดสถานะหนึ่งมาก่อน
    // ยกเว้นคำขอต่อล็อกที่ถูกปฏิเสธ — สัญญาเดิมยังใช้อยู่ ถ้าเอามาเป็น "ล่าสุด" หน้าจะขึ้นว่าถูกปฏิเสธทั้งที่ยังขายได้
    // (แจ้งผลปฏิเสธแยกเป็นการ์ดของมันเองด้านล่างแทน)
    let latestRequest = null;
    let recentRequests = [];
    const pickLatest = (requests) => {
        recentRequests = requests;
        return requests.find((request) => !(String(request.status || '').toUpperCase() === 'REJECTED'
            && /^\[EXTEND_OF:\d+\]/.test(String(request.description || '')))) || null;
    };

    latestRequest = pickLatest(await prisma.bookingRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
    }));

    let latestBooking = null;
    if (latestRequest?.id) {
        const requestTag = buildBookingRequestTag(latestRequest.id);
        latestBooking = await prisma.booking.findFirst({
            where: {
                userId,
                storeDetailSnapshot: { contains: requestTag }
            },
            include: { slot: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!latestBooking) {
        latestBooking = await prisma.booking.findFirst({
            where: { userId },
            include: { slot: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    const awaitingPaymentVerification = Boolean(
        latestRequest
        && String(latestRequest.status || '').toUpperCase() === 'IN_PROGRESS'
        && latestRequest.paymentSlipImage
        && !latestRequest.paymentConfirmedAt
    );

    let paymentDueAt = null;
    let bookingView = buildBookingView(latestBooking);

    if (!bookingView && latestRequest) {
        bookingView = {
            id: latestRequest.id,
            status: String(latestRequest.status || 'PENDING').toUpperCase(),
            statusText: getBookingStatusText(String(latestRequest.status || 'PENDING').toUpperCase(), awaitingPaymentVerification),
            stage: getBookingStep(String(latestRequest.status || 'PENDING').toUpperCase()),
            roundNumber: getBookingRoundMetaForDate(latestRequest.createdAt).roundNumber,
            roundDateRangeText: (() => {
                const meta = getBookingRoundMetaForDate(latestRequest.createdAt);
                const window = getRoundWindow(meta.roundNumber);
                return `${formatDateThai(window.cycleStart)} ถึง ${formatDateThai(window.cycleEnd)}`;
            })(),
            sellDaysList: '',
            shopName: primaryShop(userRecord)?.shopName || latestRequest.productName || '-',
            productType: primaryShop(userRecord)?.productType || '-',
            customerName: userRecord?.name || latestRequest.sellerName || '-',
            customerPhone: userRecord?.phoneNumber || latestRequest.phone || '-',
            // ไม่เปิดเผยโซน/เลขล็อกจนกว่าจะยืนยันสลิปโอนเงินเสร็จ (ดูจุด merge ด้านล่างด้วย)
            zoneLabel: latestRequest.paymentConfirmedAt ? (latestRequest.zone ? `โซน ${latestRequest.zone}` : '-') : null,
            slotLabel: latestRequest.paymentConfirmedAt ? (latestRequest.assignedStallCode || null) : null,
            rentalStartDate: '-',
            rentalEndDate: '-',
            rentalDays: 1,
            stallCount: 1,
            dailyStallPrice: 0,
            rentTotal: 0,
            lightTotal: 0,
            applianceTotal: 0,
            grandTotal: 0,
            lightEnabled: false,
            smallApplianceCount: 0,
            largeApplianceCount: 0,
            createdAt: formatDateThai(latestRequest.createdAt),
            createdTime: formatTimeThai(latestRequest.createdAt),
            storeDetailSnapshot: stripInternalTags(latestRequest.description) || '-',
            isFinalPrice: false
        };
    }

    if (bookingView && latestRequest) {
        const normalizedRequestStatus = String(latestRequest.status || 'PENDING').toUpperCase();
        bookingView.status = normalizedRequestStatus;
        bookingView.statusText = getBookingStatusText(normalizedRequestStatus, awaitingPaymentVerification);
        bookingView.stage = getBookingStep(normalizedRequestStatus);
        // ไม่เปิดเผยโซน/เลขล็อกจนกว่าจะยืนยันสลิปโอนเงินเสร็จ (paymentConfirmedAt) —
        // ป้องกันไม่ให้ลูกค้าเห็นตำแหน่งล็อกก่อนจ่ายเงินจริง
        bookingView.zoneLabel = latestRequest.paymentConfirmedAt ? (latestRequest.zone ? `โซน ${latestRequest.zone}` : bookingView.zoneLabel) : null;
        bookingView.slotLabel = latestRequest.paymentConfirmedAt ? (latestRequest.assignedStallCode || null) : null;
        // คำขอต่อล็อก = ร้านเดิมต่อล็อกเดิม ไม่ใช่การจองแผงใหม่ — ผู้ขายรู้เลขล็อกอยู่แล้ว เลยแสดงได้ตั้งแต่ก่อนชำระเงิน
        bookingView.isExtension = isExtendRequest(latestRequest);
        if (bookingView.isExtension && latestRequest.assignedStallCode) {
            bookingView.slotLabel = latestRequest.assignedStallCode;
            bookingView.zoneLabel = latestRequest.zone ? `โซน ${latestRequest.zone}` : (bookingView.zoneLabel || '-');
        }
        bookingView.paymentSlipImage = latestRequest.paymentSlipImage || null;
        bookingView.awaitingPaymentVerification = awaitingPaymentVerification;
        // ชื่อร้าน/ประเภทสินค้า สำหรับการ์ดใบเสนอราคา — เอาจากโปรไฟล์ร้าน ถ้าไม่มีใช้ชื่อจากคำขอจองแทน
        bookingView.shopName = primaryShop(userRecord)?.shopName || latestRequest.productName || '-';
        bookingView.productType = primaryShop(userRecord)?.productType || '-';
        bookingView.customerName = userRecord?.name || latestRequest.sellerName || '-';
        bookingView.customerPhone = userRecord?.phoneNumber || latestRequest.phone || '-';
        // ผลตรวจสลิปอัตโนมัติ (SlipOK) ที่เก็บไว้ตอนอัปโหลด — null = ยังไม่ตรวจ/ไม่ได้ตั้งค่า SlipOK
        bookingView.slipVerified = typeof latestRequest.slipVerified === 'boolean' ? latestRequest.slipVerified : null;
        bookingView.slipVerifyReason = latestRequest.slipVerifyReason || null;
        bookingView.rejectReason = normalizedRequestStatus === 'REJECTED' ? extractRejectReason(latestRequest.description) : null;
        // ราคาที่แสดงระหว่างรอตรวจสอบ/รอจัดล็อก เป็นแค่ราคาประมาณการ (ราคาต่ำสุดของโซน) —
        // ราคาจริงต้องรอแอดมินจัดล็อกก่อน (ดู confirmBookingStall ที่คำนวณราคาจริงใหม่)
        bookingView.isFinalPrice = Boolean(latestRequest.assignedStallCode);

        // ความสนใจแผงหัวมุม/แผงพิเศษที่ผู้ขายแจ้งไว้ตอนจอง (แค่แจ้งความสนใจ ยังไม่ยืนยันว่าได้จริง)
        bookingView.cornerZoneNote = extractCornerZoneNote(latestRequest.description);

        // ถ้าแอดมินจัดล็อกให้แล้ว เช็คว่าล็อกที่ได้เป็นแผงหัวมุม/แผงพิเศษจริงหรือไม่ (Stall.extraPrice > 0)
        bookingView.isSpecialCornerLot = false;
        bookingView.cornerExtraPerDay = 0;
        if (latestRequest.assignedStallCode) {
            const assignedStall = await prisma.stall.findUnique({
                where: { stallCode: latestRequest.assignedStallCode },
                select: { extraPrice: true }
            });
            if (assignedStall && Number(assignedStall.extraPrice) > 0) {
                bookingView.isSpecialCornerLot = true;
                bookingView.cornerExtraPerDay = Number(assignedStall.extraPrice);
            }
        }

        // กำหนดชำระเงินที่คำนวณไว้ตอนจัดล็อก (BookingRequest.paymentDueAt ดู utils/paymentDeadline.js) — เกินแล้วแค่ขึ้นเตือน
        // ในหน้า ไม่ auto-ยกเลิก แอดมินแยกดำเนินการเอง
        bookingView.paymentDeadline = null;
        bookingView.paymentDeadlineOverdue = false;
        bookingView.paymentDeadlineSameDay = false;
        if (normalizedRequestStatus === 'IN_PROGRESS' && !awaitingPaymentVerification) {
            const rentalStartDate = latestBooking?.rentalStartDate || null;
            const deadlineDate = getPaymentDeadline(latestRequest, rentalStartDate);
            if (deadlineDate) {
                paymentDueAt = deadlineDate;
                const cutoff = rentalStartDate ? getSameDayPaymentCutoff(rentalStartDate) : null;
                bookingView.paymentDeadlineSameDay = Boolean(cutoff && cutoff.getTime() === deadlineDate.getTime());
                bookingView.paymentDeadline = `${formatDateThai(deadlineDate)} เวลา ${formatTimeThai(deadlineDate)} น.`;
                bookingView.paymentDeadlineOverdue = new Date().getTime() > deadlineDate.getTime();
            }
        }

        // สร้าง QR พร้อมเพย์ให้จ่ายได้เลย เฉพาะตอนที่รู้ราคาจริงแล้วและยังไม่ได้ส่งสลิป
        // (จัดล็อกแล้ว รอชำระเงิน — ตรงกับตอนที่หน้า booking_status โชว์ช่องอัปโหลดสลิป)
        // ส่วนลดชดเชยฝนตกที่ใช้กับคำขอนี้ (utils/rainCompensation.js) — ยอดที่ต้องโอน = grandTotal - rainDiscount
        bookingView.rainDiscount = Number(latestRequest.rainDiscount || 0);
        bookingView.rainDiscountForfeit = Number(latestRequest.rainDiscountForfeit || 0);
        bookingView.payableTotal = rainCompensation.getPayableAmount(latestRequest, bookingView.grandTotal);

        if (normalizedRequestStatus === 'IN_PROGRESS' && bookingView.isFinalPrice && !awaitingPaymentVerification) {
            bookingView.promptPayId = PROMPTPAY_ID;
            bookingView.promptPayQr = bookingView.payableTotal > 0 ? await buildPromptPayQrDataUrl(bookingView.payableTotal) : null;
        }
    }

    // กระเป๋าส่วนลดชดเชยฝนตก (เครดิตที่ยังใช้ได้) — โชว์ในหน้าสถานะการจอง และให้กดใช้ตอนรอชำระเงิน
    const rainWallet = await rainCompensation.getAvailableCredits(userId);
    if (bookingView) {
        bookingView.rainWallet = {
            total: rainWallet.total,
            count: rainWallet.count,
            maxCount: rainCompensation.MAX_ACTIVE_CREDITS,
            nextExpiry: rainWallet.nextExpiry ? formatDateThai(rainWallet.nextExpiry) : null,
            canApply: rainWallet.total > 0
                && String(latestRequest?.status || '').toUpperCase() === 'IN_PROGRESS'
                && Boolean(latestRequest?.assignedStallCode)
                && !latestRequest?.paymentSlipImage
                && !latestRequest?.rainDiscount
        };
    }

    const notificationBooking = latestRequest
        ? {
            ...(latestBooking || {}),
            status: String(latestRequest.status || 'PENDING').toUpperCase(),
            zoneCode: latestRequest.zone || latestBooking?.zoneCode || '',
            createdAt: latestRequest.createdAt || latestBooking?.createdAt,
            paymentConfirmedAt: latestRequest.paymentConfirmedAt || null,
            paymentDueAt,
            paymentSlipImage: latestRequest.paymentSlipImage || null,
            slipVerifyReason: latestRequest.slipVerifyReason || null,
            rejectReason: extractRejectReason(latestRequest.description),
            rejection: String(latestRequest.status || '').toUpperCase() === 'REJECTED' ? describeRejection(latestRequest) : null,
            // คำขอต่อล็อก — ล็อกเดิมของผู้ขายเอง (รู้เลขอยู่แล้ว) ระบบจัดให้เอง ไม่ใช่แอดมินจัด ใช้ปรับข้อความแจ้งเตือน
            extendStallCode: isExtendRequest(latestRequest) ? (latestRequest.assignedStallCode || null) : null,
            slot: { slotNumber: latestRequest.paymentConfirmedAt ? (latestRequest.assignedStallCode || null) : null }
        }
        : latestBooking;

    // คำขอที่ถูกปฏิเสธ/ยกเลิกอื่นๆ ใน 30 วันล่าสุด (นอกจากคำขอที่แสดงเป็นหลักอยู่ ซึ่งมีการ์ดของตัวเองแล้ว) แจ้งทีละรายการ
    // พร้อมเหตุผล — เช่น คำขอต่อล็อกไม่ผ่าน (สัญญาเดิมยังใช้ได้) หรือคำขอรอบเก่าที่แอดมินปิดทั้งรอบ
    // นับจากเวลาที่ถูกปฏิเสธ ([REJECTED_AT:] ดู withRejectReason) ไม่ใช่วันส่งคำขอ — ข้อมูลเก่าที่ไม่มี tag ใช้วันส่งคำขอแทน
    const rejectionSince = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rejectedAtOf = (request) => {
        const match = /\[REJECTED_AT:\s*(\d+)\]/.exec(String(request.description || ''));
        return match ? new Date(Number(match[1])) : new Date(request.createdAt);
    };
    const rejectionEntries = recentRequests
        .filter((request) => String(request.status || '').toUpperCase() === 'REJECTED'
            && request.id !== latestRequest?.id
            && rejectedAtOf(request).getTime() >= rejectionSince)
        .map((request) => {
            const rejection = describeRejection(request);
            return {
                id: `rejected-${request.id}`,
                type: 'cancelled',
                title: rejection.title,
                desc: rejection.desc,
                date: formatDateThai(rejectedAtOf(request)),
                time: formatTimeThai(rejectedAtOf(request)),
                at: toIso(rejectedAtOf(request)),
                status: 'REJECTED',
                isRead: false,
                isNew: true
            };
        });

    const extendInfo = await findActiveLockForExtension(userRecord);
    if (extendInfo) extendInfo.renewQuote = await buildRenewQuote(extendInfo);

    const repairReports = await prisma.maintenanceReport.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' }
    });

    const taxInvoiceRequests = await prisma.taxInvoiceRequest.findMany({
        where: { requestedByUserId: userId },
        include: { taxInvoiceProfile: true, replacedBy: true },
        orderBy: { requestedAt: 'desc' }
    });

    // การ์ดที่แอดมินกดแจ้งเตือน ก็ต่อล็อกจากการ์ดได้เลยเหมือนการ์ด "ต่อล็อกไหม?" — เฉพาะล็อกที่ตรงกับยอดต่อล็อก (renewQuote คิดจากคำขอล่าสุด)
    // ร้านหลายล็อกที่แอดมินแจ้งล็อกอื่น ไม่แปะยอดของล็อกผิดตัว การ์ดนั้นเหลือปุ่มไปหน้าต่อล็อกตามปกติ
    const quoteCodes = String(extendInfo?.renewQuote?.stallCode || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    const renewalNotices = (await loadAdminRenewalNotices(userId)).map((entry) => (
        entry.link === '/booking-stall/extend' && extendInfo?.renewQuote && quoteCodes.includes(String(entry.stallCode).toUpperCase())
            ? { ...entry, renew: extendInfo.renewQuote }
            : entry
    ));
    const communityNotifications = await buildCommunityNotifications(userId);
    // รีวิวร้านใหม่ที่ยังไม่ได้ตอบ (utils/shopReviews.js)
    const reviewNotifications = await buildReviewNotifications(userId);
    const eventBoothRequests = await prisma.eventBoothRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    const leaseContractRequests = await prisma.leaseContractRequest.findMany({
        where: { userId, status: { in: ['ISSUED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    // เติมหมวด/key แล้วรวมสถานะอ่านแล้วจาก DB (utils/notificationReads.js) — ใช้ชุดเดียวกันทั้งหน้า /notifications และเลขบนกระดิ่ง
    const notifications = await applyReadState(userId, [
        ...buildEventBoothNotifications(eventBoothRequests),
        ...renewalNotices,
        ...(await buildNextRoundRenewEntry(userId, extendInfo, new Date(), { preview: previewNotice === 'priority' })),
        ...(await buildNextRoundOpenEntry(userRecord, new Date(), { preview: previewNotice === 'open' })),
        ...communityNotifications,
        ...reviewNotifications,
        ...(await rainCompensation.buildRainNotifications(userId)),
        // ผลคำขอลาหยุด/เช่าช่วงแผง (utils/stallLeave.js)
        ...(await stallLeave.buildLeaveNotifications(userId)),
        ...buildRepairNotifications(repairReports),
        ...buildTaxInvoiceNotifications(taxInvoiceRequests),
        ...leaseContractCtrl.buildLeaseContractNotifications(leaseContractRequests, formatDateThai, formatTimeThai),
        ...rejectionEntries,
        ...buildBookingNotifications(notificationBooking, awaitingPaymentVerification, extendInfo)
    ]);

    return {
        userRecord,
        bookingView,
        eventBoothRequests,
        rainWallet,
        notifications
    };
}

// --- 4. หน้าสถานะการจอง ---
router.get('/booking-status', isAuthenticated, async (req, res) => {
    const { userRecord, bookingView, notifications, eventBoothRequests, rainWallet } = await loadSellerBookingStatus(req.user.id);
    const activeLockForExtension = userRecord ? await findActiveLockForExtension(userRecord) : null;

    return res.render('seller/booking_status', {
        user: userRecord || req.user,
        booking: bookingView,
        notifications,
        eventBoothRequests,
        rainWallet,
        canExtendLock: Boolean(activeLockForExtension && !activeLockForExtension.pendingExtension),
        hasActiveLock: Boolean(activeLockForExtension),
        error: req.query.error || null,
        success: req.query.success || null,
        slipCheck: ['no_qr', 'service'].includes(req.query.slipCheck) ? req.query.slipCheck : null
    });
});

// คำขอจองล่าสุดของผู้ขาย
async function findLatestSellerBookingRequest(userId) {
    return prisma.bookingRequest.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
}

// --- 5. ผู้ขายอัปโหลดสลิปยืนยันการชำระเงิน หลังแอดมินจัดล็อกให้แล้ว ---
router.post('/booking-payment/confirm', isSellerOrApplicant, (req, res) => {
    uploadPaymentSlip.single('paymentSlip')(req, res, async (err) => {
        // พา tabToken ของแท็บที่ส่งสลิปไปหน้าสถานะด้วย ไม่งั้นหน้าสถานะจะใช้ cookie ที่แชร์กันทุกแท็บ (อาจเป็นอีกบัญชี)
        const tabToken = String(req.query.tabToken || (req.body && req.body.tabToken) || '');
        const backToStatus = (query) => res.redirect(`/booking-status?${query}${tabToken ? `&tabToken=${encodeURIComponent(tabToken)}` : ''}`);

        if (err) {
            console.error('upload payment slip error', err);
            if (err.code === 'LIMIT_FILE_SIZE') return backToStatus('error=slip_too_large');
            if (err.message === 'ประเภทไฟล์ไม่ถูกต้อง') return backToStatus('error=slip_invalid_type');
            return backToStatus('error=upload_failed');
        }

        try {
            if (!req.file) {
                return backToStatus('error=missing_slip');
            }

            const latestRequest = await findLatestSellerBookingRequest(req.user.id);

            if (!latestRequest || String(latestRequest.status || '').toUpperCase() !== 'IN_PROGRESS') {
                return backToStatus('error=not_awaiting_payment');
            }

            if (latestRequest.paymentSlipImage) {
                return backToStatus('error=slip_already_uploaded');
            }

            const slipPath = req.file.url;

            // ตรวจสลิปอัตโนมัติทันทีตอนอัปโหลด (ถ้าตั้งค่า SlipOK ไว้) แล้วเก็บผลไว้ในฐานข้อมูล
            // เพื่อโชว์ให้ทั้งผู้ขายและแอดมินเห็นทันที และแอดมินจะได้ไม่ต้องยิง API ซ้ำตอนกดยืนยัน
            const requestTag = buildBookingRequestTag(latestRequest.id);
            const linkedBooking = requestTag
                ? await prisma.booking.findFirst({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
                : null;
            const verifyResult = await verifySlip(slipPath, linkedBooking ? rainCompensation.getPayableAmount(latestRequest, linkedBooking.grandTotal) : null);

            // เก็บสลิปไว้รอแอดมินตรวจสอบขั้นสุดท้ายก่อน ไม่เปลี่ยนสถานะเป็น SUCCESS ทันที
            // (แอดมินต้องกดยืนยันที่หน้า /admin/approvals ก่อน ระบบถึงจะแจ้งผู้ขายว่าล็อกเป็นของตนแล้ว)
            await prisma.bookingRequest.update({
                where: { id: latestRequest.id },
                data: {
                    paymentSlipImage: slipPath,
                    slipVerified: verifyResult ? verifyResult.ok : null,
                    slipVerifyReason: verifyResult ? (verifyResult.reason || null) : null,
                    slipVerifiedAmount: verifyResult && Number.isFinite(verifyResult.amount) ? verifyResult.amount : null
                }
            });

            // สลิปที่ระบบตรวจอัตโนมัติไม่ได้ (ไม่มี QR / SlipOK ใช้ไม่ได้) -> หน้าสถานะเด้ง popup บอกผู้ขายว่าแอดมินจะตรวจเอง
            const slipCheck = verifyResult && verifyResult.manual ? `&slipCheck=${verifyResult.manual}` : '';
            return backToStatus(`success=slip_uploaded${slipCheck}`);
        } catch (error) {
            console.error('booking-payment confirm error', error);
            return backToStatus('error=payment_confirm_failed');
        }
    });
});

// --- 5.0 ใช้ส่วนลดชดเชยฝนตก (ต้องใช้ทั้งหมดในครั้งเดียว ส่วนที่เกินยอดหายไป) — กติกาใน utils/rainCompensation.js ---
// ส่วนลดครอบคลุมยอดทั้งหมด (ไม่ต้องโอน) ยืนยันการชำระเงินให้เลยโดยไม่ต้องรอแอดมินตรวจสลิป เพราะไม่มีเงินให้ตรวจ
router.post('/booking-payment/rain-discount', isSellerOrApplicant, async (req, res) => {
    const tabToken = String(req.body.tabToken || req.query.tabToken || '');
    const backToStatus = (query) => res.redirect(`/booking-status?${query}${tabToken ? `&tabToken=${encodeURIComponent(tabToken)}` : ''}`);

    try {
        const latestRequest = await findLatestSellerBookingRequest(req.user.id);
        const requestTag = latestRequest ? buildBookingRequestTag(latestRequest.id) : '';
        const linkedBooking = requestTag
            ? await prisma.booking.findFirst({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
            : null;
        if (!latestRequest || !linkedBooking) return backToStatus('error=not_awaiting_payment');

        const result = await rainCompensation.applyCreditsToRequest(req.user.id, latestRequest, linkedBooking.grandTotal);
        if (result.error) return backToStatus(`error=${result.error}`);

        if (result.payable <= 0) {
            const { markPaymentConfirmed } = require('../controllers/approvalController');
            const fresh = await prisma.bookingRequest.findUnique({ where: { id: latestRequest.id } });
            await markPaymentConfirmed(fresh, 'ระบบ (ส่วนลดชดเชยฝนตก)', `ใช้ส่วนลดชดเชยฝนตก ${result.discount} บาท ครอบคลุมยอดทั้งหมด`);
            return backToStatus('success=rain_discount_paid');
        }
        return backToStatus('success=rain_discount_applied');
    } catch (error) {
        console.error('booking-payment rain discount error', error);
        return backToStatus('error=rain_discount_failed');
    }
});

router.post('/booking-payment/rain-discount/cancel', isSellerOrApplicant, async (req, res) => {
    const tabToken = String(req.body.tabToken || req.query.tabToken || '');
    const backToStatus = (query) => res.redirect(`/booking-status?${query}${tabToken ? `&tabToken=${encodeURIComponent(tabToken)}` : ''}`);

    try {
        const latestRequest = await findLatestSellerBookingRequest(req.user.id);
        const result = await rainCompensation.cancelCreditsOnRequest(req.user.id, latestRequest);
        if (result.error) return backToStatus(`error=${result.error}`);
        return backToStatus('success=rain_discount_cancelled');
    } catch (error) {
        console.error('booking-payment rain discount cancel error', error);
        return backToStatus('error=rain_discount_failed');
    }
});

// --- 5.1 ผู้ขายลบสลิปที่ส่งไปแล้วเพื่ออัปโหลดใหม่ (ส่งผิดใบ / ตอนส่งระบบตรวจสลิปอัตโนมัติใช้ไม่ได้) ---
// ลบได้เฉพาะตอนแอดมินยังไม่ยืนยัน (คำขอยัง IN_PROGRESS) — ล้างผลตรวจเดิมด้วย สลิปใหม่จะตรวจอัตโนมัติอีกรอบ
router.post('/booking-payment/remove-slip', isSellerOrApplicant, async (req, res) => {
    const tabToken = String(req.body.tabToken || req.query.tabToken || '');
    const backToStatus = (query) => res.redirect(`/booking-status?${query}${tabToken ? `&tabToken=${encodeURIComponent(tabToken)}` : ''}`);

    try {
        const latestRequest = await findLatestSellerBookingRequest(req.user.id);
        if (!latestRequest || String(latestRequest.status || '').toUpperCase() !== 'IN_PROGRESS' || !latestRequest.paymentSlipImage) {
            return backToStatus('error=no_slip_to_remove');
        }

        await prisma.bookingRequest.update({
            where: { id: latestRequest.id },
            data: { paymentSlipImage: null, slipVerified: null, slipVerifyReason: null, slipVerifiedAmount: null }
        });
        await deleteImage(latestRequest.paymentSlipImage).catch(() => {});

        return backToStatus('success=slip_removed');
    } catch (error) {
        console.error('booking-payment remove slip error', error);
        return backToStatus('error=remove_slip_failed');
    }
});

// หน้าแจ้งเตือน (views/seller/notifications.ejs + public/js/seller/notifications.js)
router.get('/notifications', isAuthenticated, async (req, res) => {
    const { userRecord, bookingView, notifications } = await loadSellerBookingStatus(req.user.id, { previewNotice: isNoticePreview(req) });

    return res.render('seller/notifications', {
        user: userRecord || req.user,
        booking: bookingView,
        notifications
    });
});

// ชุดแจ้งเตือนล่าสุดแบบ JSON — หน้าแจ้งเตือนดึงซ้ำทุก 60 วินาทีเพื่อขึ้นแถบ "มีแจ้งเตือนใหม่"
router.get('/notifications/feed', isAuthenticated, async (req, res) => {
    try {
        const { notifications } = await loadSellerBookingStatus(req.user.id, { previewNotice: isNoticePreview(req) });
        return res.json({ notifications });
    } catch (error) {
        console.error('notifications feed error', error);
        return res.status(500).json({ error: 'load_failed' });
    }
});

// ทำเป็นอ่านแล้ว / ยังไม่อ่าน — body: { keys: [...] } (key มาจาก applyReadState) แล้วล้าง cache กระดิ่งให้เลขอัปเดตทันที
router.post('/notifications/read', isAuthenticated, async (req, res) => {
    try {
        await markRead(req.user.id, req.body.keys);
        req.app.locals.clearSellerNotificationCache?.(req.user.id);
        return res.json({ ok: true });
    } catch (error) {
        console.error('notifications read error', error);
        return res.status(500).json({ error: 'save_failed' });
    }
});

router.post('/notifications/unread', isAuthenticated, async (req, res) => {
    try {
        await markUnread(req.user.id, req.body.keys);
        req.app.locals.clearSellerNotificationCache?.(req.user.id);
        return res.json({ ok: true });
    } catch (error) {
        console.error('notifications unread error', error);
        return res.status(500).json({ error: 'save_failed' });
    }
});

router.get('/quotations/:requestId', isAuthenticated, async (req, res) => {
    try {
        const quotation = await buildQuotationData(req.params.requestId, req.user?.name);
        if (!quotation || quotation.ownerUserId !== req.user.id) {
            return res.redirect('/booking-status?error=receipt_not_found');
        }
        return res.render('seller/quotation', { quotation, error: null });
    } catch (err) {
        return res.status(500).render('seller/quotation', { error: 'เกิดข้อผิดพลาดในการโหลดใบเสนอราคา', quotation: null });
    }
});

// ย้ายฟีเจอร์ขอใบกำกับภาษีไปรวมกับหน้า "ร้านค้าของฉัน" แล้ว (ดู GET /shop-profile) — คง route นี้ไว้
// เป็นแค่ทางเชื่อมสำหรับลิงก์/บุ๊กมาร์กเก่าที่อาจยังชี้มาที่นี่
router.get('/tax-invoice-requests', isAuthenticated, (req, res) => {
    res.redirect('/documents/tax-invoice');
});

router.post('/tax-invoice-requests', isAuthenticated, async (req, res) => {
    const bookingRequestIds = Array.isArray(req.body.bookingRequestIds)
        ? req.body.bookingRequestIds
        : [req.body.bookingRequestIds].filter(Boolean);

    const result = await taxInvoiceCtrl.createTaxInvoiceRequest({
        requestedByUserId: req.user.id,
        bookingRequestIds,
        taxInvoiceProfileId: req.body.taxInvoiceProfileId,
        newProfileData: req.body.taxInvoiceProfileId ? null : {
            taxpayerType: req.body.taxpayerType,
            taxpayerName: req.body.taxpayerName,
            taxId: req.body.taxId,
            branch: req.body.branch,
            address: req.body.address,
            phoneNumber: req.body.phoneNumber
        }
    });

    if (result.error) return res.redirect(`/documents/tax-invoice?error=${result.error}`);
    res.redirect('/documents/tax-invoice?success=tax_invoice_requested');
});

router.get('/tax-invoices/:id', isAuthenticated, async (req, res) => {
    try {
        const taxInvoice = await taxInvoiceCtrl.buildTaxInvoiceData(req.params.id);
        if (!taxInvoice || taxInvoice.ownerUserId !== req.user.id) {
            return res.redirect('/documents/tax-invoice?error=tax_invoice_not_found');
        }
        return res.render('seller/taxInvoice', { taxInvoice, error: null });
    } catch (err) {
        return res.status(500).render('seller/taxInvoice', { error: 'เกิดข้อผิดพลาดในการโหลดใบกำกับภาษี', taxInvoice: null });
    }
});

// ให้ app.js เรียกไปใส่ res.locals.notifications ทุกหน้าผู้ขาย (badge กระดิ่งใน navbarSeller) — ใช้ชุดแจ้งเตือน
// เดียวกับหน้า /notifications รวมถึงการ์ด "ต่อล็อกไหม?" ไม่ต้องเข้า /booking-status ก่อนถึงจะเห็นเลขบนกระดิ่ง
router.loadSellerNotifications = async (userId) => {
    const { notifications } = await loadSellerBookingStatus(userId);
    return notifications;
};

module.exports = router;
