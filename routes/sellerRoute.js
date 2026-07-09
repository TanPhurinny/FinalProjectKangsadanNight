const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Middleware ตรวจสอบการ Login
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
};

// --- 1. หน้าแจ้งซ่อม ---
router.get("/repair", isAuthenticated, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.session.user.id }
    });
    res.render("seller/repair", {
        user: user,
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
            const { location, category, description } = req.body;
            
            // ตรวจสอบความสมบูรณ์ของข้อมูล
            if (!location || !category || !description) {
                return res.redirect("/repair?error=missing_fields");
            }

            const imagePath = req.file ? `/uploads/repairs/${req.file.filename}` : null;

            await prisma.maintenanceReport.create({
                data: {
                    location,
                    category,
                    description,
                    image: imagePath,
                    userId: req.session.user.id
                }
            });
            res.redirect("/repair?success=true");
        } catch (error) {
            console.error("Repair Error:", error);
            res.redirect("/repair?error=db_error");
        }
    });
});

// --- 2. หน้าเลือกโซน/แผงค้า (แก้ไขชื่อไฟล์ที่นี่) ---
const zoneAccess = require('../utils/zoneAccess');

router.get("/select-zone", isAuthenticated, async (req, res) => {
    // เฉพาะผู้ขายเท่านั้นที่เข้าถึงหน้าจอนี้ได้
    if (!req.session.user || req.session.user.role !== 'SELLER') {
        return res.status(403).render('index', { user: req.session.user, error: 'เฉพาะผู้ขายเท่านั้นที่เข้าถึงหน้านี้ได้' });
    }

    try {
        // ดึงข้อมูลผู้ขายจากฐานข้อมูล (รวมถึง shop.productType)
        const userRecord = await prisma.user.findUnique({
            where: { id: req.session.user.id },
            include: { shop: true }
        });

        const productType = userRecord?.shop?.productType || null;
        const allowedZones = zoneAccess.allowedZonesFor(productType);

        res.render("seller/select_zone", {
            user: req.session.user,
            productType,
            allowedZones
        });
    } catch (err) {
        console.error('select-zone error', err);
        res.render("seller/select_zone", {
            user: req.session.user,
            productType: null,
            allowedZones: ['a']
        });
    }
});

// --- 3. หน้าจองแผงค้า ---
router.get("/booking-stall", isAuthenticated, async (req, res) => {
    const { zone, type, size, oldPrice, newPrice } = req.query;
    // ดึงข้อมูลผู้ขายเพื่อตรวจสอบว่าโซนที่ขออนุญาตหรือไม่
    const userRecord = await prisma.user.findUnique({ where: { id: req.session.user.id }, include: { shop: true } });
    const productType = userRecord?.shop?.productType || null;
    const allowedZones = zoneAccess.allowedZonesFor(productType).map(z => String(z).toLowerCase());

    if (zone && allowedZones.length && !allowedZones.includes(String(zone).toLowerCase())) {
        // ป้องกันการเข้าถึงหน้าเลือกแถวสำหรับโซนที่ผู้ขายไม่มีสิทธิ
        return res.status(403).render('seller/booking_stall', {
            user: userRecord,
            zone: null,
            type: type || null,
            size: size || null,
            oldPrice: oldPrice || null,
            newPrice: newPrice || null,
            error: 'คุณไม่มีสิทธิ์จองโซนนี้ตามประเภทสินค้าของคุณ'
        });
    }

    res.render("seller/booking_stall", { 
        user: userRecord,
        zone: zone || null,
        type: type || null,
        size: size || null,
        oldPrice: oldPrice || null,
        newPrice: newPrice || null
    });
});

// --- 4. หน้าสถานะการจอง ---
router.get("/booking-status", isAuthenticated, (req, res) => {
    res.render("seller/booking_status", {
        user: req.session.user
    });
});

module.exports = router;