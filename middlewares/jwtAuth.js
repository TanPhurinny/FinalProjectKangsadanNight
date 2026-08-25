const { jwtVerify } = require('jose');
const { getJwtSecretKey } = require('../config/authSecrets');
const prisma = require('../config/prismaClient');

const JWT_SECRET_KEY = getJwtSecretKey();

// role ใน JWT/session เป็นค่าตอนล็อกอิน ไม่อัปเดตอัตโนมัติเมื่อแอดมินเปลี่ยน role ทีหลัง
// (เช่น อนุมัติคำขอเป็นพ่อค้าแม่ค้า) จึงต้องดึง role ล่าสุดจาก DB มาทับทุกครั้งที่ระบุตัวตนผู้ใช้
// เพื่อให้หน้าจอรีเซตเป็นข้อมูลพ่อค้าแม่ค้าได้ทันทีโดยไม่ต้อง logout/login ใหม่
async function refreshUserRole(user) {
    if (!user || !user.id) return user;

    try {
        const dbUser = await prisma.user.findUnique({
            where: { id: Number(user.id) },
            select: { role: true }
        });

        if (dbUser && dbUser.role !== user.role) {
            return { ...user, role: dbUser.role };
        }
    } catch (error) {
        // DB ใช้งานไม่ได้ชั่วคราว: ใช้ role เดิมจาก token/session ไปก่อน
    }

    return user;
}

async function verifyToken(token) {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    return payload;
}

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

    return res.redirect('/');
}

async function getCurrentUser(req) {
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
            const decoded = await refreshUserRole(await verifyToken(token));
            req.authUser = decoded;
            req.user = decoded;
            return decoded;
        } catch (error) {
            // token ไม่ถูกต้อง/หมดอายุ ลองใช้ session แทนแล้วค่อย fail
        }
    }

    if (req.session?.user) {
        req.user = await refreshUserRole(req.session.user);
        return req.user;
    }

    return null;
}

exports.requireAuth = async (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (token) {
        try {
            req.authUser = await refreshUserRole(await verifyToken(token));
            req.user = req.authUser;
            return next();
        } catch (error) {
            return sendUnauthorized(req, res, 'token ไม่ถูกต้องหรือหมดอายุ');
        }
    }

    if (req.session?.user) {
        req.user = await refreshUserRole(req.session.user);
        return next();
    }

    return sendUnauthorized(req, res, 'กรุณาเข้าสู่ระบบก่อนใช้งาน');
};


exports.getCurrentUser = getCurrentUser;