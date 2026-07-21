const { getCurrentUser } = require('./jwtAuth');

async function isStaffOrAdmin(req, res, next) {
    const user = await getCurrentUser(req);

    if (!user) {
        return res.redirect('/login?error=session_expired');
    }

    if (user.role === 'ADMIN' || user.role === 'STAFF') {
        req.user = user;
        return next();
    }

    return res.status(403).render('index', {
        user,
        error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนการจัดการระบบ'
    });
}

async function isAdminOnly(req, res, next) {
    const user = await getCurrentUser(req);

    if (user && user.role === 'ADMIN') {
        req.user = user;
        return next();
    }

    return res.status(403).send('สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น');
}

module.exports = { isStaffOrAdmin, isAdminOnly };