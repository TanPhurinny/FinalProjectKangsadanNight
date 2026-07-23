const express = require('express');
const router = express.Router();
const prisma = require('../config/prismaClient');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAnnouncementsForUser } = require('../controllers/announcementController');
const { repairReportSchema, bookingStallInputSchema } = require('../utils/validationSchemas');

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
const BOOKING_REQUEST_TAG_PREFIX = '[BOOKING_REQUEST_ID:';

function resolveCornerZonePrice(rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    return CORNER_ZONE_VALID_PRICES.includes(parsed) ? parsed : 0;
}

function buildBookingRequestTag(requestId) {
    const parsed = Number.parseInt(requestId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return '';
    return `${BOOKING_REQUEST_TAG_PREFIX}${parsed}]`;
}

function stripBookingRequestTag(snapshotText) {
    return String(snapshotText || '').replace(/^\[BOOKING_REQUEST_ID:\d+\]\s*/i, '').trim();
}

function toStartOfDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function getRentalDays(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const diffMs = endDate.getTime() - startDate.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor(diffMs / dayMs);
    return Math.max(1, diffDays + 1);
}

function safeInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadZoneDetailsMap() {
    const zones = await prisma.zone.findMany({
        include: {
            rows: {
                select: {
                    price: true,
                    size: true
                }
            }
        }
    });

    const map = {};
    for (const zone of zones) {
        const zoneCode = String(zone.code || '').toLowerCase();
        if (!zoneCode) continue;

        const rowPrices = zone.rows.map((row) => Number(row.price || 0)).filter((price) => Number.isFinite(price));
        const minPrice = rowPrices.length ? Math.min(...rowPrices) : 0;
        const size = zone.rows.find((row) => row.size)?.size || zone.size || '-';

        map[zoneCode] = {
            label: `โซน ${zone.code}`,
            description: zone.description || `พื้นที่ขายสำหรับโซน ${zone.code}`,
            size,
            dailyPrice: minPrice,
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
                select: { price: true }
            }
        }
    });

    if (zone && zone.rows.length) {
        const rowPrices = zone.rows
            .map((row) => Number(row.price || 0))
            .filter((price) => Number.isFinite(price) && price >= 0);

        if (rowPrices.length) {
            return Math.min(...rowPrices);
        }
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

    return {
        id: latestBooking.id,
        status: latestBooking.status,
        statusText: getBookingStatusText(latestBooking.status),
        stage: getBookingStep(latestBooking.status),
        zoneLabel,
        slotLabel: latestBooking.slot?.slotNumber || '-',
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
        storeDetailSnapshot: stripBookingRequestTag(latestBooking.storeDetailSnapshot) || '-'
    };
}

function buildBookingNotifications(latestBooking, awaitingPaymentVerification) {
    if (!latestBooking) {
        return [
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

    const statusText = getBookingStatusText(latestBooking.status, awaitingPaymentVerification);
    const stallLabel = latestBooking.slot?.slotNumber || '-';
    const timeline = [
        {
            id: 1,
            type: 'pending-review',
            title: 'รอการตรวจสอบรายการจอง',
            desc: `ระบบได้รับรายการจองโซน ${latestBooking.zoneCode || '-'} แล้ว`,
            date: formatDateThai(latestBooking.createdAt),
            time: formatTimeThai(latestBooking.createdAt),
            status: 'PENDING'
        },
        {
            id: 2,
            type: 'pending-payment',
            title: awaitingPaymentVerification
                ? `ส่งสลิปโอนเงินสำหรับล็อก ${stallLabel} แล้ว`
                : (latestBooking.status === 'IN_PROGRESS' ? `ได้รับล็อก ${stallLabel} แล้ว` : 'ชำระเงินค่าจอง'),
            desc: awaitingPaymentVerification
                ? `แอดมินกำลังตรวจสอบสลิปโอนเงินของคุณ เมื่อยืนยันแล้วระบบจะแจ้งเตือนว่าล็อก ${stallLabel} เป็นของคุณอย่างเป็นทางการ`
                : (latestBooking.status === 'IN_PROGRESS'
                    ? `คุณได้รับล็อก ${stallLabel} กรุณาอัปโหลดสลิปโอนเงินที่หน้าสถานะการจองเพื่อยืนยัน`
                    : `สถานะล่าสุด: ${statusText} | ล็อกที่จัด: ${stallLabel}`),
            date: formatDateThai(latestBooking.createdAt),
            time: formatTimeThai(latestBooking.createdAt),
            status: 'IN_PROGRESS'
        },
        {
            id: 3,
            type: 'success-payment',
            title: 'เสร็จสิ้นการจอง',
            desc: 'รายการจองถูกปิดงานเรียบร้อยแล้ว',
            date: formatDateThai(latestBooking.createdAt),
            time: formatTimeThai(latestBooking.createdAt),
            status: 'SUCCESS'
        }
    ];

    const stage = getBookingStep(latestBooking.status);
    return timeline.map((item, index) => ({
        ...item,
        isRead: index < stage,
        isNew: index + 1 === stage
    }));
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
        return res.status(403).render('index', {
            user: req.user,
            announcements: [],
            error: 'เฉพาะผู้ขายเท่านั้นที่เข้าถึงหน้านี้ได้'
        });
    }

    next();
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

    return res.render('seller/indexseller', {
        user,
        dashboard: buildSellerDashboard(user, activeBookingCount, latestBooking, latestRepairReport, latestAnnouncement)
    });
});

