// ลาหยุด / ปล่อยเช่าช่วงแผง ฝั่งร้าน (ดู controllers/stallLeaveController.js) — หน้าแอดมินอยู่ใน routes/adminRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
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

module.exports = router;
