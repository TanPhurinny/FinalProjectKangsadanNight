const express = require('express');
const router = express.Router();
const prisma = require('../config/prismaClient');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAnnouncementsForUser } = require('../controllers/announcementController');
const { getMarketMapPage } = require('../controllers/marketController');
const { repairReportSchema, bookingStallInputSchema, sellerApplicationSchema, shopProfileSchema, THAI_BANK_NAMES } = require('../utils/validationSchemas');
const { buildPromptPayQrDataUrl, PROMPTPAY_ID } = require('../utils/promptpayQr');
const { verifySlip } = require('../utils/slipVerification');
const {
    toStartOfDay,
    addDays,
    getBookingRoundMetaForDate,
    getBookingRoundStatusDetails,
    getBookingPhaseForRound
} = require('../utils/bookingRound');
const { buildBookingRequestTag, stripBookingRequestTag, extractBookingRequestId } = require('../utils/bookingRequestTag');
const { buildReceiptData } = require('../controllers/receiptController');

// สร้างโฟลเดอร์ upload ถ้ายังไม่มี
const uploadDir = path.join(__dirname, '../public/uploads/repairs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ตั้งค่า multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

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
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// โฟลเดอร์เก็บสลิปโอนเงินยืนยันการจอง
const paymentSlipDir = path.join(__dirname, '../public/uploads/payment-slips');
if (!fs.existsSync(paymentSlipDir)) {
    fs.mkdirSync(paymentSlipDir, { recursive: true });
}

const paymentSlipStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, paymentSlipDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

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
const shopApplicationDir = path.join(__dirname, '../public/uploads/shop-applications');
if (!fs.existsSync(shopApplicationDir)) {
    fs.mkdirSync(shopApplicationDir, { recursive: true });
}

const shopApplicationStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, shopApplicationDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

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
const shopProfileDir = path.join(__dirname, '../public/uploads/shop-profile');
if (!fs.existsSync(shopProfileDir)) {
    fs.mkdirSync(shopProfileDir, { recursive: true });
}

const shopProfileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, shopProfileDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

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
const SMALL_APPLIANCE_PRICE = 20;
const LARGE_APPLIANCE_PRICE = 40;
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

function getRentalDays(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const diffMs = endDate.getTime() - startDate.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor(diffMs / dayMs);
    return Math.max(1, diffDays + 1);
}

async function ensureBookingRoundForDate(dateValue) {
    const meta = getBookingRoundMetaForDate(dateValue);
    const reminderDate = addDays(meta.cycleEnd, -5);
    const openAt = addDays(meta.cycleStart, 1);

    const record = await prisma.bookingRound.upsert({
        where: { roundNumber: meta.roundNumber },
        update: {
            cycleStartDate: meta.cycleStart,
            cycleEndDate: meta.cycleEnd,
            reminderDate,
            openAt
        },
        create: {
            roundNumber: meta.roundNumber,
            cycleStartDate: meta.cycleStart,
            cycleEndDate: meta.cycleEnd,
            reminderDate: reminderDate,
            openAt: openAt
        }
    });

    return { ...meta, reminderDate, openAt, record };
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

    const map = {};
    for (const zone of zones) {
        const zoneCode = String(zone.code || '').toLowerCase();
        if (!zoneCode) continue;

        const size = zone.rows.find((row) => row.size)?.size || zone.size || '-';

        map[zoneCode] = {
            label: `โซน ${zone.code}`,
            description: zone.description || `พื้นที่ขายสำหรับโซน ${zone.code}`,
            size,
            dailyPrice: dominantRowPrice(zone.rows),
            electricityFee: Number(zone.electricityFee || LIGHT_UNIT_PRICE)
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
// (พฤหัสบดี = วันสุดท้ายของรอบก่อนหน้า ตรงกับ phase3Start ใน getBookingPhaseForRound)
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
        status: 'IN_PROGRESS',
        isRead: false,
        isNew: true
    }];
}

// การ์ดย้ำเตือนต่อล็อก ผูกกับล็อกจริงที่แม่ค้าจองไว้ (assignedStallCode) ไม่ใช่แค่เดาจากวันในสัปดาห์
// โชว์เฉพาะตอนที่ยังมีวันให้ต่อได้ (rentalEndDate ยังไม่ถึง cycleEnd ของรอบปัจจุบัน)
function buildExtendLockReminderEntry(extendInfo) {
    if (!extendInfo?.currentBooking?.rentalEndDate) return [];

    const { currentBooking, latestRequest, roundMeta } = extendInfo;
    const currentEndDate = toStartOfDay(currentBooking.rentalEndDate);
    const cycleEnd = toStartOfDay(roundMeta.cycleEnd);
    if (!currentEndDate || !cycleEnd || currentEndDate.getTime() >= cycleEnd.getTime()) return [];

    const stallLabel = latestRequest?.assignedStallCode ? `ล็อก ${latestRequest.assignedStallCode}` : 'ล็อกของคุณ';

    return [{
        id: `extend-reminder-${latestRequest.id}`,
        type: 'pending-review',
        title: 'ต่อล็อกไหม?',
        desc: `${stallLabel} จะหมดสิทธิ์ขายวันที่ ${formatDateThai(currentBooking.rentalEndDate)} หากต้องการขายต่อในรอบนี้ (ถึงได้สูงสุดวันที่ ${formatDateThai(roundMeta.cycleEnd)}) กดต่อล็อกได้ที่หน้าสถานะการจอง`,
        date: formatDateThai(currentBooking.rentalEndDate),
        time: formatTimeThai(currentBooking.rentalEndDate),
        status: 'IN_PROGRESS',
        isRead: false,
        isNew: true
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

// ใช้ label เดียวกับหน้า views/seller/repair.ejs เพื่อให้สถานะแจ้งซ่อมสื่อความหมายตรงกันทั้งระบบ
function getRepairStatusText(status) {
    switch (status) {
        case 'PENDING':
            return 'รอดำเนินการ';
        case 'IN_PROGRESS':
            return 'กำลังดำเนินการ';
        case 'APPROVED':
            return 'อนุมัติแล้ว';
        case 'SUCCESS':
            return 'ซ่อมเสร็จแล้ว';
        case 'REJECTED':
            return 'ถูกปฏิเสธ';
        default:
            return 'ไม่ทราบสถานะ';
    }
}

function getRepairStatusClass(status) {
    switch (status) {
        case 'SUCCESS':
        case 'APPROVED':
            return 'status-pill--success';
        case 'REJECTED':
            return 'status-pill--danger';
        case 'IN_PROGRESS':
            return 'status-pill--warning';
        case 'PENDING':
        default:
            return 'status-pill--neutral';
    }
}

function buildBookingView(latestBooking) {
    if (!latestBooking) return null;

    const zoneLabel = latestBooking.selectedZoneLabel || (latestBooking.zoneCode ? `โซน ${latestBooking.zoneCode}` : '-');
    const roundNumber = latestBooking.rentalStartDate
        ? getBookingRoundMetaForDate(latestBooking.rentalStartDate).roundNumber
        : null;

    return {
        id: latestBooking.id,
        status: latestBooking.status,
        statusText: getBookingStatusText(latestBooking.status),
        stage: getBookingStep(latestBooking.status),
        roundNumber,
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
                status: 'PENDING'
            }
        ];
    }

    const status = String(latestBooking.status || 'PENDING').toUpperCase();
    const statusText = getBookingStatusText(status, awaitingPaymentVerification);
    // ไม่เปิดเผยเลขล็อกจนกว่าจะยืนยันสลิปโอนเงินเสร็จ (ดู loadSellerBookingStatus)
    const stallLabel = latestBooking.slot?.slotNumber || null;
    const lockMention = stallLabel ? `ล็อก ${stallLabel}` : 'ล็อกของคุณ';
    const zoneLabel = latestBooking.zoneCode ? `โซน ${latestBooking.zoneCode}` : 'ที่แจ้งไว้';

    const slipRejectedEntry = buildSlipRejectedReminderEntry(latestBooking, status);

    const reminderEntry = isWednesdayReminderDay(latestBooking.createdAt || new Date())
        ? [{
            id: `wednesday-reminder-${latestBooking.id || 'current'}`,
            type: 'pending-review',
            title: 'แจ้งเตือนวันพุธ',
            desc: buildWednesdayReminderMessage(),
            date: formatDateThai(latestBooking.createdAt || new Date()),
            time: formatTimeThai(latestBooking.createdAt || new Date()),
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
                title: 'คำขอจองไม่ผ่านการตรวจสอบ',
                desc: `คำขอจอง${zoneLabel} ถูกปฏิเสธ กรุณาติดต่อแอดมินหรือส่งคำขอจองใหม่อีกครั้ง`,
                date: formatDateThai(latestBooking.createdAt),
                time: formatTimeThai(latestBooking.createdAt),
                status: 'REJECTED',
                isRead: false,
                isNew: true
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
            status: 'PENDING'
        },
        {
            id: 2,
            type: 'pending-payment',
            title: awaitingPaymentVerification
                ? 'ส่งสลิปโอนเงินแล้ว รอแอดมินตรวจสอบ'
                : (status === 'IN_PROGRESS' ? 'แอดมินจัดล็อกให้แล้ว รอชำระเงิน' : 'ชำระเงินค่าจอง'),
            desc: awaitingPaymentVerification
                ? 'แอดมินกำลังตรวจสอบสลิปโอนเงินของคุณ เมื่อยืนยันแล้วระบบจะแจ้งเลขล็อกและยืนยันว่าเป็นของคุณอย่างเป็นทางการ'
                : (status === 'IN_PROGRESS'
                    ? 'แอดมินจัดล็อกให้คุณแล้ว กรุณาชำระเงินและอัปโหลดสลิปโอนเงินที่หน้าสถานะการจองเพื่อยืนยัน (เลขล็อกจะแจ้งให้ทราบหลังยืนยันการชำระเงิน)'
                    : `สถานะล่าสุด: ${statusText}`),
            date: formatDateThai(latestBooking.createdAt),
            time: formatTimeThai(latestBooking.createdAt),
            status: 'IN_PROGRESS'
        },
        {
            id: 3,
            type: 'success-payment',
            title: 'เสร็จสิ้นการจอง',
            desc: `ยืนยันการชำระเงินเรียบร้อย ${lockMention} เป็นของร้านคุณอย่างเป็นทางการ`,
            date: formatDateThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            time: formatTimeThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            status: 'SUCCESS'
        },
        // การ์ดแจ้งว่าใบเสร็จ/ใบกำกับภาษีพร้อมแล้ว — โผล่เฉพาะตอนจ่ายเงินสำเร็จจริง (มีใบเสร็จให้ดูที่ /receipts/:id แล้ว)
        // type: 'success-receipt' ตรงกับไอคอน bi-file-earmark-text ที่ map ไว้ใน public/js/seller/statusbook.js อยู่แล้ว
        ...(status === 'SUCCESS' ? [{
            id: 4,
            type: 'success-receipt',
            title: 'ใบเสร็จพร้อมแล้ว',
            desc: 'ใบเสร็จ/ใบกำกับภาษีของคุณพร้อมให้ดูและดาวน์โหลดแล้ว',
            date: formatDateThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            time: formatTimeThai(latestBooking.paymentConfirmedAt || latestBooking.createdAt),
            status: 'SUCCESS',
            link: `/receipts/${latestBooking.id}`
        }] : [])
    ];

    const stage = getBookingStep(status);
    return [...extendReminderEntry, ...slipRejectedEntry, ...thursdayReminderEntry, ...reminderEntry, ...timeline].map((item, index) => ({
        ...item,
        isRead: typeof item.isRead === 'boolean' ? item.isRead : index < stage,
        isNew: typeof item.isNew === 'boolean' ? item.isNew : index + 1 === stage
    }));
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
                status: report.status,
                isRead: false,
                isNew: true
            };
        });
}

