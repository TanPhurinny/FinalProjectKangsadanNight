const express = require('express');
const router = express.Router();
const multer = require('multer');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/jwtAuth');
const { authLimiter, forgotPasswordLimiter, registerLimiter } = require('../middlewares/authRateLimit');

// ตั้งค่า multer รับข้อมูลฟอร์มที่มีรูปภาพ
const upload = multer();

// หน้า Login & Register UI
router.get('/login', (req, res) => {
    return authController.renderLoginPage(req, res);
});

// ระบบ Login
router.post('/api/auth/login', authLimiter, authController.login);
router.post('/login', authLimiter, authController.login);

// ระบบ Register
router.post('/api/auth/register', registerLimiter, upload.single('productImage'), authController.register);
router.post('/register', registerLimiter, upload.single('productImage'), authController.register);

// ระบบลืมรหัสผ่าน
router.post('/api/auth/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);

// ระบบ Logout
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

// ดูโปรไฟล์ของตัวเอง
router.get('/profile', requireAuth, authController.getProfile);

// อัปเดตโปรไฟล์ของตัวเอง
router.post('/profile', requireAuth, authController.updateProfile);

module.exports = router;