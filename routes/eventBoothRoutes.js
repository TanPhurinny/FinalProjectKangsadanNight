// ขอจัดบูธกิจกรรม (โซน G) — เปิดให้ทุกคนใช้ได้โดยไม่ต้อง login (ดู controllers/eventBoothController.js)
const express = require('express');
const multer = require('multer');
const { createImageStorage } = require('../utils/imageStorage');
const { eventBoothLimiter } = require('../middlewares/authRateLimit');
const eventBoothCtrl = require('../controllers/eventBoothController');

const router = express.Router();

// สลิปโอนเงินค่าบูธกิจกรรม — เงื่อนไขไฟล์เดียวกับสลิปจองแผง (routes/sellerRoute.js)
const uploadEventSlip = multer({
    storage: createImageStorage({ folder: 'event-slips' }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('ประเภทไฟล์ไม่ถูกต้อง'), false);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

function handleSlipUpload(req, res, next) {
    uploadEventSlip.single('paymentSlip')(req, res, (err) => {
        if (!err) return next();
        const code = err.code === 'LIMIT_FILE_SIZE' ? 'slip_too_large' : err.message === 'ประเภทไฟล์ไม่ถูกต้อง' ? 'slip_invalid_type' : 'upload_failed';
        return res.redirect(`/event-booth/track/${encodeURIComponent(req.params.token)}?error=${code}`);
    });
}

router.get('/event-booth', eventBoothCtrl.getForm);
router.post('/event-booth', eventBoothLimiter, eventBoothCtrl.submitForm);
router.get('/event-booth/track/:token', eventBoothCtrl.getTrackPage);
router.post('/event-booth/track/:token/slip', eventBoothLimiter, handleSlipUpload, eventBoothCtrl.uploadSlip);
router.post('/event-booth/track/:token/remove-slip', eventBoothCtrl.removeSlip);

module.exports = router;
