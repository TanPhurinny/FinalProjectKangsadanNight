const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { isStaffOrAdmin, isAdminOnly } = require('../middlewares/auth');

// --- 1. Import Controllers ---
const userCtrl = require('../controllers/userController');
const approvalCtrl = require('../controllers/approvalController');
const requestCtrl = require('../controllers/requestController');
const marketCtrl = require('../controllers/marketController');
const announceCtrl = require('../controllers/announcementController');
const scoreReportCtrl = require('../controllers/scoreReportController');
const bannerCtrl = require('../controllers/communityBannerController');

// --- 2. การตั้งค่า Multer สำหรับอัปโหลดรูปประกาศ ---
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'announcements');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'ann-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'));
        }
    }
});

// --- 2.1 การตั้งค่า Multer สำหรับอัปโหลดรูปแบนเนอร์คอมมูนิตี้ ---
const bannerUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'community-banners');
if (!fs.existsSync(bannerUploadDir)) {
    fs.mkdirSync(bannerUploadDir, { recursive: true });
}

const bannerStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, bannerUploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'banner-' + Date.now() + path.extname(file.originalname));
    }
});

const uploadBanner = multer({
    storage: bannerStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'));
        }
    }
});

// --- 3. Middleware ตรวจสอบสิทธิ์ ---
router.use(isStaffOrAdmin);

// --- 4. Market & Dashboard ---
router.get('/dashboard', marketCtrl.getDashboardPage);
router.get('/slots', marketCtrl.getSlotsPage);

// --- 5. Announcements (จัดการประกาศ) ---
// ดึงข้อมูลหน้าประกาศ
router.get('/announcements', announceCtrl.getAdminAnnouncements);

// สร้างประกาศใหม่ (POST /admin/announcements)
router.post('/announcements', upload.single('image'), announceCtrl.createAnnouncement);

// แก้ไขประกาศ (เพิ่ม Route นี้เข้าไป!)
router.post('/announcements/:id/update', upload.single('image'), announceCtrl.updateAnnouncement);

// ลบประกาศ (แก้ไขจากเดิมที่อาจจะส่ง ID ผิด)
router.post('/announcements/:id/delete', announceCtrl.deleteAnnouncement);

// --- 5.1 Community Banners (จัดการแบนเนอร์วิ่งหน้าคอมมูนิตี้) ---
router.get('/community-banners', bannerCtrl.getAdminBanners);
router.post('/community-banners', uploadBanner.single('image'), bannerCtrl.createBanner);
router.post('/community-banners/:id/toggle', bannerCtrl.toggleBannerActive);
router.post('/community-banners/:id/move/:direction', bannerCtrl.moveBanner);
router.post('/community-banners/:id/delete', bannerCtrl.deleteBanner);

// --- 6. User Management (เฉพาะ Admin) ---
router.get('/users', isAdminOnly, userCtrl.getUsersPage);
router.post('/users/update-role', isAdminOnly, userCtrl.updateRole);
router.get('/users/delete/:id', isAdminOnly, userCtrl.deleteUser);

// --- 6.1 คะแนนร้านค้าจากการตรวจตลาด + Blacklist (เฉพาะ Admin) ---
router.get('/sellers/scores', isAdminOnly, scoreReportCtrl.getSellerScoresPage);
router.post('/sellers/blacklist', isAdminOnly, scoreReportCtrl.toggleBlacklist);

// --- 7. Approvals & Requests ---
router.get('/approvals', approvalCtrl.getApprovalsPage);
router.post('/approvals/confirm', approvalCtrl.confirmApproval);
router.post('/approvals/confirm-payment', approvalCtrl.confirmPayment);
router.post('/approvals/reject-slip', approvalCtrl.rejectPaymentSlip);
router.get('/requests', requestCtrl.getRequestsPage);
router.post('/requests/update-status', requestCtrl.updateStatus);

// --- 8. Booking Management (แก้ไข Path ไฟล์ EJS) ---

// หน้าสำหรับแอดมินดูรายการจองรวม (ใช้ไฟล์ booking.ejs)
router.get("/admin-booking", async (req, res) => {
    if (!req.user) return res.redirect("/login");
    
    if (req.user.role !== "ADMIN") {
        return res.status(403).send("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้");
    }

    // ชี้ไปที่ views/admin/booking.ejs
    res.render("admin/booking", {
        user: req.user
    });
});

// หน้าสำหรับดูรายละเอียด/โปรเกรสการจอง (ใช้ไฟล์ booking_stall.ejs)
router.get('/booking-stall', approvalCtrl.getBookingStallPage);
router.post('/booking-stall/confirm', approvalCtrl.confirmBookingStall);
router.post('/booking-stall/reject', approvalCtrl.rejectBookingStall);

module.exports = router;