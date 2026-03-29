const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
        user: user
    });
});

// บันทึกแจ้งซ่อม (POST)
router.post("/repair", isAuthenticated, async (req, res) => {
    try {
        const { location, category, description } = req.body;
        await prisma.maintenanceReport.create({
            data: {
                location,
                category,
                description,
                userId: req.session.user.id
            }
        });
        res.redirect("/repair");
    } catch (error) {
        console.error("Repair Error:", error);
        res.status(500).send("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
});

// --- 2. หน้าเลือกโซน/แผงค้า (แก้ไขชื่อไฟล์ที่นี่) ---
router.get("/select-zone", isAuthenticated, (req, res) => {
    // แก้ไขจาก "seller/select_stall" เป็น "seller/select_zone" ให้ตรงกับชื่อไฟล์ใหม่
    res.render("seller/select_zone", {
        user: req.session.user
    });
});

// --- 3. หน้าจองแผงค้า ---
router.get("/booking-stall", isAuthenticated, async (req, res) => {
    const { zone, type, size, oldPrice, newPrice } = req.query;
    const user = await prisma.user.findUnique({
        where: { id: req.session.user.id }
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
        user: req.session.user
    });
});

module.exports = router;