function parseShopTags(rawTags) {
    return String(rawTags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
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

function buildSellerDashboard(userRecord, activeBookingCount, latestBooking, latestRepairReport, latestAnnouncement) {
    const shop = userRecord?.shop || {};
    const shopName = shop.shopName || 'ยังไม่ได้ตั้งชื่อร้าน';
    const displayLetter = String(shopName || userRecord?.name || 'ร').trim().charAt(0).toUpperCase();

    const latestBookingView = latestBooking
        ? {
            ...latestBooking,
            // ไม่เปิดเผยเลขล็อกจนกว่าจะยืนยันสลิปโอนเงินเสร็จ (SUCCESS) ให้สอดคล้องกับกติกา
            // เดียวกับที่ใช้ในหน้า booking-status ทั้งระบบ — ก่อนหน้านี้หน้านี้หลุดโชว์เลขล็อกก่อนจ่ายเงิน
            slot: latestBooking.status === 'SUCCESS' ? latestBooking.slot : null,
            statusText: getBookingStatusText(latestBooking.status),
            statusClass: getBookingStatusClass(latestBooking.status),
            rentalStartDate: formatDateThai(latestBooking.rentalStartDate),
            rentalEndDate: formatDateThai(latestBooking.rentalEndDate),
            createdAt: formatDateThai(latestBooking.createdAt)
        }
        : null;

    const latestRepairReportView = latestRepairReport
        ? {
            ...latestRepairReport,
            statusText: getRepairStatusText(latestRepairReport.status),
            statusClass: getRepairStatusClass(latestRepairReport.status),
            createdAt: formatDateThai(latestRepairReport.createdAt)
        }
        : null;

    const latestAnnouncementView = latestAnnouncement
        ? {
            ...latestAnnouncement,
            createdAt: formatDateThai(latestAnnouncement.createdAt)
        }
        : null;

    return {
        shopName,
        displayLetter,
        shopDescription: shop.shopSummary || shop.productDetail || 'ยังไม่มีรายละเอียดร้านค้าในระบบ',
        productType: shop.productType || 'ยังไม่ระบุประเภทสินค้า',
        coverImage: shop.shopCoverImage || null,
        productImage: shop.productImage || null,
        sellerTier: shop.sellerTier || 'General Seller',
        zoneLabel: shop.shopZoneLabel || 'ยังไม่ได้ระบุโซนร้าน',
        isVerified: Boolean(shop.isVerified),
        tags: parseShopTags(shop.shopTags),
        activeBookingCount,
        latestBooking: latestBookingView,
        latestRepairReport: latestRepairReportView,
        latestAnnouncement: latestAnnouncementView,
        memberSince: userRecord?.createdAt || null,
        email: userRecord?.email || '-',
        phoneNumber: userRecord?.phoneNumber || '-'
    };
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

router.get('/seller', isSellerOnly, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { shop: true }
    });

    const activeBookingCount = await prisma.booking.count({
        where: {
            userId: req.user.id,
            status: { in: ['PENDING', 'APPROVED'] }
        }
    });

    const latestBooking = await prisma.booking.findFirst({
        where: { userId: req.user.id },
        include: { slot: true },
        orderBy: { createdAt: 'desc' }
    });

    const latestRepairReport = await prisma.maintenanceReport.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
    });

    // ประกาศล่าสุดที่แอดมิน/สตาฟส่งถึงกลุ่มผู้ขาย (role: SELLER)
    const sellerAnnouncements = await getAnnouncementsForUser('SELLER');
    const latestAnnouncement = sellerAnnouncements[0] || null;

    const bookingRoundSummary = getBookingRoundStatusDetails(new Date());
    const nextRoundMeta = getBookingRoundMetaForDate(addDays(bookingRoundSummary.cycleEnd, 1));
    const bookingRoundView = {
        roundNumber: bookingRoundSummary.roundNumber,
        cycleStart: formatDateThai(bookingRoundSummary.cycleStart),
        cycleEnd: formatDateThai(bookingRoundSummary.cycleEnd),
        status: bookingRoundSummary.status,
        statusText: bookingRoundSummary.statusText,
        nextRoundNumber: nextRoundMeta.roundNumber,
        nextOpenAt: formatDateThai(addDays(nextRoundMeta.cycleStart, 1))
    };

    return res.render('seller/indexseller', {
        user,
        dashboard: buildSellerDashboard(user, activeBookingCount, latestBooking, latestRepairReport, latestAnnouncement),
        bookingRound: bookingRoundView
    });
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

