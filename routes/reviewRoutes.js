// รีวิวร้านค้า — อ่านได้ทุกคน (การ์ดร้านบนผังตลาดเปิดได้โดยไม่ต้อง login) เขียนได้เฉพาะสมาชิกที่ล็อกอินแล้ว
// ดู controllers/shopReviewController.js และ utils/shopReviews.js
const express = require('express');
const { shopReviewLimiter } = require('../middlewares/authRateLimit');
const reviewCtrl = require('../controllers/shopReviewController');

const router = express.Router();

router.get('/shop-reviews/:code', reviewCtrl.listForStall);
router.post('/shop-reviews/:code', shopReviewLimiter, reviewCtrl.saveForStall);
router.post('/shop-reviews/:code/delete', reviewCtrl.deleteForStall);

// เจ้าของร้านตอบ/รายงานรีวิว (หน้าร้านค้าของฉัน)
router.post('/my-shop/reviews/:id/reply', reviewCtrl.reply);
router.post('/my-shop/reviews/:id/report', reviewCtrl.report);

module.exports = router;
