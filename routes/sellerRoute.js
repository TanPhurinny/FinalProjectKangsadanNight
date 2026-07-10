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
    if (!req.user) {
        return res.redirect("/login");
    }
    next();
};

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

// --- 2. หน้าเลือกโซน/แผงค้า (แก้ไขชื่อไฟล์ที่นี่) ---
router.get("/select-zone", isAuthenticated, (req, res) => {
    // แก้ไขจาก "seller/select_stall" เป็น "seller/select_zone" ให้ตรงกับชื่อไฟล์ใหม่
    res.render("seller/select_zone", {
        user: req.user
    });
});

// --- 3. หน้าจองแผงค้า ---
router.get("/booking-stall", isAuthenticated, async (req, res) => {
    const { zone, type, size, oldPrice, newPrice } = req.query;
    const user = await prisma.user.findUnique({
        where: { id: req.user.id }
    });
    res.render("seller/booking_stall", { 
        user: user,
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
        user: req.user
    });
});

module.exports = router;