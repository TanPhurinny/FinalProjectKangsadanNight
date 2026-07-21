const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/authSecrets');

const JWT_SECRET = getJwtSecret();

function getTokenFromRequest(req) {
    const authHeader = String(req.headers.authorization || '');

    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    // token ต่อแท็บ (ดู public/js/common/tabSession.js) มาก่อน cookie/session
    // เพราะ cookie และ session ถูกแชร์กันทุกแท็บของเบราว์เซอร์เดียวกัน
    if (req.query && req.query.tabToken) {
        return req.query.tabToken;
    }

    if (req.body && req.body.tabToken) {
        return req.body.tabToken;
    }

    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }

    return null;
}

function sendUnauthorized(req, res, message) {
    const wantsJson = req.originalUrl.startsWith('/api/') || String(req.headers.accept || '').includes('application/json');

    if (wantsJson) {
        return res.status(401).json({
            success: false,
            message
        });
    }

    return res.redirect('/login?error=unauthorized');
}

function getCurrentUser(req) {
    if (req.user) {
        return req.user;
    }

    if (req.authUser) {
        req.user = req.authUser;
        return req.user;
    }

    // token (header/query/body/cookie) มาก่อน req.session.user เสมอ เพราะ session
    // ผูกกับ cookie ที่แชร์กันทุกแท็บ ส่วน token ต่อแท็บทำให้แต่ละแท็บเป็นคนละ role ได้
    const token = getTokenFromRequest(req);

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.authUser = decoded;
            req.user = decoded;
            return decoded;
        } catch (error) {
            // token ไม่ถูกต้อง/หมดอายุ ลองใช้ session แทนแล้วค่อย fail
        }
    }

    if (req.session?.user) {
        req.user = req.session.user;
        return req.user;
    }

    return null;
}

exports.requireAuth = (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (token) {
        try {
            req.authUser = jwt.verify(token, JWT_SECRET);
            req.user = req.authUser;
            return next();
        } catch (error) {
            return sendUnauthorized(req, res, 'token ไม่ถูกต้องหรือหมดอายุ');
        }
    }

    if (req.session?.user) {
        req.user = req.session.user;
        return next();
    }

    return sendUnauthorized(req, res, 'กรุณาเข้าสู่ระบบก่อนใช้งาน');
};


exports.getCurrentUser = getCurrentUser;