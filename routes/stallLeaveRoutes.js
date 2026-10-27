// ลาหยุด / ปล่อยเช่าช่วงแผง ฝั่งร้าน (ดู controllers/stallLeaveController.js) — หน้าแอดมินอยู่ใน routes/adminRoutes.js
const express = require('express');
const stallLeaveCtrl = require('../controllers/stallLeaveController');

const router = express.Router();

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

module.exports = router;
