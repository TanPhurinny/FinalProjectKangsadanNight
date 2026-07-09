const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/authSecrets');

const JWT_SECRET = getJwtSecret();

function getTokenFromRequest(req) {
    const authHeader = String(req.headers.authorization || '');

    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
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
        return req.authUser;
    }

    const token = getTokenFromRequest(req);

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.authUser = decoded;
            return decoded;
        } catch (error) {
            return null;
        }
    }

    return null;
}

exports.requireAuth = (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (!token) {
        return sendUnauthorized(req, res, 'กรุณาเข้าสู่ระบบก่อนใช้งาน');
    }

    try {
        req.authUser = jwt.verify(token, JWT_SECRET);
        req.user = req.authUser;
        return next();
    } catch (error) {
        return sendUnauthorized(req, res, 'token ไม่ถูกต้องหรือหมดอายุ');
    }
};

exports.getCurrentUser = getCurrentUser;