// เส้นทาง community ถูกแยกไปจัดการที่ routes/communityRoutes.js แล้ว

// --- 1. หน้าแจ้งซ่อม ---
router.get("/repair", isAuthenticated, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id }
    });
    const reports = await prisma.maintenanceReport.findMany({
        where: { userId: req.user.id },
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

router.get("/select-zone", isAuthenticated, async (req, res) => {
    // เฉพาะผู้ขายเท่านั้นที่เข้าถึงหน้านี้ได้
    if (!req.user || req.user.role !== 'SELLER') {
        return res.status(403).render('index', { user: req.user, error: 'เฉพาะผู้ขายเท่านั้นที่เข้าถึงหน้านี้ได้' });
    }

    try {
        // ดึงข้อมูลผู้ขายจากฐานข้อมูล (รวมถึง shop.productType)
        const userRecord = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { shop: true }
        });

        const productType = userRecord?.shop?.productType || null;
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
router.get("/booking-stall", isAuthenticated, async (req, res) => {
    const { zone, corner } = req.query;
    const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { shop: true } });
    const productType = userRecord?.shop?.productType || null;
    const allowedZones = zoneAccess.allowedZonesFor(productType).map(z => String(z).toLowerCase());
    const zoneCode = String(zone || '').toUpperCase();
    const normalizedZone = zoneCode.toLowerCase();
    const cornerZoneValue = resolveCornerZonePrice(corner);

    const defaultStoreDetail = userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || '';

    if (!zoneCode) {
        return res.status(400).render('seller/booking_stall', {
            user: userRecord,
            zone: null,
            zonePrice: 0,
            error: 'กรุณาเลือกโซนจากหน้าเลือกโซนก่อนทำรายการจอง',
            defaultStoreDetail,
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
        cornerZoneValue,
        pricing: {
            lightUnitPrice: LIGHT_UNIT_PRICE,
            smallAppliancePrice: SMALL_APPLIANCE_PRICE,
            largeAppliancePrice: LARGE_APPLIANCE_PRICE,
            cornerZoneOptions: CORNER_ZONE_OPTIONS
        }
    });
});

router.post('/booking-stall', isSellerOnly, async (req, res) => {
    try {
        const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, include: { shop: true, sellerProfile: true } });
        const productType = userRecord?.shop?.productType || null;
        const allowedZones = zoneAccess.allowedZonesFor(productType).map(z => String(z).toLowerCase());

        const zoneCode = String(req.body.zone || '').trim().toUpperCase();
        const normalizedZone = zoneCode.toLowerCase();

        if (!zoneCode) {
            return res.status(400).render('seller/booking_stall', {
                user: userRecord,
                zone: null,
                zonePrice: 0,
                error: 'ไม่พบโซนที่ต้องการจอง',
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || '',
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
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || '',
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
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || '',
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
                defaultStoreDetail: req.body.storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || '',
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
        const lightEnabled = String(req.body.light || 'no') === 'yes';
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
                defaultStoreDetail: storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || '',
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
        const rentTotal = zonePrice * stallCount * rentalDays;
        const applianceTotal = (smallApplianceCount * SMALL_APPLIANCE_PRICE + largeApplianceCount * LARGE_APPLIANCE_PRICE) * rentalDays;
        const lightTotal = lightEnabled ? LIGHT_UNIT_PRICE * stallCount * rentalDays : 0;
        const cornerZoneTotal = cornerZoneValue * stallCount * rentalDays;
        const grandTotal = rentTotal + applianceTotal + lightTotal + cornerZoneTotal;

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
                storeDetail || userRecord?.shop?.productDetail || userRecord?.shop?.shopSummary || 'ไม่มีรายละเอียดเพิ่มเติม',
                cornerZoneOption ? `[สนใจแผงพิเศษ: ${cornerZoneOption.label} +${cornerZoneOption.value} บาท/ล็อก/วัน]` : ''
            ].filter(Boolean).join(' ').trim();

            const bookingRequestRecord = await tx.bookingRequest.create({
                data: {
                    productName: userRecord?.shop?.shopName || `ร้านของ ${userRecord?.name || req.user.username || 'ผู้ขาย'}`,
                    description: detailForRequest,
                    sellerName: userRecord?.name || req.user.username || 'ไม่ระบุ',
                    phone: userRecord?.phoneNumber || '-',
                    zone: zoneCode,
                    productImage: userRecord?.shop?.productImage || null,
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
            zoneLabel: latestRequest.zone ? `โซน ${latestRequest.zone}` : '-',
            slotLabel: latestRequest.assignedStallCode || '-',
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
            storeDetailSnapshot: stripBookingRequestTag(latestRequest.description) || '-'
        };
    }

    if (bookingView && latestRequest) {
        const normalizedRequestStatus = String(latestRequest.status || 'PENDING').toUpperCase();
        bookingView.status = normalizedRequestStatus;
        bookingView.statusText = getBookingStatusText(normalizedRequestStatus, awaitingPaymentVerification);
        bookingView.stage = getBookingStep(normalizedRequestStatus);
        bookingView.zoneLabel = latestRequest.zone ? `โซน ${latestRequest.zone}` : bookingView.zoneLabel;
        bookingView.slotLabel = latestRequest.assignedStallCode || bookingView.slotLabel || '-';
        bookingView.paymentSlipImage = latestRequest.paymentSlipImage || null;
        bookingView.awaitingPaymentVerification = awaitingPaymentVerification;
    }

    const notificationBooking = latestRequest
        ? {
            ...(latestBooking || {}),
            status: String(latestRequest.status || 'PENDING').toUpperCase(),
            zoneCode: latestRequest.zone || latestBooking?.zoneCode || '',
            createdAt: latestRequest.createdAt || latestBooking?.createdAt,
            slot: { slotNumber: latestRequest.assignedStallCode || latestBooking?.slot?.slotNumber || '-' }
        }
        : latestBooking;

    return {
        userRecord,
        bookingView,
        notifications: buildBookingNotifications(notificationBooking, awaitingPaymentVerification)
    };
}

// --- 4. หน้าสถานะการจอง ---
router.get('/booking-status', isAuthenticated, async (req, res) => {
    const { userRecord, bookingView, notifications } = await loadSellerBookingStatus(req.user.id);

    return res.render('seller/booking_status', {
        user: userRecord || req.user,
        booking: bookingView,
        notifications,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// --- 5. ผู้ขายอัปโหลดสลิปยืนยันการชำระเงิน หลังแอดมินจัดล็อกให้แล้ว ---
router.post('/booking-payment/confirm', isSellerOnly, (req, res) => {
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

            // เก็บสลิปไว้รอแอดมินตรวจสอบก่อน ไม่เปลี่ยนสถานะเป็น SUCCESS ทันที
            // (แอดมินต้องกดยืนยันที่หน้า /admin/approvals ก่อน ระบบถึงจะแจ้งผู้ขายว่าล็อกเป็นของตนแล้ว)
            await prisma.bookingRequest.update({
                where: { id: latestRequest.id },
                data: {
                    paymentSlipImage: slipPath
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

module.exports = router;