// --- หน้าแก้ไขโปรไฟล์ร้านค้า (เฉพาะผู้ขายที่ได้รับอนุมัติเป็น SELLER แล้ว) ---
router.get('/shop-profile', isSellerOnly, async (req, res) => {
    const userRecord = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { shop: true }
    });

    res.render('seller/shopProfile', {
        user: req.user,
        shop: userRecord?.shop || null,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

router.post('/shop-profile', isSellerOnly, (req, res) => {
    async function renderWithError(errorCode) {
        const userRecord = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { shop: true }
        });
        return res.render('seller/shopProfile', {
            user: req.user,
            shop: userRecord?.shop || null,
            error: errorCode,
            success: null,
            formData: req.body
        });
    }

    uploadShopProfile.fields([
        { name: 'productImage', maxCount: 1 },
        { name: 'shopCoverImage', maxCount: 1 }
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
            const productImage = req.files?.productImage?.[0]
                ? `/uploads/shop-profile/${req.files.productImage[0].filename}`
                : undefined;
            const shopCoverImage = req.files?.shopCoverImage?.[0]
                ? `/uploads/shop-profile/${req.files.shopCoverImage[0].filename}`
                : undefined;

            // ชื่อร้าน/ประเภทสินค้าไม่รับจากฟอร์มนี้ (ดูเหตุผลใน utils/validationSchemas.js) — ถ้ายังไม่มี
            // ShopDetail มาก่อนเลย (กรณีข้อมูลเก่าก่อนมีการซิงก์อัตโนมัติ) ค่อย fallback ไปเอาจากใบสมัครล่าสุด
            const existingShop = await prisma.shopDetail.findUnique({ where: { userId: req.user.id } });
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

            await prisma.shopDetail.upsert({
                where: { userId: req.user.id },
                update: {
                    productDetail: productDetail || null,
                    shopSummary: shopSummary || null,
                    shopTags: shopTags || null,
                    ...(productImage ? { productImage } : {}),
                    ...(shopCoverImage ? { shopCoverImage } : {})
                },
                create: {
                    userId: req.user.id,
                    shopName: fallbackShopName,
                    productType: fallbackProductType,
                    productDetail: productDetail || null,
                    shopSummary: shopSummary || null,
                    shopTags: shopTags || null,
                    productImage: productImage || null,
                    shopCoverImage: shopCoverImage || null
                }
            });

            return res.redirect('/shop-profile?success=profile_updated');
        } catch (dbErr) {
            return renderWithError('db_error');
        }
    });
});

// เส้นทาง community ถูกแยกไปจัดการที่ routes/communityRoutes.js แล้ว

// --- ผังตลาด (read-only สำหรับลูกค้าทั่วไป/ผู้ขาย ดูร้านค้า+ค้นหาร้านค้า) ---
router.get('/market-map', isAuthenticated, getMarketMapPage);

// --- หน้าประกาศ (แยกประกาศสำคัญ / ข่าวสารทั่วไป) ---
router.get('/announcements', isAuthenticated, async (req, res) => {
    const roleToFetch = req.user.role === 'SELLER' ? 'SELLER' : 'CUSTOMER';
    const announcements = await getAnnouncementsForUser(roleToFetch);
    const importantAnnouncements = announcements.filter((a) => a.isImportant);
    const generalAnnouncements = announcements.filter((a) => !a.isImportant);

    res.render('announcements', {
        user: req.user,
        importantAnnouncements,
        generalAnnouncements
    });
});

