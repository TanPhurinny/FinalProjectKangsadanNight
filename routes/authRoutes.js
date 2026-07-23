const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/jwtAuth');
const { authLimiter, forgotPasswordLimiter, registerLimiter } = require('../middlewares/authRateLimit');

// หน้า Login & Register UI
router.get('/login', (req, res) => {
    return authController.renderLoginPage(req, res);
});

// ระบบ Login
router.post('/api/auth/login', authLimiter, authController.login);
router.post('/login', authLimiter, authController.login);

// ระบบ Register
router.post('/api/auth/register', registerLimiter, authController.register);
router.post('/register', registerLimiter, authController.register);

// ระบบลืมรหัสผ่าน (ขอลิงก์รีเซ็ตทางอีเมล)
router.post('/api/auth/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);

// ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล
router.get('/reset-password', authController.renderResetPasswordPage);
router.post('/api/auth/reset-password', forgotPasswordLimiter, authController.resetPassword);
router.post('/reset-password', forgotPasswordLimiter, authController.resetPassword);

// ระบบ Logout
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

// สลับมุมมองพ่อค้าแม่ค้า <-> ลูกค้าทั่วไป (บัญชี SELLER เท่านั้น, role จริงไม่เปลี่ยน)
router.get('/switch-view/customer', requireAuth, authController.switchToCustomerView);
router.get('/switch-view/seller', requireAuth, authController.switchToSellerView);

// ดูโปรไฟล์ของตัวเอง
router.get('/profile', requireAuth, authController.getProfile);

// อัปเดตโปรไฟล์ของตัวเอง
router.post('/profile', requireAuth, authController.updateProfile);

module.exports = router;