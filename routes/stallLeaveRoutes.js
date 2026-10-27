// ลาหยุด / ปล่อยเช่าช่วงแผง ฝั่งร้าน (ดู controllers/stallLeaveController.js) — หน้าแอดมินอยู่ใน routes/adminRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { createImageStorage } = require('../utils/imageStorage');
const { GUEST_MAX_IMAGES } = require('../utils/stallLeave');
const stallLeaveCtrl = require('../controllers/stallLeaveController');

const router = express.Router();

// กันการไล่ค้นข้อมูลสมาชิก: 30 ครั้ง/นาที ต่อผู้ใช้
const memberSearchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => `member-search:${req.user.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'ค้นหาบ่อยเกินไป รอสักครู่แล้วลองใหม่' }
});

// คนนอกส่งข้อมูลผ่านลิงก์: 10 ครั้ง/15 นาที ต่อ IP
const guestSubmitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'ส่งข้อมูลบ่อยเกินไป รอสักครู่แล้วลองใหม่'
});

// รูปสินค้าของคนนอกที่มาเช่าช่วง — เงื่อนไขไฟล์เดียวกับรูปสลิป/รูปร้าน
const uploadGuestImages = multer({
    storage: createImageStorage({ folder: 'sublets' }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
    },
    limits: { fileSize: 5 * 1024 * 1024, files: GUEST_MAX_IMAGES }
});

function handleGuestUpload(req, res, next) {
    uploadGuestImages.array('productImages', GUEST_MAX_IMAGES)(req, res, (err) => {
        if (!err) return next();
        return res.redirect(`/sublet/guest/${encodeURIComponent(req.params.token)}?error=upload_failed`);
    });
}

// เฉพาะผู้ขายที่อนุมัติแล้ว (เหมือน isSellerOnly ใน routes/sellerRoute.js)
function isSellerOnly(req, res, next) {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    if (req.user.role !== 'SELLER') return res.redirect('/shop-application?error=sellers_only');
    return next();
}

router.get('/stall-leave', isSellerOnly, stallLeaveCtrl.getMyRequests);
router.get('/stall-leave/new', isSellerOnly, stallLeaveCtrl.getForm);
router.post('/stall-leave', isSellerOnly, stallLeaveCtrl.submitForm);
router.post('/stall-leave/:id/cancel', isSellerOnly, stallLeaveCtrl.cancel);
// ร้านผู้รับเช่าช่วง (สมาชิก) ตอบรับ/ปฏิเสธ
router.post('/stall-leave/:id/respond', isSellerOnly, stallLeaveCtrl.respond);

// ค้นร้านสมาชิกสำหรับฟอร์มเช่าช่วง — ตอบ JSON (ไม่ได้ล็อกอิน/ไม่ใช่ผู้ขาย = 401)
router.get('/api/market-members/search', (req, res, next) => {
    if (!req.user || req.user.role !== 'SELLER') return res.status(401).json({ success: false, message: 'เฉพาะผู้ขาย' });
    return next();
}, memberSearchLimiter, stallLeaveCtrl.searchMembers);

// คนนอก (ไม่ใช่สมาชิก) กรอกข้อมูลรับเช่าช่วงเอง — ไม่ต้อง login
router.get('/sublet/guest/:token', stallLeaveCtrl.getGuestPage);
router.post('/sublet/guest/:token', guestSubmitLimiter, handleGuestUpload, stallLeaveCtrl.submitGuest);

module.exports = router;
