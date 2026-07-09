const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง'
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'สมัครสมาชิกบ่อยเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง'
    }
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'รีเซ็ตรหัสผ่านบ่อยเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง'
    }
});

module.exports = {
    authLimiter,
    forgotPasswordLimiter,
    registerLimiter
};