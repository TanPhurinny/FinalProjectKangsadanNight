// middlewares/auth.js
const isStaffOrAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login?error=session_expired');
    }
    if (req.session.user.role === 'ADMIN' || req.session.user.role === 'STAFF') {
        return next();
    }
    res.status(403).render('index', { 
        user: req.session.user, 
        error: "คุณไม่มีสิทธิ์เข้าถึงส่วนการจัดการระบบ" 
    });
};

const isAdminOnly = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'ADMIN') {
        return next();
    }
    res.redirect('/admin/dashboard?error=admin_only');
};

module.exports = { isStaffOrAdmin, isAdminOnly };