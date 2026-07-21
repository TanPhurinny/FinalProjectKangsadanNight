const rateLimit = require('express-rate-limit');

// ครอบทุก route เป็นด่านแรก กันการยิงถล่ม (DoS/brute-force) ที่ไม่ใช่ endpoint auth
// โดยเฉพาะ (ซึ่งมี limiter ที่เข้มกว่านี้อยู่แล้วสำหรับ login/register/forgot-password)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'มีการเรียกใช้งานถี่เกินไป กรุณาลองใหม่อีกครั้งในภายหลัง'
    }
});

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
    registerLimiter,
    generalLimiter
};