// --- สมัครเปิดร้านค้า (CUSTOMER สมัครแล้วรออนุมัติเป็น SELLER) ---
router.get('/shop-application', isAuthenticated, async (req, res) => {
    const latestApplication = await prisma.sellerApplication.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
    });

    res.render('seller/shopApplication', {
        user: req.user,
        latestApplication,
        bankNames: THAI_BANK_NAMES,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

router.post('/shop-application', isAuthenticated, (req, res) => {
    async function renderWithError(errorCode) {
        const latestApplication = await prisma.sellerApplication.findFirst({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        return res.render('seller/shopApplication', {
            user: req.user,
            latestApplication,
            bankNames: THAI_BANK_NAMES,
            error: errorCode,
            success: null,
            formData: req.body
        });
    }

    if (req.user.role !== 'CUSTOMER') {
        return res.redirect('/shop-application?error=not_customer');
    }

    uploadShopApplication.single('shopCoverImage')(req, res, async (err) => {
        if (err) {
            return renderWithError('upload_failed');
        }

        try {
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
                productDetail,
                sellerName,
                idCardNumber,
                bankName,
                bankAccountNumber,
                bankAccountName,
                phoneNumber,
                houseNumber,
                subdistrict,
                district,
                province
            } = parsed.data;
            const shopCoverImage = req.file ? `/uploads/shop-applications/${req.file.filename}` : null;

            await prisma.sellerApplication.create({
                data: {
                    userId: req.user.id,
                    shopName,
                    productType,
                    productDetail,
                    sellerName,
                    idCardNumber,
                    bankName,
                    bankAccountNumber,
                    bankAccountName,
                    phoneNumber,
                    houseNumber,
                    subdistrict,
                    district,
                    province,
                    shopCoverImage,
                    termsAcceptedAt: new Date(),
                    status: 'PENDING'
                }
            });

            return res.redirect('/select-zone');
        } catch (dbErr) {
            return renderWithError('db_error');
        }
    });
});

// --- 1. หน้าแจ้งซ่อม ---
router.get("/repair", isAuthenticated, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id }
    });
    const reports = await prisma.maintenanceReport.findMany({
        where: { userId: req.user.id },
        include: { assignedTo: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
    });
    res.render("seller/repair", {
        user: user,
        reports: reports,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// บันทึกแจ้งซ่อม (POST)
router.post("/repair", isAuthenticated, (req, res) => {
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.redirect("/repair?error=upload_failed");
        }

        try {
            const parsed = repairReportSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.redirect("/repair?error=missing_fields");
            }
            const { location, category, description } = parsed.data;

            const imagePath = req.file ? `/uploads/repairs/${req.file.filename}` : null;

            await prisma.maintenanceReport.create({
                data: {
                    location,
                    category,
                    description,
                    image: imagePath,
                    userId: req.user.id
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

router.get("/select-zone", isAuthenticated, isSellerOrApplicant, async (req, res) => {
    try {
        // ดึงข้อมูลผู้ขายจากฐานข้อมูล (รวมถึง shop.productType)
        // ถ้ายังไม่ใช่ SELLER จริง (สมัครแล้วรออนุมัติอยู่) ใช้ productType จากใบสมัครแทน
        const userRecord = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { shop: true }
        });

        const productType = userRecord?.shop?.productType || req.sellerApplication?.productType || null;
        const allowedZones = zoneAccess.allowedZonesFor(productType);

        const zoneDetails = await loadZoneDetailsMap();

        res.render("seller/select_zone", {
            user: req.user,
            productType,
            allowedZones,
            zoneDetails,
            cornerZoneOptions: CORNER_ZONE_OPTIONS
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
router.get("/booking-stall", isAuthenticated, isSellerOrApplicant, async (req, res) => {
    const { zone, corner } = req.query;
    const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { shop: true } });
    const productType = userRecord?.shop?.productType || req.sellerApplication?.productType || null;
    const allowedZones = zoneAccess.allowedZonesFor(productType).map(z => String(z).toLowerCase());
    const zoneCode = String(zone || '').toUpperCase();
    const normalizedZone = zoneCode.toLowerCase();
    const cornerZoneValue = resolveCornerZonePrice(corner);
    const bookingRoundInfo = await ensureBookingRoundForDate(new Date());
    const bookingRoundSummary = getBookingRoundStatusDetails(new Date());
    const nextRoundInfo = await ensureBookingRoundForDate(addDays(bookingRoundInfo.cycleEnd, 1));
    const currentPhase = getBookingPhaseForRound(bookingRoundInfo, new Date());
    const nextPhase = getBookingPhaseForRound(nextRoundInfo, new Date());

    const defaultStoreDetail = userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '';

    if (!zoneCode) {
        return res.status(400).render('seller/booking_stall', {
            user: userRecord,
            zone: null,
            zonePrice: 0,
            error: 'กรุณาเลือกโซนจากหน้าเลือกโซนก่อนทำรายการจอง',
            defaultStoreDetail,
            bookingRoundInfo,
            bookingRoundSummary,
            nextRoundInfo,
            currentPhase,
            nextPhase,
            pricing: {
                lightUnitPrice: LIGHT_UNIT_PRICE,
                smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                cornerZoneOptions: CORNER_ZONE_OPTIONS
            }
        });
    }

    if (allowedZones.length && !allowedZones.includes(normalizedZone)) {
        // ป้องกันการเข้าถึงหน้าเลือกแถวสำหรับโซนที่ผู้ขายไม่มีสิทธิ
        return res.status(403).render('seller/booking_stall', {
            user: userRecord,
            zone: null,
            zonePrice: 0,
            error: 'คุณไม่มีสิทธิ์จองโซนนี้ตามประเภทสินค้าของคุณ',
            defaultStoreDetail,
            bookingRoundInfo,
            bookingRoundSummary,
            nextRoundInfo,
            currentPhase,
            nextPhase,
            pricing: {
                lightUnitPrice: LIGHT_UNIT_PRICE,
                smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                cornerZoneOptions: CORNER_ZONE_OPTIONS
            }
        });
    }

    const zonePrice = await getDailyPriceByZoneCode(zoneCode);

    if (!zonePrice) {
        return res.status(404).render('seller/booking_stall', {
            user: userRecord,
            zone: zoneCode,
            zonePrice: 0,
            error: 'ไม่พบราคาของโซนนี้ในฐานข้อมูล',
            defaultStoreDetail,
            bookingRoundInfo,
            bookingRoundSummary,
            nextRoundInfo,
            currentPhase,
            nextPhase,
            pricing: {
                lightUnitPrice: LIGHT_UNIT_PRICE,
                smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                cornerZoneOptions: CORNER_ZONE_OPTIONS
            }
        });
    }

    res.render("seller/booking_stall", {
        user: userRecord,
        zone: zoneCode,
        zonePrice,
        error: null,
        defaultStoreDetail,
        bookingRoundInfo,
        bookingRoundSummary,
        nextRoundInfo,
        currentPhase,
        nextPhase,
        cornerZoneValue,
        pricing: {
            lightUnitPrice: LIGHT_UNIT_PRICE,
            smallAppliancePrice: SMALL_APPLIANCE_PRICE,
            largeAppliancePrice: LARGE_APPLIANCE_PRICE,
            cornerZoneOptions: CORNER_ZONE_OPTIONS
        }
    });
});

router.post('/booking-stall', isSellerOrApplicant, async (req, res) => {
    try {
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { shop: true, sellerProfile: true } });
        const productType = userRecord?.shop?.productType || req.sellerApplication?.productType || null;
        const allowedZones = zoneAccess.allowedZonesFor(productType).map(z => String(z).toLowerCase());

        const zoneCode = String(req.body.zone || '').trim().toUpperCase();
        const normalizedZone = zoneCode.toLowerCase();
        const bookingRoundInfo = await ensureBookingRoundForDate(new Date());
        const bookingRoundSummary = getBookingRoundStatusDetails(new Date());
        const nextRoundInfo = await ensureBookingRoundForDate(addDays(bookingRoundInfo.cycleEnd, 1));
        const currentPhase = getBookingPhaseForRound(bookingRoundInfo, new Date());
        const nextPhase = getBookingPhaseForRound(nextRoundInfo, new Date());

        // ร้านที่แอดมิน Blacklist จากคะแนนตรวจตลาด จองแผงรอบใหม่ไม่ได้ (ดู controllers/scoreReportController.js)
        if (userRecord?.isBlacklisted) {
            return res.status(403).render('seller/booking_stall', {
                user: userRecord,
                zone: null,
                zonePrice: 0,
                error: 'ร้านค้าของคุณถูกระงับสิทธิ์การจองแผง (Blacklist) กรุณาติดต่อผู้ดูแลตลาด',
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
                bookingRoundInfo,
                bookingRoundSummary,
                nextRoundInfo,
                currentPhase,
                nextPhase,
                cornerZoneValue: resolveCornerZonePrice(req.body.cornerZone),
                pricing: {
                    lightUnitPrice: LIGHT_UNIT_PRICE,
                    smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                    largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                    cornerZoneOptions: CORNER_ZONE_OPTIONS
                }
            });
        }

        if (!zoneCode) {
            return res.status(400).render('seller/booking_stall', {
                user: userRecord,
                zone: null,
                zonePrice: 0,
                error: 'ไม่พบโซนที่ต้องการจอง',
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
                bookingRoundInfo,
                bookingRoundSummary,
                nextRoundInfo,
                currentPhase,
                nextPhase,
                cornerZoneValue: resolveCornerZonePrice(req.body.cornerZone),
                pricing: {
                    lightUnitPrice: LIGHT_UNIT_PRICE,
                    smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                    largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                    cornerZoneOptions: CORNER_ZONE_OPTIONS
                }
            });
        }

        if (allowedZones.length && !allowedZones.includes(normalizedZone)) {
            return res.status(403).render('seller/booking_stall', {
                user: userRecord,
                zone: zoneCode,
                zonePrice: 0,
                error: 'คุณไม่มีสิทธิ์จองโซนนี้ตามประเภทสินค้าของคุณ',
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
                bookingRoundInfo,
                bookingRoundSummary,
                nextRoundInfo,
                currentPhase,
                nextPhase,
                cornerZoneValue: resolveCornerZonePrice(req.body.cornerZone),
                pricing: {
                    lightUnitPrice: LIGHT_UNIT_PRICE,
                    smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                    largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                    cornerZoneOptions: CORNER_ZONE_OPTIONS
                }
            });
        }

        const zonePrice = await getDailyPriceByZoneCode(zoneCode);
        if (!zonePrice) {
            return res.status(404).render('seller/booking_stall', {
                user: userRecord,
                zone: zoneCode,
                zonePrice: 0,
                error: 'ไม่พบราคาโซนจากฐานข้อมูล',
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
                bookingRoundInfo,
                bookingRoundSummary,
                nextRoundInfo,
                currentPhase,
                nextPhase,
                cornerZoneValue: resolveCornerZonePrice(req.body.cornerZone),
                pricing: {
                    lightUnitPrice: LIGHT_UNIT_PRICE,
                    smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                    largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                    cornerZoneOptions: CORNER_ZONE_OPTIONS
                }
            });
        }

        const inputValidation = bookingStallInputSchema.safeParse(req.body);
        if (!inputValidation.success) {
            return res.status(400).render('seller/booking_stall', {
                user: userRecord,
                zone: zoneCode,
                zonePrice,
                error: 'ข้อมูลจำนวนแผง/เครื่องใช้ไฟฟ้าหรือวันที่ที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
                bookingRoundInfo,
                bookingRoundSummary,
                nextRoundInfo,
                currentPhase,
                nextPhase,
                cornerZoneValue: resolveCornerZonePrice(req.body.cornerZone),
                pricing: {
                    lightUnitPrice: LIGHT_UNIT_PRICE,
                    smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                    largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                    cornerZoneOptions: CORNER_ZONE_OPTIONS
                }
            });
        }

        const stallCount = Math.max(1, safeInt(req.body.stallCount, 1));
        const lightEnabled = true;
        const cornerZoneValue = resolveCornerZonePrice(req.body.cornerZone);
        const cornerZoneOption = CORNER_ZONE_OPTIONS.find((opt) => opt.value === cornerZoneValue) || null;
        const smallApplianceCount = Math.max(0, safeInt(req.body.smallApplianceCount, 0));
        const largeApplianceCount = Math.max(0, safeInt(req.body.largeApplianceCount, 0));
        const storeDetail = String(req.body.storeDetail || '').trim();

        const startDate = toStartOfDay(req.body.dateStart);
        const endDate = toStartOfDay(req.body.dateEnd);
        if (!startDate || !endDate || endDate < startDate) {
            return res.status(400).render('seller/booking_stall', {
                user: userRecord,
                zone: zoneCode,
                zonePrice,
                error: 'กรุณาเลือกวันที่เช่าให้ถูกต้อง',
                defaultStoreDetail: storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
                bookingRoundInfo,
                bookingRoundSummary,
                nextRoundInfo,
                currentPhase,
                nextPhase,
                cornerZoneValue,
                pricing: {
                    lightUnitPrice: LIGHT_UNIT_PRICE,
                    smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                    largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                    cornerZoneOptions: CORNER_ZONE_OPTIONS
                }
            });
        }

        const rentalDays = getRentalDays(startDate, endDate);

        // จองข้ามรอบไม่ได้ (วันเริ่ม/สิ้นสุดต้องอยู่ในรอบ 14 วันเดียวกัน)
        const targetRoundMeta = getBookingRoundMetaForDate(startDate);
        const endRoundMeta = getBookingRoundMetaForDate(endDate);
        const rejectBooking = (message) => res.status(400).render('seller/booking_stall', {
            user: userRecord,
            zone: zoneCode,
            zonePrice,
            error: message,
            defaultStoreDetail: storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || '',
            bookingRoundInfo,
            bookingRoundSummary,
            nextRoundInfo,
            currentPhase,
            nextPhase,
            cornerZoneValue,
            pricing: {
                lightUnitPrice: LIGHT_UNIT_PRICE,
                smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                cornerZoneOptions: CORNER_ZONE_OPTIONS
            }
        });

        if (endRoundMeta.roundNumber !== targetRoundMeta.roundNumber) {
            return rejectBooking('ห้ามจองข้ามรอบ กรุณาเลือกวันที่เริ่มและสิ้นสุดให้อยู่ในรอบการจองเดียวกัน');
        }

        // กติกา 3 ช่วงก่อนรอบจะเปิด (ดู utils/bookingRound.js: getBookingPhaseForRound)
        const phaseInfo = getBookingPhaseForRound(targetRoundMeta, new Date());

        if (phaseInfo.phase === 'not_open_yet') {
            return rejectBooking('ยังไม่ถึงช่วงเปิดจองสำหรับรอบนี้ กรุณารอให้ถึงวันจันทร์ก่อนรอบจะเปิด');
        }

        if (cornerZoneValue > 0 && !phaseInfo.allowCornerZone) {
            return rejectBooking('เลือกล็อคเต็ง (แผงพิเศษ) ได้เฉพาะช่วงจันทร์-อังคารก่อนเปิดรอบเท่านั้น');
        }

        if (phaseInfo.phase === 1 && cornerZoneValue === 0) {
            const isFullRound = startDate.getTime() === toStartOfDay(targetRoundMeta.cycleStart).getTime()
                && endDate.getTime() === toStartOfDay(targetRoundMeta.cycleEnd).getTime();
            if (!isFullRound) {
                return rejectBooking('ช่วงจันทร์-อังคารก่อนเปิดรอบ จองได้เฉพาะเต็มรอบ 14 วัน หรือเลือกล็อคเต็งเท่านั้น');
            }
        }

        if (phaseInfo.minDays && rentalDays < phaseInfo.minDays) {
            return rejectBooking(`ช่วงนี้ต้องจองต่อเนื่องอย่างน้อย ${phaseInfo.minDays} วัน`);
        }

        if (phaseInfo.maxAdvanceStart && startDate.getTime() > toStartOfDay(phaseInfo.maxAdvanceStart).getTime()) {
            return rejectBooking('จองล่วงหน้าได้แค่ 1 วันก่อนวันขายเท่านั้น');
        }

        const rentTotal = zonePrice * stallCount * rentalDays;
        const applianceTotal = (smallApplianceCount * SMALL_APPLIANCE_PRICE + largeApplianceCount * LARGE_APPLIANCE_PRICE) * rentalDays;
        const lightTotal = LIGHT_UNIT_PRICE * stallCount * rentalDays;
        // ค่าแผงหัวมุม/แผงพิเศษยังไม่คิดตอนจอง เป็นแค่การแจ้งความสนใจ
        // จะคิดเงินจริงต่อเมื่อแอดมินจัดแผงพิเศษให้ในขั้นตอน "จัดล็อก" เท่านั้น
        const cornerZoneTotal = cornerZoneValue * stallCount * rentalDays;
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
                storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || req.sellerApplication?.productDetail || 'ไม่มีรายละเอียดเพิ่มเติม',
                cornerZoneOption ? `[สนใจแผงพิเศษ: ${cornerZoneOption.label} +${cornerZoneOption.value} บาท/ล็อก/วัน]` : ''
            ].filter(Boolean).join(' ').trim();

            const bookingRequestRecord = await tx.bookingRequest.create({
                data: {
                    productName: userRecord?.shop?.shopName || req.sellerApplication?.shopName || `ร้านของ ${userRecord?.name || req.user.username || 'ผู้ขาย'}`,
                    description: detailForRequest,
                    sellerName: userRecord?.name || req.user.username || 'ไม่ระบุ',
                    phone: userRecord?.phoneNumber || req.sellerApplication?.phoneNumber || '-',
                    zone: zoneCode,
                    productImage: userRecord?.shop?.productImage || req.sellerApplication?.shopCoverImage || null,
                    sellerId: userRecord?.sellerProfile?.id || null,
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
                        dailyStallPrice: zonePrice,
                        lightEnabled,
                        lightUnitPrice: LIGHT_UNIT_PRICE,
                        smallApplianceCount,
                        largeApplianceCount,
                        smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                        largeAppliancePrice: LARGE_APPLIANCE_PRICE,
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

        return res.redirect('/booking-status');
    } catch (error) {
        console.error('booking-stall POST error', error);
        return res.status(500).render('seller/booking_stall', {
            user: req.user,
            zone: req.body.zone || null,
            zonePrice: 0,
            error: 'เกิดข้อผิดพลาดขณะบันทึกการจอง กรุณาลองใหม่อีกครั้ง',
            defaultStoreDetail: req.body.storeDetail || '',
            cornerZoneValue: resolveCornerZonePrice(req.body.cornerZone),
            pricing: {
                lightUnitPrice: LIGHT_UNIT_PRICE,
                smallAppliancePrice: SMALL_APPLIANCE_PRICE,
                largeAppliancePrice: LARGE_APPLIANCE_PRICE,
                cornerZoneOptions: CORNER_ZONE_OPTIONS
            }
        });
    }
});

// --- ต่อล็อค: สำหรับคนที่มีล็อกที่แอดมินจัดให้แล้วในรอบปัจจุบัน อยากต่อเวลาขาย ---
// เข้าเงื่อนไขเดียวกับที่ market-map ใช้เช็ค "ล็อกที่จัดสรรแล้ว"
// (BookingRequest.status ใน APPROVED/IN_PROGRESS/SUCCESS + มี assignedStallCode)
async function findActiveLockForExtension(userRecord) {
    const latestRequest = await prisma.bookingRequest.findFirst({
        where: {
            status: { in: ['APPROVED', 'IN_PROGRESS', 'SUCCESS'] },
            assignedStallCode: { not: null },
            OR: [
                userRecord?.sellerProfile?.id ? { sellerId: userRecord.sellerProfile.id } : undefined,
                userRecord?.name ? { sellerName: userRecord.name } : undefined
            ].filter(Boolean)
        },
        orderBy: { createdAt: 'desc' }
    });

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

    return { latestRequest, currentBooking, roundMeta };
}

// กติกา "ต่อล็อก" ใช้ 3 ช่วงเดียวกับกติกาจองรอบใหม่ (จันทร์-อังคาร / พุธ / พฤหัสฯ เป็นต้นไป)
// ต่างจาก getBookingPhaseForRound ตรงที่นี่เทียบจากวันในสัปดาห์ของ "วันนี้" ตรงๆ ไม่ใช่ระยะห่างจาก
// วันเปิดรอบถัดไป เพราะการต่อล็อกเกิดขึ้นกลางรอบที่กำลังขายอยู่ ไม่ใช่ก่อนรอบเปิด
function getExtendPhase(dateValue = new Date()) {
    const today = toStartOfDay(dateValue);
    const day = today.getDay();

    if (day === 1 || day === 2) {
        // ช่วงที่ 1: จันทร์-อังคาร — ต่อกี่วันก็ได้ทันที (รวมถึงต่อจนสุดรอบ)
        return { phase: 1, minDays: 1, maxAdvanceStart: null };
    }

    if (day === 3) {
        // ช่วงที่ 2: พุธ — ต่อต้องอย่างน้อย 3 วันติดกัน
        return { phase: 2, minDays: 3, maxAdvanceStart: null };
    }

    // ช่วงที่ 3: พฤหัสบดีเป็นต้นไป — ต่อกี่วันก็ได้ แต่ขอล่วงหน้าได้แค่ 1 วันก่อนวันขาย
    return { phase: 3, minDays: 1, maxAdvanceStart: addDays(today, 1) };
}

router.get('/booking-stall/extend', isAuthenticated, async (req, res) => {
    const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { sellerProfile: true } });

    // ร้านที่แอดมิน Blacklist จากคะแนนตรวจตลาด ต่อล็อกไม่ได้ (ดู controllers/scoreReportController.js)
    if (userRecord?.isBlacklisted) {
        return res.redirect('/booking-status?error=blacklisted');
    }

    const active = await findActiveLockForExtension(userRecord);

    if (!active) {
        return res.redirect('/booking-status?error=no_active_lock_to_extend');
    }

    const extendPhase = getExtendPhase(new Date());
    const extendStartDate = addDays(toStartOfDay(active.currentBooking.rentalEndDate), 1);
    const extendAllowedToday = !extendPhase.maxAdvanceStart || extendStartDate.getTime() <= extendPhase.maxAdvanceStart.getTime();

    res.render('seller/extendLock', {
        user: userRecord,
        activeLock: active.currentBooking,
        request: active.latestRequest,
        roundMeta: active.roundMeta,
        extendPhase,
        extendAllowedToday,
        error: req.query.error || null
    });
});

router.post('/booking-stall/extend', isAuthenticated, async (req, res) => {
    try {
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { shop: true, sellerProfile: true } });

        // ร้านที่แอดมิน Blacklist จากคะแนนตรวจตลาด ต่อล็อกไม่ได้ (ดู controllers/scoreReportController.js)
        if (userRecord?.isBlacklisted) {
            return res.redirect('/booking-status?error=blacklisted');
        }

        const active = await findActiveLockForExtension(userRecord);

        if (!active) {
            return res.redirect('/booking-status?error=no_active_lock_to_extend');
        }

        const { latestRequest, currentBooking, roundMeta } = active;
        const newEndDate = toStartOfDay(req.body.newEndDate);
        const cycleEnd = toStartOfDay(roundMeta.cycleEnd);
        const currentEndDate = toStartOfDay(currentBooking.rentalEndDate);

        if (!newEndDate || newEndDate <= currentEndDate || newEndDate > cycleEnd) {
            return res.redirect('/booking-stall/extend?error=invalid_extend_date');
        }

        const extendStartDate = addDays(currentEndDate, 1);
        const rentalDays = getRentalDays(extendStartDate, newEndDate);

        const today = toStartOfDay(new Date());
        const extendPhase = getExtendPhase(today);

        if (rentalDays < extendPhase.minDays) {
            return res.redirect('/booking-stall/extend?error=extend_min_days');
        }
        if (extendPhase.maxAdvanceStart && extendStartDate.getTime() > extendPhase.maxAdvanceStart.getTime()) {
            return res.redirect('/booking-stall/extend?error=too_early_to_extend');
        }
        const rentTotal = currentBooking.dailyStallPrice * currentBooking.stallCount * rentalDays;
        const applianceTotal = (currentBooking.smallApplianceCount * currentBooking.smallAppliancePrice
            + currentBooking.largeApplianceCount * currentBooking.largeAppliancePrice) * rentalDays;
        const lightTotal = currentBooking.lightUnitPrice * currentBooking.stallCount * rentalDays;
        const grandTotal = rentTotal + applianceTotal + lightTotal;

        const availableSlots = await prisma.slot.findMany({
            where: { zone: latestRequest.zone, isAvailable: true },
            orderBy: { id: 'asc' },
            take: currentBooking.stallCount
        });

        await prisma.$transaction(async (tx) => {
            const detailForRequest = `ขอต่อล็อก ${latestRequest.assignedStallCode || ''} ถึงวันที่ ${newEndDate.toLocaleDateString('th-TH')}`.trim();

            const extendRequestRecord = await tx.bookingRequest.create({
                data: {
                    productName: latestRequest.productName,
                    description: `[EXTEND_OF:${latestRequest.id}] ${detailForRequest}`,
                    sellerName: userRecord?.name || req.user.username || 'ไม่ระบุ',
                    phone: userRecord?.phoneNumber || '-',
                    zone: latestRequest.zone,
                    productImage: latestRequest.productImage || null,
                    sellerId: userRecord?.sellerProfile?.id || null,
                    status: 'PENDING'
                }
            });

            const requestTag = buildBookingRequestTag(extendRequestRecord.id);
            const snapshotWithRequestRef = `${requestTag} ${detailForRequest}`.trim();

            const slotsToUse = [...availableSlots];
            const shortfall = currentBooking.stallCount - slotsToUse.length;
            for (let i = 0; i < shortfall; i += 1) {
                const newSlot = await tx.slot.create({
                    data: {
                        slotNumber: `${latestRequest.zone}-EXT${extendRequestRecord.id}-${i + 1}`,
                        zone: latestRequest.zone,
                        price: currentBooking.dailyStallPrice,
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
                        zoneCode: latestRequest.zone,
                        selectedZoneLabel: `โซน ${latestRequest.zone}`,
                        stallCount: currentBooking.stallCount,
                        rentalStartDate: extendStartDate,
                        rentalEndDate: newEndDate,
                        rentalDays,
                        dailyStallPrice: currentBooking.dailyStallPrice,
                        lightEnabled: currentBooking.lightEnabled,
                        lightUnitPrice: currentBooking.lightUnitPrice,
                        smallApplianceCount: currentBooking.smallApplianceCount,
                        largeApplianceCount: currentBooking.largeApplianceCount,
                        smallAppliancePrice: currentBooking.smallAppliancePrice,
                        largeAppliancePrice: currentBooking.largeAppliancePrice,
                        applianceTotal,
                        lightTotal,
                        rentTotal,
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

        return res.redirect('/booking-status?success=extend_requested');
    } catch (error) {
        console.error('booking-stall extend POST error', error);
        return res.redirect('/booking-stall/extend?error=extend_failed');
    }
});

// รวม logic การหาคำขอ/รายการจองล่าสุดของผู้ขาย ให้ /booking-status และ /notifications
// ใช้สถานะเดียวกัน (อิง BookingRequest.status เป็นหลัก ไม่ใช่ Booking.status แบบเดิม
// ซึ่งไม่มีสถานะ IN_PROGRESS/SUCCESS ตามความหมายใหม่)
async function loadSellerBookingStatus(userId) {
    const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        include: { sellerProfile: true, shop: true }
    });

    const sellerProfileId = userRecord?.sellerProfile?.id || null;
    const sellerName = String(userRecord?.name || '').trim();

    // เอารายการคำขอล่าสุดของผู้ขายรายนี้เสมอ (ไม่ว่าจะอยู่สถานะไหน) เพื่อให้สะท้อน
    // ความคืบหน้าจริงล่าสุด ไม่ใช่แค่รายการที่เคยผ่านสถานะใดสถานะหนึ่งมาก่อน
    let latestRequest = null;

    if (sellerProfileId) {
        latestRequest = await prisma.bookingRequest.findFirst({
            where: { sellerId: sellerProfileId },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!latestRequest && sellerName) {
        latestRequest = await prisma.bookingRequest.findFirst({
            where: { sellerName },
            orderBy: { createdAt: 'desc' }
        });
    }

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

    let bookingView = buildBookingView(latestBooking);

    if (!bookingView && latestRequest) {
        bookingView = {
            id: latestRequest.id,
            status: String(latestRequest.status || 'PENDING').toUpperCase(),
            statusText: getBookingStatusText(String(latestRequest.status || 'PENDING').toUpperCase(), awaitingPaymentVerification),
            stage: getBookingStep(String(latestRequest.status || 'PENDING').toUpperCase()),
            roundNumber: getBookingRoundMetaForDate(latestRequest.createdAt).roundNumber,
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
            storeDetailSnapshot: stripBookingRequestTag(latestRequest.description) || '-',
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
        bookingView.paymentSlipImage = latestRequest.paymentSlipImage || null;
        bookingView.awaitingPaymentVerification = awaitingPaymentVerification;
        // ผลตรวจสลิปอัตโนมัติ (SlipOK) ที่เก็บไว้ตอนอัปโหลด — null = ยังไม่ตรวจ/ไม่ได้ตั้งค่า SlipOK
        bookingView.slipVerified = typeof latestRequest.slipVerified === 'boolean' ? latestRequest.slipVerified : null;
        bookingView.slipVerifyReason = latestRequest.slipVerifyReason || null;
        // ราคาที่แสดงระหว่างรอตรวจสอบ/รอจัดล็อก เป็นแค่ราคาประมาณการ (ราคาต่ำสุดของโซน) —
        // ราคาจริงต้องรอแอดมินจัดล็อกก่อน (ดู confirmBookingStall ที่คำนวณราคาจริงใหม่)
        bookingView.isFinalPrice = Boolean(latestRequest.assignedStallCode);

        // สร้าง QR พร้อมเพย์ให้จ่ายได้เลย เฉพาะตอนที่รู้ราคาจริงแล้วและยังไม่ได้ส่งสลิป
        // (จัดล็อกแล้ว รอชำระเงิน — ตรงกับตอนที่หน้า booking_status โชว์ช่องอัปโหลดสลิป)
        if (normalizedRequestStatus === 'IN_PROGRESS' && bookingView.isFinalPrice && !awaitingPaymentVerification) {
            bookingView.promptPayId = PROMPTPAY_ID;
            bookingView.promptPayQr = await buildPromptPayQrDataUrl(bookingView.grandTotal);
        }
    }

    const notificationBooking = latestRequest
        ? {
            ...(latestBooking || {}),
            status: String(latestRequest.status || 'PENDING').toUpperCase(),
            zoneCode: latestRequest.zone || latestBooking?.zoneCode || '',
            createdAt: latestRequest.createdAt || latestBooking?.createdAt,
            paymentConfirmedAt: latestRequest.paymentConfirmedAt || null,
            paymentSlipImage: latestRequest.paymentSlipImage || null,
            slipVerifyReason: latestRequest.slipVerifyReason || null,
            slot: { slotNumber: latestRequest.paymentConfirmedAt ? (latestRequest.assignedStallCode || null) : null }
        }
        : latestBooking;

    const extendInfo = await findActiveLockForExtension(userRecord);

    const repairReports = await prisma.maintenanceReport.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' }
    });

    return {
        userRecord,
        bookingView,
        notifications: [
            ...buildRepairNotifications(repairReports),
            ...buildBookingNotifications(notificationBooking, awaitingPaymentVerification, extendInfo)
        ]
    };
}

// --- 4. หน้าสถานะการจอง ---
router.get('/booking-status', isAuthenticated, async (req, res) => {
    const { userRecord, bookingView, notifications } = await loadSellerBookingStatus(req.user.id);
    const activeLockForExtension = userRecord ? await findActiveLockForExtension(userRecord) : null;

    return res.render('seller/booking_status', {
        user: userRecord || req.user,
        booking: bookingView,
        notifications,
        canExtendLock: Boolean(activeLockForExtension),
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// --- 5. ผู้ขายอัปโหลดสลิปยืนยันการชำระเงิน หลังแอดมินจัดล็อกให้แล้ว ---
router.post('/booking-payment/confirm', isSellerOrApplicant, (req, res) => {
    uploadPaymentSlip.single('paymentSlip')(req, res, async (err) => {
        if (err) {
            return res.redirect('/booking-status?error=upload_failed');
        }

        try {
            if (!req.file) {
                return res.redirect('/booking-status?error=missing_slip');
            }

            const userRecord = await prisma.user.findUnique({
                where: { id: req.user.id },
                include: { sellerProfile: true }
            });

            const sellerProfileId = userRecord?.sellerProfile?.id || null;
            const sellerName = String(userRecord?.name || '').trim();

            let latestRequest = null;
            if (sellerProfileId) {
                latestRequest = await prisma.bookingRequest.findFirst({
                    where: { sellerId: sellerProfileId },
                    orderBy: { createdAt: 'desc' }
                });
            }
            if (!latestRequest && sellerName) {
                latestRequest = await prisma.bookingRequest.findFirst({
                    where: { sellerName },
                    orderBy: { createdAt: 'desc' }
                });
            }

            if (!latestRequest || String(latestRequest.status || '').toUpperCase() !== 'IN_PROGRESS') {
                return res.redirect('/booking-status?error=not_awaiting_payment');
            }

            if (latestRequest.paymentSlipImage) {
                return res.redirect('/booking-status?error=slip_already_uploaded');
            }

            const slipPath = `/uploads/payment-slips/${req.file.filename}`;

            // ตรวจสลิปอัตโนมัติทันทีตอนอัปโหลด (ถ้าตั้งค่า SlipOK ไว้) แล้วเก็บผลไว้ในฐานข้อมูล
            // เพื่อโชว์ให้ทั้งผู้ขายและแอดมินเห็นทันที และแอดมินจะได้ไม่ต้องยิง API ซ้ำตอนกดยืนยัน
            const requestTag = buildBookingRequestTag(latestRequest.id);
            const linkedBooking = requestTag
                ? await prisma.booking.findFirst({ where: { storeDetailSnapshot: { startsWith: requestTag } } })
                : null;
            const verifyResult = await verifySlip(slipPath, linkedBooking ? Number(linkedBooking.grandTotal || 0) : null);

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

            return res.redirect('/booking-status?success=slip_uploaded');
        } catch (error) {
            console.error('booking-payment confirm error', error);
            return res.redirect('/booking-status?error=payment_confirm_failed');
        }
    });
});

router.get('/notifications', isAuthenticated, async (req, res) => {
    const { userRecord, bookingView, notifications } = await loadSellerBookingStatus(req.user.id);

    return res.render('partials/notification', {
        user: userRecord || req.user,
        booking: bookingView,
        notifications
    });
});

router.get('/receipts/:requestId', isAuthenticated, async (req, res) => {
    try {
        const receipt = await buildReceiptData(req.params.requestId, req.user?.name);
        if (!receipt || receipt.ownerUserId !== req.user.id) {
            return res.redirect('/booking-status?error=receipt_not_found');
        }
        return res.render('seller/receipt', { receipt, error: null });
    } catch (err) {
        return res.status(500).render('seller/receipt', { error: 'เกิดข้อผิดพลาดในการโหลดใบเสร็จ', receipt: null });
    }
});

module.exports = router;